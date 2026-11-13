import { Decimal, importe } from '@/compartido/dinero'
import { importeSerializado } from '@/compartido/formato'
import { NoEncontrado } from '@/compartido/errores'
import {
  exigible,
  montoExigible,
  recargoMaximo,
  recargoVigente,
} from '@/dominio/liquidacion/vencimientos'
import { ordenarUnidades } from '@/dominio/unidades/division'
import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { deudaDeUnidad } from '@/aplicacion/pagos/registrar'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * La expensa de una unidad, para quien tiene derecho a verla (`FR-018`,
 * `CU-06`, regla RN-12 § 7.2).
 *
 * Es la segunda condicion de fila del sistema, despues de la de ocupaciones:
 * el consorcista ve **su** unidad y ninguna otra. Una ajena responde «no
 * encontrado», nunca «prohibido», para no revelar que existe (SC-008).
 */

const SEGUNDOS_DE_LECTURA = 600

/** Lo que debe la unidad hoy, ya des-arrastrado (`deudaDeUnidad`). */
type Deuda = Awaited<ReturnType<typeof deudaDeUnidad>>

/**
 * Como viene cobrada **esta** expensa. No es un campo de la liquidacion: sale
 * de lo imputado contra su total, igual que la morosidad del consorcio
 * (`saldoImpagoPorUnidad`). Separar `vencida` de `pendiente` es lo que
 * distingue al que se atraso del que todavia esta en termino.
 */
export type EstadoPagoExpensa = 'pagada' | 'vencida' | 'pendiente'

/** Un tramo de vencimiento congelado, con el monto a pagar si se abona en el. */
export interface TramoExpensa {
  orden: number
  /** ISO `AAAA-MM-DD`. */
  fecha: string
  recargoPorcentaje: string
  /** Lo que habria que pagar de esta expensa dentro de este tramo (saldo + recargo). */
  monto: string
}

export interface ExpensaVisible {
  detalleId: string
  designacion: string
  periodoId: string
  periodo: string
  /** El ultimo vencimiento (el que vence en firme). ISO `AAAA-MM-DD`. */
  vencimiento: string
  totalUnidad: string
  /** Lo que falta pagar de capital, `'0.00'` si esta saldada. Cadena, como todo importe. */
  saldo: string
  /**
   * Lo que hay que pagar HOY: saldo + recargo del tramo vigente, `'0.00'` si
   * saldada. En la ultima expensa vigente es el **consolidado** (lo arrastrado
   * incluido): el mismo monto que cobra el pago en linea, al centavo.
   */
  exigibleHoy: string
  /** El recargo en pesos aplicable hoy sobre el saldo. */
  recargo: string
  /** El recargo mas alto del escalonado: el que se arrastra pasado el firme. */
  recargoArrastre: string
  /** La tasa de mora mensual del consorcio, que suma cada liquidacion que la arrastra. */
  tasaMora: string
  /** El porcentaje del tramo vigente (`'0.0000'` si es el base o vencio en firme). */
  recargoPorcentaje: string
  /** Verdadero si ya paso el ultimo vencimiento: la expensa vence en firme. */
  venceEnFirme: boolean
  /**
   * Es la ultima vigente de la unidad: la que se paga, con lo arrastrado. Una
   * anterior impaga se paga con esta, asi que no lleva instrucciones (RF-09, A7).
   */
  esUltima: boolean
  /**
   * Es la ultima vigente, vencio en firme y debe: no se acepta ningun pago hasta
   * la liquidacion siguiente, que le suma el recargo y la mora (RF-08).
   */
  bloqueada: boolean
  /** Los tramos de vencimiento, con el monto a pagar en cada uno. */
  vencimientos: TramoExpensa[]
  estadoPago: EstadoPagoExpensa
  /** Nulo mientras el documento no se genero: la liquidacion ya existe igual. */
  direccion: string | null
  /** Como pagar por fuera de la pasarela, escrito por el administrador (RF-09). */
  instruccionesDePago: string | null
}

export interface UnidadConExpensas {
  unidadId: string
  designacion: string
  expensas: ExpensaVisible[]
}

