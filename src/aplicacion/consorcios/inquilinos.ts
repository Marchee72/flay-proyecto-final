import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import { errorDeCorreo } from '@/dominio/identidad/correo'
import { errorDeFinDeAlquiler } from '@/dominio/ocupaciones/vigencia'
import { ordenarUnidades } from '@/dominio/unidades/division'
import type { TipoUnidad } from '@/dominio/unidades/tipo'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import {
  asegurarCuenta,
  CorreoInvalido,
  encolarInvitacion,
} from '@/aplicacion/identidad/invitar-persona'
import {
  comoInquilinoSuperpuesto,
  exigirPropietarioDeLaUnidad,
  sincronizarHabilitacion,
} from '@/aplicacion/consorcios/registrar-ocupacion'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import {
  inquilinosDe,
  ocupacionesVigentesDeUsuario,
  ocupacionPorId,
  registrarOcupacion as insertarOcupacion,
  terminarOcupacion,
  type InquilinoDeUnidad,
} from '@/infraestructura/repositorios/ocupaciones'

export type { InquilinoDeUnidad }

export class FechaDeFinInvalida extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 'RF-03')
  }
}

export interface VistaOcupantes {
  gestiona: boolean
  unidades: {
    unidadId: string
    designacion: string
    tipo: TipoUnidad
    inquilinos: InquilinoDeUnidad[]
  }[]
  alquilo: {
    designacion: string
    desde: string
    hasta: string | null
  }[]
}

/**
 * Asigna un inquilino a una unidad funcional (RF-03, FR-008b, RN-24).
 *
 * Autoriza administrador o propietario vigente de **esa** unidad (sobre otra
 * unidad responde «no encontrado», SC-008). Reutiliza la cuenta si el correo ya
 * existe en el sistema y sincroniza la habilitacion de consorcista en la misma
 * transaccion.
 */
export async function asignarInquilino(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    unidadId: string
    nombre: string
    apellido: string
    correo: string
    desde: Date
    hasta: Date | null
    urlBase: string
  },
): Promise<{ ocupacionId: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      accion: 'administrar inquilinos',
    },
    async (acceso) => {
      const unidad = await prisma.unidad.findFirst({
        where: { id: datos.unidadId, bajaDesde: null },
        select: { id: true, consorcio: { select: { nombre: true } } },
      })
      if (!unidad) throw new NoEncontrado()

      if (!acceso.roles.includes('administrador')) {
        await exigirPropietarioDeLaUnidad(
          { usuarioId: datos.usuarioId, unidadId: datos.unidadId, tipo: 'inquilino' },
          reloj,
        )
      }

      const nombre = datos.nombre.trim()
      const apellido = datos.apellido.trim()
      if (!nombre || !apellido) {
        throw new ErrorDeAplicacion('Completar nombre y apellido del inquilino.', 'RF-03')
      }

      const errorCorreo = errorDeCorreo(datos.correo)
      if (errorCorreo) throw new CorreoInvalido(errorCorreo)

      const desdeIso = datos.desde.toISOString().slice(0, 10)
      const hastaIso = datos.hasta ? datos.hasta.toISOString().slice(0, 10) : ''
      const errorFecha = errorDeFinDeAlquiler(desdeIso, hastaIso)
      if (errorFecha) throw new FechaDeFinInvalida(errorFecha)

      const { ocupacionId, credencialNueva } = await prismaBase
        .$transaction(async (tx) => {
          const cuenta = await asegurarCuenta(tx, reloj, {
            nombre,
            apellido,
            correo: datos.correo,
          })

          const { ocupacionId } = await insertarOcupacion(
            {
              unidadId: datos.unidadId,
              personaId: cuenta.personaId,
              tipo: 'inquilino',
              desde: datos.desde,
              hasta: datos.hasta,
            },
            tx,
          )

          await sincronizarHabilitacion(cuenta.personaId, datos.consorcioId, tx)

          return { ocupacionId, credencialNueva: cuenta.credencialNueva }
        })
        .catch((error) => {
          throw comoInquilinoSuperpuesto(error)
        })

      if (credencialNueva) {
        await encolarInvitacion({
          correo: datos.correo,
          nombre,
          consorcioNombre: unidad.consorcio.nombre,
          urlBase: datos.urlBase,
          credencial: credencialNueva,
        })
      }

      return { ocupacionId }
    },
  )
}

