import { createHash, randomBytes } from 'node:crypto'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { DerivadorDeContrasenas } from '@/dominio/contratos/derivador-contrasenas'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import { errorDeCorreo } from '@/dominio/identidad/correo'
import type { Rol } from '@/dominio/identidad/rol'
import { comoInquilinoSuperpuesto } from '@/aplicacion/consorcios/registrar-ocupacion'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import {
  registrarOcupacion,
  type TipoDeOcupacion,
} from '@/infraestructura/repositorios/ocupaciones'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { encolar } from '@/aplicacion/pendientes/encolar'

/**
 * Invitacion por correo (FR-006). El invitado fija su propia contrasena: el
 * administrador nunca la conoce.
 *
 * El envio **no** se hace aca: se encola. La falla del correo no puede voltear
 * el alta del usuario (RNF-14), y encolar siempre —tambien en el camino feliz—
 * hace que el reintento se ejercite en cada invitacion y no solo cuando el
 * proveedor falla.
 *
 * Solo un administrador del consorcio invita (FR-007), y quien lo verifica es
 * este caso de uso: si la verificacion viviera en la pantalla, cada pantalla
 * nueva volveria a poder olvidarla.
 */

export const HORAS_DE_VIGENCIA_DE_LA_INVITACION = 72

export class CorreoInvalido extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 'RF-03')
  }
}

export class YaTieneAcceso extends ErrorDeAplicacion {
  constructor() {
    super('Esa persona ya tiene acceso a este consorcio con ese rol.', 'RF-03')
  }
}

interface DatosDeInvitacion {
  nombre: string
  apellido: string
  correo: string
  rol: Rol
  consorcioId: string
  consorcioNombre: string
  vigenciaDesde: Date
  urlBase: string
  /** Nulo o ausente: se invita sin ocuparle una unidad todavia. */
  unidad?: { unidadId: string; tipo: TipoDeOcupacion } | null
}

/** La credencial viaja en el enlace; en la base queda solo su resumen. */
const resumen = (credencial: string) => createHash('sha256').update(credencial).digest('hex')

export async function invitarPersona(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: DatosDeInvitacion & { invitadorId: string },
): Promise<{ usuarioId: string; yaTeniaCuenta: boolean }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.invitadorId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'invitar personas',
    },
    () => altaDelInvitado(reloj, datos),
  )
}

/** El alta en si, ya autorizada. */
async function altaDelInvitado(
  reloj: Reloj,
  datos: DatosDeInvitacion,
): Promise<{ usuarioId: string; yaTeniaCuenta: boolean }> {
  const mensaje = errorDeCorreo(datos.correo)
  if (mensaje) throw new CorreoInvalido(mensaje)
  const correo = datos.correo.trim().toLowerCase()

  // El aislamiento decide si la unidad es de este consorcio (nota 10).
  if (datos.unidad) {
    const unidad = await prisma.unidad.findFirst({
      where: { id: datos.unidad.unidadId, bajaDesde: null },
    })
    if (!unidad) throw new NoEncontrado()
  }

  const ocupar = (personaId: string, cliente: Parameters<typeof registrarOcupacion>[1]) =>
    datos.unidad
      ? registrarOcupacion(
          {
            unidadId: datos.unidad.unidadId,
            personaId,
            tipo: datos.unidad.tipo,
            desde: datos.vigenciaDesde,
            hasta: null,
          },
          cliente,
        )
      : Promise.resolve()

  // Quien ya tiene cuenta no recibe otra invitacion: se le suma el acceso.
  const existente = await prismaBase.usuario.findUnique({ where: { correo } })
  if (existente) {
    const previa = await prismaBase.habilitacion.findUnique({
      where: {
        usuarioId_consorcioId_rol: {
          usuarioId: existente.id,
          consorcioId: datos.consorcioId,
          rol: datos.rol,
        },
      },
    })
    // Misma regla de vigencia que `accesoVigente`.
    const hoy = reloj.hoy()
    if (previa && (previa.vigenciaHasta === null || previa.vigenciaHasta >= hoy)) {
      throw new YaTieneAcceso()
    }

    try {
      await prismaBase.$transaction(async (tx) => {
        // Un acceso revocado conserva su fila: se reabre en vez de crear otra.
        if (previa) {
          await tx.habilitacion.update({
            where: { id: previa.id },
            data: { vigenciaDesde: datos.vigenciaDesde, vigenciaHasta: null },
          })
        } else {
          await tx.habilitacion.create({
            data: {
              usuarioId: existente.id,
              consorcioId: datos.consorcioId,
              rol: datos.rol,
              vigenciaDesde: datos.vigenciaDesde,
            },
          })
        }
        await ocupar(existente.personaId, tx)
      })
    } catch (error) {
      throw comoInquilinoSuperpuesto(error)
    }

    return { usuarioId: existente.id, yaTeniaCuenta: true }
  }

  const credencial = randomBytes(32).toString('base64url')
  const vence = new Date(reloj.ahora().getTime() + HORAS_DE_VIGENCIA_DE_LA_INVITACION * 3_600_000)

  const usuario = await prismaBase
    .$transaction(async (tx) => {
      // Una persona cargada antes en el padron (sin usuario) se reutiliza.
      const persona =
        (await tx.persona.findFirst({ where: { correo } })) ??
        (await tx.persona.create({
          data: { nombre: datos.nombre, apellido: datos.apellido, correo },
        }))

      const creado = await tx.usuario.create({
        data: {
          personaId: persona.id,
          correo,
          estado: 'invitado',
          invitacionHash: resumen(credencial),
          invitacionVence: vence,
        },
      })

      await tx.habilitacion.create({
        data: {
          usuarioId: creado.id,
          consorcioId: datos.consorcioId,
          rol: datos.rol,
          vigenciaDesde: datos.vigenciaDesde,
        },
      })

      await ocupar(persona.id, tx)

      return creado
    })
    .catch((error) => {
      throw comoInquilinoSuperpuesto(error)
    })

  await encolar('invitacion', {
    destino: correo,
    nombre: datos.nombre,
    consorcio: datos.consorcioNombre,
    enlaceDeAlta: `${datos.urlBase}/invitacion/${credencial}`,
  })

  return { usuarioId: usuario.id, yaTeniaCuenta: false }
}

export class InvitacionNoValida extends ErrorDeAplicacion {
  constructor() {
    super('La invitación venció o ya se usó. Pedile al administrador que la reenvíe.', 'RF-03')
  }
}

/** El invitado fija su contrasena y la invitacion se consume (FR-006). */
export async function fijarContrasena(
  derivador: DerivadorDeContrasenas,
  reloj: Reloj,
  datos: { credencial: string; contrasena: string },
): Promise<{ usuarioId: string }> {
  const usuario = await prismaBase.usuario.findFirst({
    where: { invitacionHash: resumen(datos.credencial) },
  })

  if (!usuario || !usuario.invitacionVence || usuario.invitacionVence < reloj.ahora()) {
    throw new InvitacionNoValida()
  }

  await prismaBase.usuario.update({
    where: { id: usuario.id },
    data: {
      claveDerivada: await derivador.derivar(datos.contrasena),
      estado: 'activo',
      invitacionHash: null,
      invitacionVence: null,
    },
  })

  return { usuarioId: usuario.id }
}
