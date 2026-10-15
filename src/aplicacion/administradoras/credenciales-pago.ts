import { conAutorizacion } from '@/aplicacion/autorizacion'
import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import { cifrarTexto, descifrarTexto } from '@/infraestructura/cifrado/aes-gcm'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Gestion de credenciales de pasarela de pago por administradora (`RF-28`).
 *
 * Los tokens viajan cifrados hacia la base de datos y nunca se envian al
 * navegador: la interfaz solo recibe si esta configurado y los ultimos 4 caracteres.
 */

export class ClaveCifradoFaltante extends ErrorDeAplicacion {
  constructor() {
    super('No esta configurada la clave de cifrado del procesador de pagos.', 'RF-28')
  }
}

export class CredencialInvalida extends ErrorDeAplicacion {
  constructor(mensaje: string) {
    super(mensaje, 'RF-28')
  }
}

function claveMaestra(): string {
  const clave = process.env.MP_CLAVE_CIFRADO
  if (!clave) {
    throw new ClaveCifradoFaltante()
  }
  return clave
}

export interface EstadoCredencialPago {
  configurado: boolean
  ultimosCuatro?: string
}

export async function verEstadoCredencialPago(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
  },
): Promise<EstadoCredencialPago> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'ver credenciales de pago',
    },
    async () => {
      const consorcio = await prisma.consorcio.findFirst({
        where: { id: datos.consorcioId },
        select: { administradoraId: true },
      })
      if (!consorcio) throw new NoEncontrado()

      const cred = await prismaBase.credencialPagoAdministradora.findUnique({
        where: { administradoraId: consorcio.administradoraId },
        select: { ultimosCuatro: true },
      })

      if (!cred) {
        return { configurado: false }
      }

      return {
        configurado: true,
        ultimosCuatro: cred.ultimosCuatro,
      }
    },
  )
}

export async function guardarCredencialesPago(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    accessToken: string
    secretoWebhook: string
  },
): Promise<EstadoCredencialPago> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'configurar pasarela de pagos',
    },
    async () => {
      const tokenLimpio = datos.accessToken.trim()
      const secretoLimpio = datos.secretoWebhook.trim()

      if (!tokenLimpio || tokenLimpio.length < 8) {
        throw new CredencialInvalida('El Access Token de Mercado Pago no es valido.')
      }

      if (!secretoLimpio || secretoLimpio.length < 8) {
        throw new CredencialInvalida('El Secreto de Webhook no es valido.')
      }

      const consorcio = await prisma.consorcio.findFirst({
        where: { id: datos.consorcioId },
        select: { administradoraId: true },
      })
      if (!consorcio) throw new NoEncontrado()

      const clave = claveMaestra()
      const accessTokenCifrado = cifrarTexto(tokenLimpio, clave)
      const secretoWebhookCifrado = cifrarTexto(secretoLimpio, clave)
      const ultimosCuatro = tokenLimpio.slice(-4)

      await prismaBase.credencialPagoAdministradora.upsert({
        where: { administradoraId: consorcio.administradoraId },
        create: {
          administradoraId: consorcio.administradoraId,
          accessTokenCifrado,
          secretoWebhookCifrado,
          ultimosCuatro,
          cargadoPor: datos.usuarioId,
        },
        update: {
          accessTokenCifrado,
          secretoWebhookCifrado,
          ultimosCuatro,
          cargadoPor: datos.usuarioId,
        },
      })

      return {
        configurado: true,
        ultimosCuatro,
      }
    },
  )
}

/**
 * Consulta y descifrado seguro de credenciales exclusivo del servidor.
 * Nunca serializar el resultado hacia la presentacion o los clientes.
 */
export async function obtenerCredencialesDescifradas(
  administradoraId: string,
): Promise<{ accessToken: string; secretoWebhook: string } | null> {
  const cred = await prismaBase.credencialPagoAdministradora.findUnique({
    where: { administradoraId },
  })
  if (!cred) return null

  const clave = claveMaestra()
  return {
    accessToken: descifrarTexto(cred.accessTokenCifrado, clave),
    secretoWebhook: descifrarTexto(cred.secretoWebhookCifrado, clave),
  }
}
