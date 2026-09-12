import { Decimal } from '@/compartido/dinero'
import { RolInsuficiente } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prismaBase } from '@/infraestructura/prisma'
import {
  desempenoProveedores,
  gastoPorRubro,
  morosidadMensual,
  precisionAsistencia,
  refrescarVistas as refrescar,
  resolucionReclamos,
  ultimoRefresco,
  type DesempenoProveedor,
  type GastoRubroPeriodo,
  type MorosidadMensual,
  type PrecisionAsistencia,
  type ResolucionReclamos,
} from '@/infraestructura/repositorios/indicadores'

/**
 * Los seis indicadores de § 12.9 (`RF-21` a `RF-25`, `CU-11`, `FR-017` a
 * `FR-023`). Leen las vistas materializadas, aplican las alertas y devuelven
 * todo como cadena. Ningun calculo monetario aca: la unica aritmetica es sobre
 * porcentajes ya redondeados en la vista, y en `Decimal`.
 *
 * Quien ve: administrador y consejo por consorcio (I-1 a I-4); solo el
 * administrador el panel consolidado, los proveedores y la carga (I-3, I-5,
 * I-6). El consorcista no entra (SC-011, escenario 5 de US3).
 */

const META_MOROSIDAD = '12'
const ALERTA_MOROSIDAD = new Decimal('15')
const ALERTA_SALTO_PUNTOS = new Decimal('3')
const ALERTA_DESVIO = new Decimal('30')
const META_URGENCIA_HORAS = '72'
const LINEA_BASE_HORAS_MENSUALES = '38'

const VE_INDICADORES = ['administrador', 'consejo'] as const

export interface Alerta {
  tipo:
    | 'morosidad_alta'
    | 'morosidad_creciente'
    | 'desvio_rubro'
    | 'rubro_sin_gasto'
    | 'urgencias_lentas'
  texto: string
}

/** I-1: serie mensual con la meta del 12 % y las dos alertas de FR-023. */
export interface Morosidad {
  serie: MorosidadMensual[]
  meta: string
  alertas: Alerta[]
}

function alertasDeMorosidad(serie: MorosidadMensual[]): Alerta[] {
  const alertas: Alerta[] = []
  const ultimo = serie.at(-1)
  if (!ultimo?.porcentaje) return alertas
  const actual = new Decimal(ultimo.porcentaje)
  if (actual.greaterThan(ALERTA_MOROSIDAD)) {
    alertas.push({
      tipo: 'morosidad_alta',
      texto: `La morosidad del último período es ${ultimo.porcentaje} %, por encima del 15 %.`,
    })
  }
  const dosAtras = serie.at(-3)
  if (
    dosAtras?.porcentaje &&
    actual.minus(dosAtras.porcentaje).greaterThanOrEqualTo(ALERTA_SALTO_PUNTOS)
  ) {
    alertas.push({
      tipo: 'morosidad_creciente',
      texto: `La morosidad subió ${actual.minus(dosAtras.porcentaje).toFixed(2)} puntos en dos meses.`,
    })
  }
  return alertas
}

export async function verMorosidad(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<Morosidad> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: VE_INDICADORES,
      accion: 'ver los indicadores',
    },
    async () => {
      const serie = await morosidadMensual()
      return { serie, meta: META_MOROSIDAD, alertas: alertasDeMorosidad(serie) }
    },
  )
}

/** I-2: gasto por rubro y período; desvíos > 30 % destacados; rubros recurrentes sin gasto en el último período. */
export interface GastoPorRubro {
  filas: (GastoRubroPeriodo & { desviado: boolean; historiaInsuficiente: boolean })[]
  alertas: Alerta[]
}