/** Las unidades que el usuario ocupa hoy, sea cual sea su rol. */
export async function unidadesPropias(
  usuarioId: string,
  hoy: Date,
): Promise<{ id: string; designacion: string }[]> {
  const usuario = await prismaBase.usuario.findUnique({
    where: { id: usuarioId },
    select: { personaId: true },
  })
  if (!usuario) return []

  // Ocupacion vigente hoy, de cualquier tipo: el inquilino tambien recibe la
  // expensa, porque la ordinaria es suya (regla RN-05).
  const ocupadas = await prismaBase.$queryRaw<{ unidad_id: string }[]>`
    SELECT DISTINCT "unidad_id" FROM "Ocupacion"
    WHERE "persona_id" = ${usuario.personaId}::uuid AND "vigencia" @> ${hoy}::date
  `

  // El aislamiento vuelve a filtrar: una ocupacion sobre una unidad de otro
  // consorcio no aparece, aunque exista.
  const unidades = await prisma.unidad.findMany({
    where: { id: { in: ocupadas.map((fila) => fila.unidad_id) } },
    select: { id: true, designacion: true },
  })
  return ordenarUnidades(unidades)
}

/**
 * Las unidades que el usuario puede ver: todas si es administrador o consejo,
 * y solo las que ocupa si es consorcista.
 */
export async function unidadesAlcanzables(
  usuarioId: string,
  roles: readonly string[],
  hoy: Date,
): Promise<{ id: string; designacion: string }[]> {
  if (roles.includes('administrador') || roles.includes('consejo')) {
    const unidades = await prisma.unidad.findMany({
      select: { id: true, designacion: true },
    })
    return ordenarUnidades(unidades)
  }

  return unidadesPropias(usuarioId, hoy)
}

type DatosExpensas = { usuarioId: string; consorcioId: string }

function expensasDeUnidades(
  almacen: AlmacenObjetos,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: DatosExpensas,
  cuales: (roles: readonly string[]) => Promise<{ id: string; designacion: string }[]>,
): Promise<UnidadConExpensas[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver expensas' },
    async (acceso) => {
      const unidades = await cuales(acceso.roles)

      return Promise.all(
        unidades.map(async (unidad) => ({
          unidadId: unidad.id,
          designacion: unidad.designacion,
          expensas: await expensasDe(almacen, unidad.id, reloj.hoy()),
        })),
      )
    },
  )
}

/** Solo las unidades que el usuario ocupa, sea cual sea su rol. */
export function misExpensas(
  almacen: AlmacenObjetos,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: DatosExpensas,
): Promise<UnidadConExpensas[]> {
  return expensasDeUnidades(almacen, repositorio, reloj, datos, () =>
    unidadesPropias(datos.usuarioId, reloj.hoy()),
  )
}

/** Todas las unidades que el rol alcanza (administrador y consejo: todas). */
export function expensasAlcanzables(
  almacen: AlmacenObjetos,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: DatosExpensas,
): Promise<UnidadConExpensas[]> {
  return expensasDeUnidades(almacen, repositorio, reloj, datos, (roles) =>
    unidadesAlcanzables(datos.usuarioId, roles, reloj.hoy()),
  )
}

/** Una sola, por identificador directo: es la que el consorcista abre o descarga. */
export async function verExpensa(
  almacen: AlmacenObjetos,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; detalleId: string },
): Promise<ExpensaVisible> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver expensas' },
    async (acceso) => {
      const alcanzables = await unidadesAlcanzables(datos.usuarioId, acceso.roles, reloj.hoy())

      const detalle = await prismaBase.detalleLiquidacion.findUnique({
        where: { id: datos.detalleId },
        include: {
          liquidacion: { include: { periodo: true, vencimientos: true, consorcio: true } },
          unidad: true,
        },
      })

      if (
        !detalle ||
        detalle.liquidacion.estado !== 'vigente' ||
        !alcanzables.some((unidad) => unidad.id === detalle.unidadId)
      ) {
        throw new NoEncontrado()
      }

      // El saldo de esta expensa sale del des-arrastre sobre TODAS las
      // liquidaciones vigentes de la unidad, no de esta fila suelta: `totalUnidad`
      // arrastra la deuda anterior y los pagos se imputan contra el saldo propio
      // de cada periodo (la misma lectura que el pago manual y en linea).
      const deuda = await deudaDeUnidad(detalle.unidadId, reloj.hoy())

      return aVisible(almacen, detalle, reloj.hoy(), deuda)
    },
  )
}

type DetalleConContexto = NonNullable<
  Awaited<
    ReturnType<
      typeof prismaBase.detalleLiquidacion.findFirst<{
        include: {
          liquidacion: { include: { periodo: true; vencimientos: true; consorcio: true } }
          unidad: true
        }
      }>
    >
  >
>

