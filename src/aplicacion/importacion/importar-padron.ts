import { Prisma } from '@prisma/client'

import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { identificadoresDePersonas } from '@/dominio/importacion/personas'
import { validarPadron, type ResumenPadron } from '@/dominio/importacion/padron'
import type { ErrorDeFila } from '@/dominio/importacion/planilla'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { escribirPadron } from '@/aplicacion/consorcios/unidades'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import { ArchivoNoValido, leerPlanilla } from '@/infraestructura/planillas/leer-planilla'
import { personasConocidas } from '@/infraestructura/repositorios/personas'
import { registrarOcupaciones } from '@/infraestructura/repositorios/ocupaciones'

/**
 * Importar el padrón y sus dueños desde una planilla (RF-02).
 *
 * «Revisar» valida y no escribe; «confirmar» **revalida** contra el estado de
 * ese momento (otro administrador pudo cargar el padrón en el medio) y escribe
 * todo en una sola transacción, por lote. No crea usuarios ni da habilitaciones.
 */
export interface FilaDeVista {
  fila: number
  celdas: string[]
}

export type ResultadoImportacion<R> =
  | { estado: 'errores'; errores: ErrorDeFila[] }
  | { estado: 'revisado'; resumen: R; columnas: string[]; vista: FilaDeVista[] }
  | { estado: 'cargado'; resumen: R }

export const errorDeArchivo = (mensaje: string): { estado: 'errores'; errores: ErrorDeFila[] } => ({
  estado: 'errores',
  errores: [{ fila: null, mensaje }],
})

export async function importarPadron(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    bytes: Uint8Array
    nombreArchivo: string
    confirmar: boolean
  },
): Promise<ResultadoImportacion<ResumenPadron>> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'importar el padrón',
    },
    async () => {
      let planilla
      try {
        planilla = await leerPlanilla(datos.bytes, datos.nombreArchivo)
      } catch (error) {
        if (error instanceof ArchivoNoValido) return errorDeArchivo(error.mensajeParaUsuario)
        throw error
      }

      const { correos, dnis } = identificadoresDePersonas(planilla)
      const [unidadesExistentes, consorcio, conocidas] = await Promise.all([
        prisma.unidad.count(),
        prismaBase.consorcio.findUnique({
          where: { id: datos.consorcioId },
          select: { archivadoEn: true },
        }),
        personasConocidas(correos, dnis),
      ])
      const validacion = validarPadron(planilla, {
        unidadesExistentes,
        archivado: consorcio?.archivadoEn != null,
        personasConocidas: conocidas,
      })
      if (!validacion.ok) return { estado: 'errores', errores: validacion.errores }
      const { unidades, nuevas, duenoPorFila, resumen } = validacion.valor

      if (!datos.confirmar) {
        return {
          estado: 'revisado',
          resumen,
          columnas: ['Designación', 'Tipo', 'Coeficiente', 'Dueño'],
          vista: unidades.map((u) => ({
            fila: u.fila,
            celdas: [
              u.designacion,
              u.tipo,
              u.coeficiente,
              u.persona ? `${u.persona.nombre} ${u.persona.apellido}`.trim() : '',
            ],
          })),
        }
      }

      // Ids en memoria: dos sentencias por tabla y no una por fila (decisión 11).
      const hoy = reloj.hoy()
      const filas = unidades.map((u) => ({
        id: crypto.randomUUID(),
        designacion: u.designacion,
        tipo: u.tipo,
        coeficiente: u.coeficiente,
      }))
      const idNueva = nuevas.map(() => crypto.randomUUID())
      const ocupaciones = unidades.flatMap((u, i) => {
        const dueno = duenoPorFila.get(u.fila)
        if (!dueno) return []
        return [
          {
            id: crypto.randomUUID(),
            unidadId: filas[i]!.id,
            personaId: 'existente' in dueno ? dueno.existente : idNueva[dueno.nueva]!,
            tipo: 'propietario' as const,
            desde: hoy,
            hasta: null,
          },
        ]
      })

      try {
        await prisma.$transaction(
          async (tx) => {
            await escribirPadron(tx, filas, hoy)
            if (nuevas.length > 0)
              await tx.persona.createMany({
                data: nuevas.map((p, i) => ({
                  id: idNueva[i]!,
                  nombre: p.nombre,
                  apellido: p.apellido,
                  documento: p.dni,
                  correo: p.correo === null ? null : p.correo.trim().toLowerCase(),
                  telefono: p.telefono,
                })),
              })
            await registrarOcupaciones(ocupaciones, tx)
          },
          { timeout: 20_000 },
        )
      } catch (error) {
        // Otra carga creó la misma persona entre la lectura y la escritura.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          return errorDeArchivo(
            'Otra carga usó el mismo correo o DNI recién; volvé a revisar el archivo.',
          )
        throw error
      }
      return { estado: 'cargado', resumen }
    },
  )
}
