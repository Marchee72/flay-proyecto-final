import { importe } from '@/compartido/dinero'
import { exigirSumaExacta, type UnidadConCoeficiente } from '@/dominio/coeficientes/suma'
import { planificarCambioDeCoeficiente } from '@/dominio/coeficientes/vigencia'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { ErrorDeAplicacion } from '@/compartido/errores'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'

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
      'Este consorcio ya tiene unidades cargadas. Para cambiar una, usá el cambio de coeficiente.',
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
    unidades: readonly { designacion: string; coeficiente: string }[]
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

      await prisma.$transaction(async (tx) => {
        for (const unidad of datos.unidades) {
          const creada = await tx.unidad.create({
            data: sinConsorcio({
              designacion: unidad.designacion,
              coeficiente: unidad.coeficiente,
            }),
          })

          await tx.coeficienteHistorico.create({
            data: { unidadId: creada.id, coeficiente: unidad.coeficiente, vigenciaDesde: hoy },
          })
        }
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
          data: sinConsorcio({ designacion: datos.designacion, coeficiente: datos.coeficiente }),
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