export async function verGastoPorRubro(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<GastoPorRubro> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: VE_INDICADORES,
      accion: 'ver los indicadores',
    },
    async () => {
      const filas = gastoPorRubro().then((f) =>
        f.map((fila) => ({
          ...fila,
          desviado:
            fila.desvioPorcentual !== null &&
            new Decimal(fila.desvioPorcentual).abs().greaterThan(ALERTA_DESVIO),
          historiaInsuficiente: fila.promedioMovil12 === null,
        })),
      )
      const todas = await filas
      const alertas: Alerta[] = todas
        .filter((f) => f.desviado)
        .map((f) => ({
          tipo: 'desvio_rubro' as const,
          texto: `${f.rubro} ${String(f.mes).padStart(2, '0')}/${f.anio}: desvío del ${f.desvioPorcentual} % contra el promedio de doce períodos.`,
        }))

      // Rubro recurrente: con gasto en al menos seis de los ultimos doce periodos
      // y sin gasto en el ultimo periodo con gastos del consorcio.
      const periodos = [
        ...new Set(todas.map((f) => `${f.anio}-${String(f.mes).padStart(2, '0')}`)),
      ].sort()
      const ultimo = periodos.at(-1)
      const ventana = new Set(periodos.slice(-13, -1))
      if (ultimo) {
        const porRubro = new Map<string, { nombre: string; enVentana: number; enUltimo: boolean }>()
        for (const f of todas) {
          const clave = `${f.anio}-${String(f.mes).padStart(2, '0')}`
          const r = porRubro.get(f.rubroId) ?? { nombre: f.rubro, enVentana: 0, enUltimo: false }
          if (ventana.has(clave)) r.enVentana++
          if (clave === ultimo) r.enUltimo = true
          porRubro.set(f.rubroId, r)
        }
        for (const r of porRubro.values()) {
          if (r.enVentana >= 6 && !r.enUltimo) {
            alertas.push({
              tipo: 'rubro_sin_gasto',
              texto: `${r.nombre} no tiene gasto en ${ultimo.split('-').reverse().join('/')} y es recurrente.`,
            })
          }
        }
      }
      return { filas: todas, alertas }
    },
  )
}

/** I-3. */
export async function verProveedores(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<DesempenoProveedor[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'ver el desempeño de proveedores',
    },
    () => desempenoProveedores(),
  )
}

/** I-4: mediana y p90 por rubro y urgencia, con la meta de 72 h para urgencias. */
export interface Resolucion {
  filas: (ResolucionReclamos & { fueraDeMeta: boolean })[]
  metaHoras: string
  alertas: Alerta[]
}

export async function verResolucionReclamos(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<Resolucion> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: VE_INDICADORES,
      accion: 'ver los indicadores',
    },
    async () => {
      const filas = (await resolucionReclamos()).map((f) => ({
        ...f,
        fueraDeMeta:
          (f.urgencia === 'critica' || f.urgencia === 'alta') &&
          new Decimal(f.medianaHoras).greaterThan(META_URGENCIA_HORAS),
      }))
      const alertas: Alerta[] = filas
        .filter((f) => f.fueraDeMeta)
        .map((f) => ({
          tipo: 'urgencias_lentas' as const,
          texto: `${f.rubro ?? 'Sin rubro'} (${f.urgencia}): mediana de ${f.medianaHoras} h, sobre la meta de 72 h.`,
        }))
      return { filas, metaHoras: META_URGENCIA_HORAS, alertas }
    },
  )
}

/** I-5: carga administrativa contra la línea de base de 38 h mensuales del punto 2.7. */
export interface CargaAdministrativa {
  serie: (PrecisionAsistencia & { proporcionSinCorreccion: string | null })[]
  lineaBaseHoras: string
}

export async function verCargaAdministrativa(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<CargaAdministrativa> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'ver la carga administrativa',
    },
    async () => {
      const serie = (await precisionAsistencia()).map((f) => ({
        ...f,
        proporcionSinCorreccion:
          f.extraccionesConfirmadas > 0
            ? new Decimal(f.sinCorreccion)
                .times(100)
                .dividedBy(f.extraccionesConfirmadas)
                .toFixed(1)
            : null,
      }))
      return { serie, lineaBaseHoras: LINEA_BASE_HORAS_MENSUALES }
    },
  )
}

