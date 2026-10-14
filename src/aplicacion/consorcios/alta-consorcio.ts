import { importe } from '@/compartido/dinero'
import { ErrorDeAplicacion } from '@/compartido/errores'
import { exigirSumaExacta } from '@/dominio/coeficientes/suma'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { TIPO_UNIDAD_POR_OMISION, type TipoUnidad } from '@/dominio/unidades/tipo'
import { conAutorizacionDeAdministradora } from '@/aplicacion/autorizacion'
import { prismaBase } from '@/infraestructura/prisma'

/** Coeficiente como cadena de ocho decimales: nunca el tipo numerico (FR-013). */
export interface UnidadNueva {
  designacion: string
  coeficiente: string
  /**
   * Tipo de la unidad. Opcional y con omision a departamento: el alta desde el
   * formulario historico no lo pide y sigue comportandose igual que antes.
   */
  tipo?: TipoUnidad
}

/**
 * Alta de consorcio (FR-009, FR-007b).
 *
 * La autoriza el super administrador, o quien tiene habilitacion sobre la
 * administradora dueña del consorcio nuevo, no un administrador de consorcio:
 * al crear el primero no hay consorcio contra el cual evaluar el par
 * (rol, consorcio). Es una de las dos operaciones que trabajan por encima del
 * aislamiento, y por eso no abre contexto.
 *
 * Quien lo crea queda habilitado sobre el como administrador en la misma
 * transaccion: un consorcio sin nadie que lo administre no le sirve a nadie.
 *
 * Las unidades entran en **esa misma transaccion** (FR-011c): cargarlas aparte
 * dejaria al consorcio a medio cuadrar entre una operacion y la otra. Se puede
 * crear sin unidades y cargarlas despues; lo que no se puede es dejarlas
 * sumando distinto de 100.
 */

export class CuitYaRegistrado extends ErrorDeAplicacion {
  constructor() {
    super('Ya hay un consorcio con ese CUIT.', 'RF-01')
  }
}

export async function altaConsorcio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    administradoraId: string
    nombre: string
    direccion: string
    localidad: string
    cuit: string
    unidades?: readonly UnidadNueva[]
  },
): Promise<{ consorcioId: string }> {
  return conAutorizacionDeAdministradora(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      administradoraId: datos.administradoraId,
      accion: 'dar de alta un consorcio',
    },
    async () => {
      if (await prismaBase.consorcio.findUnique({ where: { cuit: datos.cuit } })) {
        throw new CuitYaRegistrado()
      }

      const unidades = datos.unidades ?? []

      // El disparador diferido de la base es el que garantiza el invariante;
      // esto existe para que el rechazo diga cuanto falta (FR-011, RNF-10).
      exigirSumaExacta(
        unidades.map((unidad) => ({
          designacion: unidad.designacion,
          coeficiente: importe(unidad.coeficiente),
        })),
      )

      const hoy = reloj.hoy()

      // Los identificadores se generan aca para escribir las dos tablas de
      // unidades con dos sentencias y no con dos por unidad: contra una base
      // administrada, N altas de a una no entran en el tope de 5 s de la
      // transaccion interactiva (CLAUDE.md pt 11). Es lo mismo que `cargarPadron`.
      const filas = unidades.map((unidad) => ({
        id: crypto.randomUUID(),
        designacion: unidad.designacion,
        tipo: unidad.tipo ?? TIPO_UNIDAD_POR_OMISION,
        coeficiente: unidad.coeficiente,
      }))

      const consorcio = await prismaBase.$transaction(async (tx) => {
        const creado = await tx.consorcio.create({
          data: {
            administradoraId: datos.administradoraId,
            nombre: datos.nombre,
            direccion: datos.direccion,
            localidad: datos.localidad,
            cuit: datos.cuit,
          },
        })

        await tx.habilitacion.create({
          data: {
            usuarioId: datos.usuarioId,
            consorcioId: creado.id,
            rol: 'administrador',
            vigenciaDesde: hoy,
          },
        })

        // `altaConsorcio` trabaja por encima del aislamiento sobre el cliente
        // crudo, asi que el `consorcioId` va explicito (no lo inyecta la extension).
        await tx.unidad.createMany({
          data: filas.map((fila) => ({ ...fila, consorcioId: creado.id })),
        })

        // Toda unidad nace con su fila de historia: es lo que permite
        // reconstruir una liquidacion pasada (regla RN-02).
        await tx.coeficienteHistorico.createMany({
          data: filas.map((fila) => ({
            unidadId: fila.id,
            coeficiente: fila.coeficiente,
            vigenciaDesde: hoy,
          })),
        })

        return creado
      })

      return { consorcioId: consorcio.id }
    },
  )
}