async function expensasDe(
  almacen: AlmacenObjetos,
  unidadId: string,
  hoy: Date,
): Promise<ExpensaVisible[]> {
  const detalles = await prismaBase.detalleLiquidacion.findMany({
    where: { unidadId, liquidacion: { estado: 'vigente' } },
    include: {
      liquidacion: { include: { periodo: true, vencimientos: true, consorcio: true } },
      unidad: true,
    },
    orderBy: { liquidacion: { emitidaEn: 'desc' } },
  })

  // Un solo des-arrastre sobre todas las vigentes de la unidad; cada expensa
  // toma su saldo de ahi, no de su `totalUnidad` (que incluye el arrastre).
  const deuda = await deudaDeUnidad(unidadId, hoy)

  return Promise.all(detalles.map((detalle) => aVisible(almacen, detalle, hoy, deuda)))
}

async function aVisible(
  almacen: AlmacenObjetos,
  detalle: DetalleConContexto,
  hoy: Date,
  deuda: Deuda,
): Promise<ExpensaVisible> {
  const { periodo } = detalle.liquidacion
  const propio = deuda.impagos.find((i) => i.detalleId === detalle.id)
  const saldo = importe(propio?.saldo ?? '0')
  const saldoPositivo = Decimal.max(saldo, 0)
  // La ultima vigente se paga con todo lo arrastrado: su base es la deuda total.
  const esUltima = deuda.ultimaId === detalle.id
  const base = esUltima ? importe(deuda.saldoTotal) : saldoPositivo

  // Los tramos congelados (RF-08). Una liquidacion emitida antes de la regla no
  // tiene filas: se usa su vencimiento unico como un solo tramo sin recargo, de
  // modo que se comporta como antes.
  const tramos =
    detalle.liquidacion.vencimientos.length > 0
      ? detalle.liquidacion.vencimientos
          .map((v) => ({
            orden: v.orden,
            fecha: v.fecha,
            recargoPorcentaje: v.recargoPorcentaje.toFixed(4),
          }))
          .sort((a, b) => a.orden - b.orden)
      : [{ orden: 1, fecha: detalle.liquidacion.vencimiento, recargoPorcentaje: '0.0000' }]

  const vigente = recargoVigente(tramos, hoy)
  const exigibleHoy = saldoPositivo.lessThanOrEqualTo(0)
    ? '0.00'
    : esUltima
      ? exigible(deuda.impagos)
      : montoExigible(saldoPositivo.toFixed(2), vigente.recargoPorcentaje)
  const recargo = Decimal.max(importe(exigibleHoy).minus(base), 0).toFixed(2)

  // El saldo ya viene des-arrastrado (saldo propio del periodo, no `totalUnidad`):
  // una expensa saldada queda en cero aunque su total siga arrastrando la deuda
  // anterior (RN-08, nota #4). Vencida solo cuando paso el ultimo vencimiento
  // (vence en firme); antes de eso sigue "pendiente" aunque escale el recargo.
  const estadoPago: EstadoPagoExpensa = saldo.lessThanOrEqualTo(0)
    ? 'pagada'
    : vigente.venceEnFirme
      ? 'vencida'
      : 'pendiente'

  return {
    detalleId: detalle.id,
    designacion: detalle.unidad.designacion,
    periodoId: periodo.id,
    periodo: `${String(periodo.mes).padStart(2, '0')}/${periodo.anio}`,
    vencimiento: detalle.liquidacion.vencimiento.toISOString().slice(0, 10),
    totalUnidad: importeSerializado(detalle.totalUnidad),
    // Nunca negativo en pantalla: un pago de mas es saldo a favor de la unidad,
    // y vive en el estado de cuenta, no en la expensa que ya quedo saldada.
    saldo: saldoPositivo.toFixed(2),
    exigibleHoy,
    recargo,
    recargoPorcentaje: vigente.recargoPorcentaje,
    recargoArrastre: recargoMaximo(tramos),
    tasaMora: detalle.liquidacion.consorcio.tasaMoraMensual.toFixed(4),
    venceEnFirme: vigente.venceEnFirme,
    esUltima,
    bloqueada: esUltima && deuda.bloqueado,
    vencimientos: tramos.map((t) => ({
      orden: t.orden,
      fecha: t.fecha.toISOString().slice(0, 10),
      recargoPorcentaje: t.recargoPorcentaje,
      monto: montoExigible(base.toFixed(2), t.recargoPorcentaje),
    })),
    estadoPago,
    direccion: detalle.claveDocumento
      ? await almacen
          .resolverLecturaAutorizada(detalle.claveDocumento, SEGUNDOS_DE_LECTURA)
          // Un PDF que ya no está en el almacén deja la fila sin documento: no tira la lista.
          .catch((error: unknown) => {
            if (error instanceof NoEncontrado) return null
            throw error
          })
      : null,
    instruccionesDePago: detalle.liquidacion.consorcio.instruccionesPago,
  }
}
