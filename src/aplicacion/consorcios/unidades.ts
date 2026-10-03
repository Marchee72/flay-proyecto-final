import { importe } from '@/compartido/dinero'
import { exigirSumaExacta, type UnidadConCoeficiente } from '@/dominio/coeficientes/suma'
import { planificarCambioDeCoeficiente } from '@/dominio/coeficientes/vigencia'
import { TIPO_UNIDAD_POR_OMISION, type TipoUnidad } from '@/dominio/unidades/tipo'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { Prisma } from '@prisma/client'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { saldoImpagoPorUnidad } from '@/aplicacion/pagos/estado-de-cuenta'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'
import { ocupantesVigentesDe } from '@/infraestructura/repositorios/ocupaciones'

/**
 * Unidades y coeficientes (RF-02, reglas RN-01 y RN-02).
 *
 * Las dos operaciones van en **una sola transaccion**: agregar una unidad
 * obliga a reajustar las demas, y hacerlo en dos pasos deja al consorcio sin
 * cuadrar en el medio. El disparador diferido de la base verifica al confirmar;
 * la verificacion de aca existe para decir cuanto falta antes de escribir.
 *
 * El filtro por consorcio no se escribe en ninguna consulta: lo pone la
 * extension del cliente, porque `Unidad` declara `consorcio_id` (Principio I).
 */

/** El cliente dentro de una transaccion, con el aislamiento ya puesto. */
type Transaccion = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** Reajuste de una unidad que ya existe, para que la suma vuelva a dar 100. */
export interface Ajuste {
  unidadId: string
  coeficiente: string
}

const aCoeficiente = (designacion: string, coeficiente: string): UnidadConCoeficiente => ({
  designacion,
  coeficiente: importe(coeficiente),
})

export class PadronYaCargado extends ErrorDeAplicacion {
  constructor() {
    super(
      'Este consorcio ya tiene unidades cargadas. Para cambiar alguna, usá «Editar padrón».',
      'RF-02',
    )
  }
}

/**
 * Carga del padron completo, en **una sola transaccion** (FR-011c).
 *
 * Es la unica forma de llenar un consorcio vacio: unidad por unidad la suma
 * nunca daria 100 y cada alta seria un rechazo. Despues de esto, agregar o
 * subdividir obliga a reajustar las demas.
 */
export async function cargarPadron(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    unidades: readonly { designacion: string; coeficiente: string; tipo?: TipoUnidad }[]
  },
): Promise<{ cargadas: number }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'cargar el padrón',
    },
    async () => {
      if ((await prisma.unidad.count()) > 0) throw new PadronYaCargado()

      exigirSumaExacta(
        datos.unidades.map((unidad) => aCoeficiente(unidad.designacion, unidad.coeficiente)),
      )

      const hoy = reloj.hoy()

      // Los identificadores se generan aca para escribir las dos tablas con dos
      // sentencias y no con doscientas: noventa y seis idas y vueltas contra una
      // base remota no entran en el tope de una transaccion interactiva. Es lo
      // mismo que hace la semilla, y lo que R-09 de `003` fija para la emision.
      const filas = datos.unidades.map((unidad) => ({
        id: crypto.randomUUID(),
        designacion: unidad.designacion,
        tipo: unidad.tipo ?? TIPO_UNIDAD_POR_OMISION,
        coeficiente: unidad.coeficiente,
      }))

      await prisma.$transaction(async (tx) => {
        await tx.unidad.createMany({ data: filas.map((fila) => sinConsorcio(fila)) })

        await tx.coeficienteHistorico.createMany({
          data: filas.map((fila) => ({
            unidadId: fila.id,
            coeficiente: fila.coeficiente,
            vigenciaDesde: hoy,
          })),
        })
      })

      return { cargadas: datos.unidades.length }
    },
  )
}