/**
 * Fija o corre la fecha de fin (inclusiva) de un alquiler vigente o futuro,
 * y recalcula la habilitacion de consorcista del inquilino (RF-03, RN-24).
 */
export async function terminarAlquiler(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    ocupacionId: string
    hasta: Date
  },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      accion: 'administrar inquilinos',
    },
    async (acceso) => {
      const ocupacion = await ocupacionPorId(datos.ocupacionId)
      if (!ocupacion || ocupacion.tipo !== 'inquilino') throw new NoEncontrado()

      const unidad = await prisma.unidad.findFirst({
        where: { id: ocupacion.unidadId, bajaDesde: null },
        select: { id: true },
      })
      if (!unidad) throw new NoEncontrado()

      if (!acceso.roles.includes('administrador')) {
        await exigirPropietarioDeLaUnidad(
          { usuarioId: datos.usuarioId, unidadId: ocupacion.unidadId, tipo: 'inquilino' },
          reloj,
        )
      }

      const errorFecha = errorDeFinDeAlquiler(
        ocupacion.desde.toISOString().slice(0, 10),
        datos.hasta.toISOString().slice(0, 10),
      )
      if (errorFecha) throw new FechaDeFinInvalida(errorFecha)

      await prismaBase
        .$transaction(async (tx) => {
          await terminarOcupacion(ocupacion.id, datos.hasta, tx)
          await sincronizarHabilitacion(ocupacion.personaId, datos.consorcioId, tx)
        })
        .catch((error) => {
          throw comoInquilinoSuperpuesto(error)
        })
    },
  )
}

/**
 * Ocupantes por unidad visibles para quien consulta:
 * - Administrador: todas las unidades vigentes, `gestiona: true`.
 * - Consejo: todas las unidades vigentes, `gestiona: false`.
 * - Consorcista: solo donde es propietario vigente, `gestiona: true`.
 * En todos los casos `alquilo` incluye las unidades que ocupa hoy como inquilino.
 */
export async function verOcupantes(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<VistaOcupantes> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      accion: 'ver ocupantes',
    },
    async (acceso) => {
      const hoy = reloj.hoy()
      const todas = ordenarUnidades(
        await prisma.unidad.findMany({
          where: { bajaDesde: null },
          select: { id: true, designacion: true, tipo: true },
        }),
      )

      const propias = await ocupacionesVigentesDeUsuario(
        datos.usuarioId,
        todas.map((u) => u.id),
        hoy,
      )

      const esAdmin = acceso.roles.includes('administrador')
      const esConsejo = acceso.roles.includes('consejo')
      const gestiona = esAdmin || !esConsejo

      const unidadesBase =
        esAdmin || esConsejo
          ? todas
          : todas.filter((u) =>
              propias.some((o) => o.unidadId === u.id && o.tipo === 'propietario'),
            )

      const inquilinos = await inquilinosDe(
        unidadesBase.map((u) => u.id),
        hoy,
      )
      const porUnidad = new Map<string, InquilinoDeUnidad[]>()
      for (const inq of inquilinos) {
        porUnidad.set(inq.unidadId, [...(porUnidad.get(inq.unidadId) ?? []), inq])
      }

      const designacionPorId = new Map(todas.map((u) => [u.id, u.designacion]))
      const ordenUnidad = new Map(todas.map((u, i) => [u.id, i]))
      const alquilo = propias
        .filter((o) => o.tipo === 'inquilino')
        .sort((a, b) => (ordenUnidad.get(a.unidadId) ?? 0) - (ordenUnidad.get(b.unidadId) ?? 0))
        .map((o) => ({
          designacion: designacionPorId.get(o.unidadId)!,
          desde: o.desde,
          hasta: o.hasta,
        }))

      return {
        gestiona,
        unidades: unidadesBase.map((u) => ({
          unidadId: u.id,
          designacion: u.designacion,
          tipo: u.tipo,
          inquilinos: porUnidad.get(u.id) ?? [],
        })),
        alquilo,
      }
    },
  )
}