/** I-6: la cartera entera del administrador, sobre las vistas. Cero consultas a tablas base. */
export interface PanelConsolidado {
  consorcios: {
    id: string
    nombre: string
    ultimoPeriodo: string | null
    morosidad: string | null
    unidadesEnMora: number
    reclamosAbiertos: number
    reclamosCriticos: number
    alertasDeGasto: number
  }[]
  morosidadCartera: string | null
  meta: string
  refrescadoEn: string | null
}

export async function verPanel(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string },
): Promise<PanelConsolidado> {
  const alcanzables = await repositorio.consorciosDe(datos.usuarioId, reloj.hoy())
  // Solo los consorcios donde es administrador: el panel es del que decide.
  const administrados: string[] = []
  for (const consorcioId of alcanzables) {
    const acceso = await repositorio.accesoVigente(datos.usuarioId, consorcioId, reloj.hoy())
    if (acceso?.roles.includes('administrador')) administrados.push(consorcioId)
  }
  if (administrados.length === 0) throw new RolInsuficiente('ver el panel de indicadores')

  const [consorcios, morosidad, gastos, refrescadoEn] = await Promise.all([
    prismaBase.consorcio.findMany({
      where: { id: { in: administrados } },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    morosidadMensual(administrados),
    gastoPorRubro(administrados),
    ultimoRefresco(),
  ])
  // Reclamos abiertos: no hay vista de "abiertos ahora" porque cambia a cada
  // hora; es un conteo indexado por (consorcio, estado), no una agregacion.
  const abiertos = await prismaBase.reclamo.groupBy({
    by: ['consorcioId', 'urgencia'],
    where: {
      consorcioId: { in: administrados },
      estado: { in: ['abierto', 'asignado', 'en_curso'] },
    },
    _count: { _all: true },
  })

  let deudaCartera = new Decimal(0)
  let masaCartera = new Decimal(0)
  const filas = consorcios.map((c) => {
    const serie = morosidad.filter((m) => m.consorcioId === c.id)
    const ultimo = serie.at(-1)
    if (ultimo) {
      deudaCartera = deudaCartera.plus(ultimo.deudaVencida)
      masaCartera = masaCartera.plus(ultimo.masaLiquidada)
    }
    const deEste = abiertos.filter((a) => a.consorcioId === c.id)
    return {
      id: c.id,
      nombre: c.nombre,
      ultimoPeriodo: ultimo ? `${String(ultimo.mes).padStart(2, '0')}/${ultimo.anio}` : null,
      morosidad: ultimo?.porcentaje ?? null,
      unidadesEnMora: ultimo?.unidadesEnMora ?? 0,
      reclamosAbiertos: deEste.reduce((t, a) => t + a._count._all, 0),
      reclamosCriticos: deEste
        .filter((a) => a.urgencia === 'critica')
        .reduce((t, a) => t + a._count._all, 0),
      alertasDeGasto: gastos.filter(
        (g) =>
          g.consorcioId === c.id &&
          g.desvioPorcentual !== null &&
          new Decimal(g.desvioPorcentual).abs().greaterThan(ALERTA_DESVIO),
      ).length,
    }
  })

  return {
    consorcios: filas,
    morosidadCartera: masaCartera.isZero()
      ? null
      : deudaCartera.times(100).dividedBy(masaCartera).toDecimalPlaces(2).toFixed(2),
    meta: META_MOROSIDAD,
    refrescadoEn: refrescadoEn?.toISOString() ?? null,
  }
}

/** El botón «actualizar ahora» del panel; la tarea programada entra por su propia ruta. */
export async function refrescarVistas(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<Date> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'actualizar los indicadores',
    },
    () => refrescar(),
  )
}

/** Para la tarea programada: no hay usuario, el secreto lo verifica la ruta. */
export const refrescarVistasProgramado = (): Promise<Date> => refrescar()

export { ultimoRefresco }