export async function agregarUnidad(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    designacion: string
    coeficiente: string
    tipo?: TipoUnidad
    ajustes?: readonly Ajuste[]
  },
): Promise<{ unidadId: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'agregar unidades',
    },
    async () => {
      const ajustes = datos.ajustes ?? []
      const existentes = await prisma.unidad.findMany({
        select: { id: true, designacion: true, coeficiente: true },
      })

      exigirSumaExacta([
        ...conAjustes(existentes, ajustes),
        aCoeficiente(datos.designacion, datos.coeficiente),
      ])

      const hoy = reloj.hoy()

      // La vigencia anterior cierra el dia **antes**, no el mismo dia: si
      // cerrara hoy, hoy contarian las dos filas y la historia sumaria doble.
      // La cuenta la hace el dominio, en un solo lugar (regla RN-02).
      const { cierreDelAnterior } = planificarCambioDeCoeficiente(reloj, {
        coeficiente: importe(datos.coeficiente),
        vigenciaDesde: hoy,
      })

      const creada = await prisma.$transaction(async (tx) => {
        for (const ajuste of ajustes) {
          await tx.unidad.update({
            where: { id: ajuste.unidadId },
            data: { coeficiente: ajuste.coeficiente },
          })
          await cerrarYAbrir(tx, ajuste.unidadId, ajuste.coeficiente, cierreDelAnterior, hoy)
        }

        const nueva = await tx.unidad.create({
          data: sinConsorcio({
            designacion: datos.designacion,
            tipo: datos.tipo ?? TIPO_UNIDAD_POR_OMISION,
            coeficiente: datos.coeficiente,
          }),
        })

        await tx.coeficienteHistorico.create({
          data: { unidadId: nueva.id, coeficiente: datos.coeficiente, vigenciaDesde: hoy },
        })

        return nueva
      })

      return { unidadId: creada.id }
    },
  )
}

/**
 * Cambio de coeficiente hacia el futuro (regla RN-02, FR-012). La vigencia
 * anterior se cierra el dia antes y ambas quedan en la historia.
 *
 * Si el cambio rige desde hoy, tambien se mueve el coeficiente vigente de la
 * unidad; si rige mas adelante, la unidad no se toca hasta esa fecha y lo que
 * queda escrito es la historia.
 */
export async function cambiarCoeficiente(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    unidadId: string
    coeficiente: string
    vigenciaDesde: Date
    ajustes?: readonly Ajuste[]
  },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'cambiar coeficientes',
    },
    async () => {
      const plan = planificarCambioDeCoeficiente(reloj, {
        coeficiente: importe(datos.coeficiente),
        vigenciaDesde: datos.vigenciaDesde,
      })

      const cambios: Ajuste[] = [
        { unidadId: datos.unidadId, coeficiente: datos.coeficiente },
        ...(datos.ajustes ?? []),
      ]

      const existentes = await prisma.unidad.findMany({
        select: { id: true, designacion: true, coeficiente: true },
      })

      exigirSumaExacta(conAjustes(existentes, cambios))

      const rigeYa = datos.vigenciaDesde <= reloj.hoy()

      await prisma.$transaction(async (tx) => {
        for (const cambio of cambios) {
          if (rigeYa) {
            await tx.unidad.update({
              where: { id: cambio.unidadId },
              data: { coeficiente: cambio.coeficiente },
            })
          }

          await cerrarYAbrir(
            tx,
            cambio.unidadId,
            cambio.coeficiente,
            plan.cierreDelAnterior,
            datos.vigenciaDesde,
          )
        }
      })
    },
  )
}

/** El conjunto que quedaria si los ajustes se aplicaran. */
function conAjustes(
  existentes: readonly { id: string; designacion: string; coeficiente: unknown }[],
  ajustes: readonly Ajuste[],
): UnidadConCoeficiente[] {
  return existentes.map((unidad) => {
    const ajuste = ajustes.find((candidato) => candidato.unidadId === unidad.id)
    return aCoeficiente(unidad.designacion, String(ajuste?.coeficiente ?? unidad.coeficiente))
  })
}

/**
 * Cierra la vigencia abierta de la unidad y abre la nueva. Las dos filas
 * quedan: la historia no se pisa, se encadena (regla RN-02).
 */
async function cerrarYAbrir(
  tx: Transaccion,
  unidadId: string,
  coeficiente: string,
  cierre: Date,
  desde: Date,
): Promise<void> {
  await tx.coeficienteHistorico.updateMany({
    where: { unidadId, vigenciaHasta: null },
    data: { vigenciaHasta: cierre },
  })

  await tx.coeficienteHistorico.create({
    data: { unidadId, coeficiente, vigenciaDesde: desde },
  })
}

export class DesignacionRepetida extends ErrorDeAplicacion {
  constructor() {
    super(
      'Hay dos unidades con la misma designación. Cada unidad necesita un nombre propio.',
      'RF-02',
    )
  }
}

export class BajaNoPermitida extends ErrorDeAplicacion {
  constructor(designacion: string, motivo: string) {
    super(`No se puede dar de baja la unidad ${designacion}: ${motivo}.`, 'RF-02')
  }
}

/** Una fila del padron editado: con `id` es una unidad que ya existe; sin `id`, una nueva. */
export interface FilaDelPadron {
  id?: string
  designacion: string
  tipo?: TipoUnidad
  coeficiente: string
  baja?: boolean
}

