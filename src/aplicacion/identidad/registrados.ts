import { Prisma } from '@prisma/client'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { errorDeCorreo } from '@/dominio/identidad/correo'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sincronizarHabilitacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import {
  ocupacionesVigentesDe,
  type TipoDeOcupacion,
} from '@/infraestructura/repositorios/ocupaciones'

import { asegurarCuenta, CorreoInvalido, encolarInvitacion } from './invitar-persona'

/**
 * «Registrados sin acceso» (RF-03). Importar registra y no invita: quien ocupa
 * una unidad sin habilitación vigente en este consorcio aparece acá, y el
 * acceso se da a propósito, de a uno o en lote, una persona por transacción.
 */

export interface Registrado {
  personaId: string
  nombre: string
  dni: string | null
  correo: string | null
  unidades: { designacion: string; tipo: TipoDeOcupacion }[]
  tieneUsuario: boolean
}

/** Sin decir de quién: el correo de otra persona no se revela ni se fusiona. */
export class CorreoEnUso extends ErrorDeAplicacion {
  constructor() {
    super('Ese correo ya pertenece a otra persona registrada.', 'RF-03')
  }
}

/** Como máximo por disparo, igual que la generación de documentos (nota 14). */
const PRESUPUESTO_MS = 20_000

interface DatosDeInvitar {
  usuarioId: string
  consorcioId: string
  consorcioNombre: string
  urlBase: string
}

export async function registradosSinAcceso(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<Registrado[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'ver los registrados sin acceso',
    },
    () => sinAcceso(reloj.hoy()),
  )
}

/** Ya autorizado y dentro del aislamiento. */
async function sinAcceso(hoy: Date): Promise<Registrado[]> {
  // Aisladas por la extensión; la unidad dada de baja no cuenta (nota 23).
  const unidades = await prisma.unidad.findMany({
    where: { bajaDesde: null },
    select: { id: true, designacion: true },
  })
  const ocupaciones = await ocupacionesVigentesDe(
    unidades.map((u) => u.id),
    hoy,
  )
  const personaIds = [...new Set(ocupaciones.map((o) => o.personaId))]
  if (personaIds.length === 0) return []

  const [personas, habilitadas] = await Promise.all([
    prismaBase.persona.findMany({
      where: { id: { in: personaIds } },
      include: { usuario: { select: { correo: true } } },
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
    }),
    // Cualquier rol vigente acá alcanza; la extensión pone el consorcio.
    prisma.habilitacion.findMany({
      where: {
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }],
        usuario: { personaId: { in: personaIds } },
      },
      select: { usuario: { select: { personaId: true } } },
    }),
  ])

  const conAcceso = new Set(habilitadas.map((h) => h.usuario.personaId))
  const designacion = new Map(unidades.map((u) => [u.id, u.designacion]))

  return personas
    .filter((p) => !conAcceso.has(p.id))
    .map((p) => ({
      personaId: p.id,
      nombre: `${p.apellido}, ${p.nombre}`,
      dni: p.documento,
      correo: p.correo ?? p.usuario?.correo ?? null,
      unidades: ocupaciones
        .filter((o) => o.personaId === p.id)
        .map((o) => ({ designacion: designacion.get(o.unidadId) ?? '', tipo: o.tipo }))
        .sort((a, b) => a.designacion.localeCompare(b.designacion, 'es', { numeric: true })),
      tieneUsuario: p.usuario !== null,
    }))
}

/**
 * «Invitar» de a uno. Sin usuario: guarda el correo si vino, crea el usuario
 * invitado y sincroniza la habilitación de consorcista (RN-24); el correo de
 * invitación se encola **fuera** de la transacción. Con usuario: solo la
 * habilitación, sin correo (como `invitarPersona` con un existente).
 */
export async function invitarRegistrado(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: DatosDeInvitar & { personaId: string; correo?: string },
): Promise<{ yaTeniaCuenta: boolean }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'invitar personas',
    },
    async () => {
      const registrado = (await sinAcceso(reloj.hoy())).find((r) => r.personaId === datos.personaId)
      if (!registrado) throw new NoEncontrado()
      return invitarUno(reloj, registrado, datos)
    },
  )
}

