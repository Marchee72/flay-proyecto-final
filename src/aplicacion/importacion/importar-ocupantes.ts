import { Prisma } from '@prisma/client'

import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { identificadoresDePersonas } from '@/dominio/importacion/personas'
import { validarOcupantes, type ResumenOcupantes } from '@/dominio/importacion/ocupantes'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import {
  comoInquilinoSuperpuesto,
  InquilinoSuperpuesto,
} from '@/aplicacion/consorcios/registrar-ocupacion'
import { errorDeArchivo, type ResultadoImportacion } from '@/aplicacion/importacion/importar-padron'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import { ArchivoNoValido, leerPlanilla } from '@/infraestructura/planillas/leer-planilla'
import { personasConocidas } from '@/infraestructura/repositorios/personas'
import {
  ocupacionesDeUnidades,
  registrarOcupaciones,
} from '@/infraestructura/repositorios/ocupaciones'

const fecha = (s: string) => new Date(`${s}T00:00:00.000Z`)

/**
 * Importar propietarios e inquilinos desde una planilla (RF-03).
 *
 * Misma forma que `importarPadron`: «revisar» no escribe y «confirmar»
 * revalida contra la base de ese momento y escribe en una transacción, por
 * lote. No crea usuarios, no da habilitaciones, no encola invitaciones: eso
 * queda para «Invitar» (RN-24 se sincroniza al invitar, no al importar).
 */
export async function importarOcupantes(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    bytes: Uint8Array
    nombreArchivo: string
    confirmar: boolean
  },
): Promise<ResultadoImportacion<ResumenOcupantes>> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'importar ocupantes',
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
      // Aislada por la extensión; la baja no se ofrece (nota 23).
      const [unidades, consorcio, conocidas] = await Promise.all([
        prisma.unidad.findMany({
          where: { bajaDesde: null },
          select: { id: true, designacion: true },
        }),
        prismaBase.consorcio.findUnique({
          where: { id: datos.consorcioId },
          select: { archivadoEn: true },
        }),
        personasConocidas(correos, dnis),
      ])
      const validacion = validarOcupantes(planilla, {
        hoy: reloj.hoy().toISOString().slice(0, 10),
        archivado: consorcio?.archivadoEn != null,
        unidades,
        ocupaciones: await ocupacionesDeUnidades(unidades.map((u) => u.id)),
        personasConocidas: conocidas,
      })
      if (!validacion.ok) return { estado: 'errores', errores: validacion.errores }
      const { aCrear, nuevas, porFila, resumen } = validacion.valor

      if (!datos.confirmar) {
        const designacion = new Map(unidades.map((u) => [u.id, u.designacion]))
        return {
          estado: 'revisado',
          resumen,
          columnas: ['Unidad', 'Vínculo', 'Ocupante', 'Desde', 'Hasta'],
          vista: aCrear.map((o) => ({
            fila: o.fila,
            celdas: [
              designacion.get(o.unidadId) ?? '',
              o.vinculo,
              `${o.persona.nombre} ${o.persona.apellido}`.trim(),
              o.desde,
              o.hasta ?? '',
            ],
          })),
        }
      }

      // Ids en memoria: una sentencia por tabla y no una por fila (decisión 11).
      const idNueva = nuevas.map(() => crypto.randomUUID())
      const ocupaciones = aCrear.map((o) => {
        const persona = porFila.get(o.fila)!
        return {
          id: crypto.randomUUID(),
          unidadId: o.unidadId,
          personaId: 'existente' in persona ? persona.existente : idNueva[persona.nueva]!,
          tipo: o.vinculo,
          desde: fecha(o.desde),
          hasta: o.hasta === null ? null : fecha(o.hasta),
        }
      })

      try {
        await prisma.$transaction(
          async (tx) => {
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
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          return errorDeArchivo(
            'Otra carga usó el mismo correo o DNI recién; volvé a revisar el archivo.',
          )
        // Otro inquilino entró entre la lectura y la escritura: lo frena la base (RN-09).
        const superpuesto = comoInquilinoSuperpuesto(error)
        if (superpuesto instanceof InquilinoSuperpuesto)
          return errorDeArchivo(
            'Se cargó otro inquilino en esas fechas recién; volvé a revisar el archivo.',
          )
        throw error
      }
      return { estado: 'cargado', resumen }
    },
  )
}