/**
 * Edicion del padron despues del alta (FR-011): renombrar, cambiar el tipo,
 * redistribuir coeficientes, agregar unidades y darlas de baja, **todo junto**
 * y en una sola transaccion, porque cualquier cambio de coeficiente obliga a
 * mover otros y el padron no puede quedar sin cuadrar en el medio.
 *
 * Rige desde hoy: la vigencia anterior cierra ayer (RN-02). Una fila que ya se
 * abrio hoy se corrige en su lugar, en vez de dejar una vigencia que termina
 * antes de empezar. La baja es logica: coeficiente cero y `bajaDesde`, y solo
 * si la unidad no tiene ocupantes, deuda ni reservas por delante.
 *
 * ponytail: sin vigencia futura; hoy nada promueve un coeficiente futuro a
 * `Unidad` el dia que entra en vigor. Si hace falta, primero eso.
 */
export async function editarPadron(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; unidades: readonly FilaDelPadron[] },
): Promise<{ cambiadas: number; agregadas: number; bajas: number }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'editar el padrón',
    },
    async () => {
      const hoy = reloj.hoy()
      // Aislada: un id de otro consorcio no aparece aca y se rechaza abajo.
      const existentes = new Map(
        (
          await prisma.unidad.findMany({
            where: { bajaDesde: null },
            select: { id: true, designacion: true, tipo: true, coeficiente: true },
          })
        ).map((u) => [u.id, u]),
      )

      const filas = datos.unidades
        .map((fila) => ({ ...fila, designacion: fila.designacion.trim() }))
        .filter((fila) => fila.id || fila.designacion !== '')
      for (const fila of filas) {
        if (fila.id && !existentes.has(fila.id)) throw new NoEncontrado()
      }

      // Lo que no vino en la edicion queda como estaba.
      const tocadas = new Set(filas.map((f) => f.id))
      const quedan = [
        ...[...existentes.values()]
          .filter((u) => !tocadas.has(u.id))
          .map((u) => aCoeficiente(u.designacion, u.coeficiente.toFixed(8))),
        ...filas.filter((f) => !f.baja).map((f) => aCoeficiente(f.designacion, f.coeficiente)),
      ]
      const nombres = quedan.map((u) => u.designacion)
      if (nombres.some((d) => d === '') || new Set(nombres).size !== nombres.length) {
        throw new DesignacionRepetida()
      }
      exigirSumaExacta(quedan)

      const bajas = filas
        .filter((f) => f.id && f.baja)
        .map((f) => ({ id: f.id!, designacion: existentes.get(f.id!)!.designacion }))
      await exigirQueSePuedanDarDeBaja(bajas, reloj)

      const cambiadas = filas
        .filter((f): f is FilaDelPadron & { id: string } => f.id !== undefined)
        .map((f) => {
          const antes = existentes.get(f.id)!
          const coeficiente = f.baja ? '0' : f.coeficiente
          const designacion = f.baja ? antes.designacion : f.designacion
          const tipo = f.tipo ?? antes.tipo
          return {
            id: f.id,
            designacion,
            tipo,
            coeficiente,
            baja: f.baja === true,
            otroCoeficiente: !importe(coeficiente).equals(importe(antes.coeficiente.toFixed(8))),
            otroNombre: designacion !== antes.designacion || tipo !== antes.tipo,
          }
        })
        .filter((c) => c.baja || c.otroCoeficiente || c.otroNombre)
      const nuevas = filas
        .filter((f) => !f.id && !f.baja)
        .map((f) => ({
          id: crypto.randomUUID(),
          designacion: f.designacion,
          tipo: f.tipo ?? TIPO_UNIDAD_POR_OMISION,
          coeficiente: f.coeficiente,
        }))
      const conOtroCoeficiente = cambiadas.filter((c) => c.otroCoeficiente)
      const { cierreDelAnterior } = planificarCambioDeCoeficiente(reloj, {
        coeficiente: importe('0'),
        vigenciaDesde: hoy,
      })

      try {
        // Por lote y no fila por fila: noventa y seis unidades redistribuidas
        // contra la base remota no entran en el tope de la transaccion
        // (decision 11). Los ids salen de la consulta aislada de arriba.
        await prisma.$transaction(
          async (tx) => {
            if (cambiadas.length > 0) {
              await tx.$executeRaw`
                UPDATE "Unidad" u
                SET designacion = c.designacion,
                    tipo = c.tipo::"TipoUnidad",
                    coeficiente = c.coeficiente::numeric,
                    baja_desde = CASE WHEN c.baja THEN ${hoy}::date ELSE u.baja_desde END,
                    actualizado_en = CURRENT_TIMESTAMP
                FROM unnest(
                  ${cambiadas.map((c) => c.id)}::uuid[],
                  ${cambiadas.map((c) => c.designacion)}::text[],
                  ${cambiadas.map((c) => c.tipo)}::text[],
                  ${cambiadas.map((c) => c.coeficiente)}::text[],
                  ${cambiadas.map((c) => c.baja)}::boolean[]
                ) AS c(id, designacion, tipo, coeficiente, baja)
                WHERE u.id = c.id`
            }

            if (conOtroCoeficiente.length > 0) {
              await moverVigencias(tx, conOtroCoeficiente, hoy, cierreDelAnterior)
            }

            if (nuevas.length > 0) {
              await tx.unidad.createMany({ data: nuevas.map((n) => sinConsorcio(n)) })
              await tx.coeficienteHistorico.createMany({
                data: nuevas.map((n) => ({
                  unidadId: n.id,
                  coeficiente: n.coeficiente,
                  vigenciaDesde: hoy,
                })),
              })
            }
          },
          { timeout: 20_000 },
        )
      } catch (error) {
        const repetida =
          (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') ||
          (error instanceof Error && /Unidad_consorcio_id_designacion_key/.test(error.message))
        if (repetida) throw new DesignacionRepetida()
        throw error
      }

      return {
        cambiadas: cambiadas.filter((c) => !c.baja).length,
        agregadas: nuevas.length,
        bajas: bajas.length,
      }
    },
  )
}