export interface ResultadoDelLote {
  invitados: number
  quedan: number
  /** Los que no se pudieron invitar (correo en uso o no válido): siguen en la lista. */
  fallidos: number
}

/**
 * El aviso del lote, o `null` si salió todo. Sin nombres: no revela de quién
 * es el correo que choca.
 */
export function avisoDelLote({ invitados, quedan, fallidos }: ResultadoDelLote): string | null {
  if (quedan === 0 && fallidos === 0) return null
  const partes = [
    quedan > 0
      ? `Invitamos a ${invitados}; quedan ${quedan}: volvé a apretar para seguir.`
      : `Invitamos a ${invitados}.`,
  ]
  if (fallidos > 0)
    partes.push(
      `${fallidos === 1 ? '1 no se pudo invitar' : `${fallidos} no se pudieron invitar`}: su correo ya pertenece a otra persona registrada o no es válido.`,
    )
  return partes.join(' ')
}

/** «Invitar a todos los que tienen correo»: reanudable, corta por tiempo. */
export async function invitarRegistrados(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: DatosDeInvitar & { presupuestoMs?: number },
): Promise<ResultadoDelLote> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'invitar personas',
    },
    async () => {
      const candidatos = (await sinAcceso(reloj.hoy())).filter((r) => r.correo !== null)
      const presupuesto = datos.presupuestoMs ?? PRESUPUESTO_MS
      const inicio = Date.now()
      let invitados = 0
      let fallidos = 0

      for (const [i, registrado] of candidatos.entries()) {
        // Siempre avanza al menos uno: volver a apretar nunca se queda en el lugar.
        if (i > 0 && Date.now() - inicio >= presupuesto)
          return { invitados, quedan: candidatos.length - i, fallidos }
        try {
          await invitarUno(reloj, registrado, datos)
          invitados++
        } catch (error) {
          // Un correo en uso no frena al resto: se cuenta y la persona sigue en la lista.
          if (!(error instanceof ErrorDeAplicacion)) throw error
          fallidos++
        }
      }
      return { invitados, quedan: 0, fallidos }
    },
  )
}

async function invitarUno(
  reloj: Reloj,
  registrado: Registrado,
  datos: DatosDeInvitar & { correo?: string },
): Promise<{ yaTeniaCuenta: boolean }> {
  const { personaId } = registrado
  if (registrado.tieneUsuario) {
    await prismaBase.$transaction((tx) => sincronizarHabilitacion(personaId, datos.consorcioId, tx))
    return { yaTeniaCuenta: true }
  }

  const correo = (registrado.correo ?? datos.correo ?? '').trim().toLowerCase()
  const mensaje = errorDeCorreo(correo)
  if (mensaje) throw new CorreoInvalido(mensaje)

  const { credencial, nombre } = await prismaBase
    .$transaction(async (tx) => {
      const persona = await tx.persona.findUniqueOrThrow({ where: { id: personaId } })
      if (persona.correo === null) {
        const usado =
          (await tx.usuario.findUnique({ where: { correo }, select: { id: true } })) ??
          (await tx.persona.findFirst({ where: { correo }, select: { id: true } }))
        if (usado) throw new CorreoEnUso()
        await tx.persona.update({ where: { id: personaId }, data: { correo } })
      }
      const cuenta = await asegurarCuenta(tx, reloj, {
        nombre: persona.nombre,
        apellido: persona.apellido,
        correo,
      })
      // El correo de la persona ya es la cuenta de otra: no se fusionan.
      if (cuenta.personaId !== personaId) throw new CorreoEnUso()
      await sincronizarHabilitacion(personaId, datos.consorcioId, tx)
      return { credencial: cuenta.credencialNueva, nombre: persona.nombre }
    })
    .catch((error: unknown) => {
      // Otro alta tomó el mismo correo entre la lectura y la escritura.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new CorreoEnUso()
      throw error
    })

  if (credencial)
    await encolarInvitacion({
      correo,
      nombre,
      consorcioNombre: datos.consorcioNombre,
      urlBase: datos.urlBase,
      credencial,
    })
  return { yaTeniaCuenta: false }
}