/**
 * El nuevo coeficiente rige desde hoy: la vigencia abierta cierra ayer y se
 * abre otra. Si la abierta empezo hoy mismo, se corrige en su lugar.
 */
async function moverVigencias(
  tx: Transaccion,
  cambios: readonly { id: string; coeficiente: string }[],
  hoy: Date,
  cierreDelAnterior: Date,
): Promise<void> {
  const abiertas = await tx.coeficienteHistorico.findMany({
    where: { unidadId: { in: cambios.map((c) => c.id) }, vigenciaHasta: null },
    select: { id: true, unidadId: true, vigenciaDesde: true },
  })
  const coeficienteDe = new Map(cambios.map((c) => [c.id, c.coeficiente]))
  const deHoy = abiertas.filter((a) => a.vigenciaDesde.getTime() === hoy.getTime())
  const anteriores = abiertas.filter((a) => a.vigenciaDesde < hoy)

  if (deHoy.length > 0) {
    await tx.$executeRaw`
      UPDATE "CoeficienteHistorico" h
      SET coeficiente = c.coeficiente::numeric, actualizado_en = CURRENT_TIMESTAMP
      FROM unnest(
        ${deHoy.map((a) => a.id)}::uuid[],
        ${deHoy.map((a) => coeficienteDe.get(a.unidadId)!)}::text[]
      ) AS c(id, coeficiente)
      WHERE h.id = c.id`
  }
  await tx.coeficienteHistorico.updateMany({
    where: { id: { in: anteriores.map((a) => a.id) } },
    data: { vigenciaHasta: cierreDelAnterior },
  })
  await tx.coeficienteHistorico.createMany({
    data: anteriores.map((a) => ({
      unidadId: a.unidadId,
      coeficiente: coeficienteDe.get(a.unidadId)!,
      vigenciaDesde: hoy,
    })),
  })
}

/** Sin ocupantes, sin deuda (vencida o no) y sin reservas por delante. */
async function exigirQueSePuedanDarDeBaja(
  unidades: readonly { id: string; designacion: string }[],
  reloj: Reloj,
): Promise<void> {
  if (unidades.length === 0) return
  const ids = unidades.map((u) => u.id)
  const [ocupantes, deudas, reservas] = await Promise.all([
    ocupantesVigentesDe(ids, reloj.hoy()),
    // Una fecha lejana cuenta toda liquidacion impaga, no solo las vencidas.
    saldoImpagoPorUnidad(new Date('9999-12-31')),
    prisma.reserva.findMany({
      where: { unidadId: { in: ids }, estado: 'confirmada', hasta: { gt: reloj.ahora() } },
      select: { unidadId: true },
    }),
  ])
  for (const unidad of unidades) {
    if (ocupantes.has(unidad.id)) {
      throw new BajaNoPermitida(unidad.designacion, 'tiene ocupantes vigentes')
    }
    if (deudas.has(unidad.id)) {
      throw new BajaNoPermitida(unidad.designacion, 'tiene expensas sin pagar')
    }
    if (reservas.some((r) => r.unidadId === unidad.id)) {
      throw new BajaNoPermitida(unidad.designacion, 'tiene reservas confirmadas por delante')
    }
  }
}

export {
  compararDesignaciones,
  divisionDe,
  ordenarUnidades,
  pisoDe,
} from '@/dominio/unidades/division'
export { sumarCoeficientes } from '@/dominio/coeficientes/suma'

