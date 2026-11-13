import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { NoEncontrado } from '@/compartido/errores'
import { desbloquearUsuario, iniciarSesion } from '@/aplicacion/identidad/iniciar-sesion'
import { fijarContrasena, InvitacionNoValida } from '@/aplicacion/identidad/invitar-persona'
import {
  enviarEnlaceDeClave,
  pedirRestablecimiento,
  TodaviaInvitado,
} from '@/aplicacion/identidad/restablecer'
import { argon2id } from '@/infraestructura/contrasenas/argon2'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

/** RF-03, C5: el enlace para cambiar la clave, por pedido propio o del administrador. */

const RELOJ = relojFijo('2026-09-09T12:00:00Z')
const URL_BASE = 'http://flay.test'
const NUEVA = 'otra-contrasena-larga-y-buena'

let consorcioId: string
let admin: string
let destinatario: { id: string; correo: string }

beforeEach(async () => {
  await limpiar()
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id)).id
  admin = (await crearUsuario('Ada', 'Admin')).id
  await habilitarEnConsorcio(admin, consorcioId, 'administrador')
  destinatario = await crearUsuario('Ana', 'Diaz')
  await habilitarEnConsorcio(destinatario.id, consorcioId, 'consorcista')
})

afterEach(async () => {
  await prismaBase.trabajoPendiente.deleteMany({})
  await limpiar()
})

const correos = (correo: string) =>
  prismaBase.trabajoPendiente.findMany({
    where: { tipo: 'correo_directo', carga: { path: ['destino'], equals: correo } },
  })

const credencialDe = (cuerpo: string) => /\/invitacion\/([\w-]+)/.exec(cuerpo)![1]

describe('restablecer la clave', () => {
  it('un usuario activo recibe el enlace, y el enlace fija la clave y levanta el bloqueo', async () => {
    await prismaBase.usuario.update({
      where: { id: destinatario.id },
      data: { bloqueadoHasta: new Date('2026-09-09T12:10:00Z') },
    })

    await pedirRestablecimiento(RELOJ, { correo: destinatario.correo, urlBase: URL_BASE })

    const [trabajo] = await correos(destinatario.correo)
    const carga = trabajo.carga as { titulo: string; cuerpo: string }
    expect(carga.titulo).toBe('Cambiá tu contraseña')
    await expect(
      fijarContrasena(argon2id, RELOJ, {
        credencial: credencialDe(carga.cuerpo),
        contrasena: NUEVA,
      }),
    ).resolves.toEqual({ usuarioId: destinatario.id })

    const usuario = await prismaBase.usuario.findUniqueOrThrow({ where: { id: destinatario.id } })
    expect(usuario.bloqueadoHasta).toBeNull()
    await expect(
      iniciarSesion(argon2id, RELOJ, {
        correo: destinatario.correo,
        contrasena: NUEVA,
        origen: '203.0.113.7',
      }),
    ).resolves.toEqual({ usuarioId: destinatario.id })
  })

  it('un correo inexistente, invitado o suspendido no encola nada y no lanza', async () => {
    const invitado = await prismaBase.usuario.update({
      where: { id: (await crearUsuario('Ines', 'Invitada')).id },
      data: { estado: 'invitado' },
    })
    const suspendido = await prismaBase.usuario.update({
      where: { id: (await crearUsuario('Sara', 'Suspendida')).id },
      data: { estado: 'suspendido' },
    })

    for (const correo of ['nadie@ejemplo.test', invitado.correo, suspendido.correo]) {
      await expect(
        pedirRestablecimiento(RELOJ, { correo, urlBase: URL_BASE }),
      ).resolves.toBeUndefined()
    }

    expect(await prismaBase.trabajoPendiente.count({ where: { tipo: 'correo_directo' } })).toBe(0)
  })

  it('el enlace vence a las 2 horas', async () => {
    await pedirRestablecimiento(RELOJ, { correo: destinatario.correo, urlBase: URL_BASE })
    const [trabajo] = await correos(destinatario.correo)
    const credencial = credencialDe((trabajo.carga as { cuerpo: string }).cuerpo)

    await expect(
      fijarContrasena(argon2id, relojFijo('2026-09-09T14:01:00Z'), {
        credencial,
        contrasena: NUEVA,
      }),
    ).rejects.toBeInstanceOf(InvitacionNoValida)
  })

  it('el administrador manda el enlace, levanta el bloqueo y el enlace sirve', async () => {
    await prismaBase.usuario.update({
      where: { id: destinatario.id },
      data: { bloqueadoHasta: new Date('2026-09-09T12:10:00Z') },
    })

    await enviarEnlaceDeClave(repositorioHabilitaciones, RELOJ, {
      usuarioId: admin,
      consorcioId,
      destinatarioId: destinatario.id,
      urlBase: URL_BASE,
    })

    const [trabajo] = await correos(destinatario.correo)
    await expect(
      fijarContrasena(argon2id, RELOJ, {
        credencial: credencialDe((trabajo.carga as { cuerpo: string }).cuerpo),
        contrasena: NUEVA,
      }),
    ).resolves.toEqual({ usuarioId: destinatario.id })
  })

  it('el administrador de otro consorcio no puede mandar el enlace', async () => {
    const otro = (await crearConsorcio((await crearAdministradora()).id, 'Ajeno 1')).id
    const otroAdmin = (await crearUsuario('Otto', 'Otro')).id
    await habilitarEnConsorcio(otroAdmin, otro, 'administrador')

    await expect(
      enviarEnlaceDeClave(repositorioHabilitaciones, RELOJ, {
        usuarioId: otroAdmin,
        consorcioId: otro,
        destinatarioId: destinatario.id,
        urlBase: URL_BASE,
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
    expect(await correos(destinatario.correo)).toHaveLength(0)
  })

  it('a un invitado se le indica Reenviar', async () => {
    await prismaBase.usuario.update({
      where: { id: destinatario.id },
      data: { estado: 'invitado' },
    })

    await expect(
      enviarEnlaceDeClave(repositorioHabilitaciones, RELOJ, {
        usuarioId: admin,
        consorcioId,
        destinatarioId: destinatario.id,
        urlBase: URL_BASE,
      }),
    ).rejects.toBeInstanceOf(TodaviaInvitado)
  })
})

/**
 * C5: levantar el bloqueo reinicia la cuenta de intentos. Antes los cinco fallos
 * viejos seguían siendo «los últimos cinco» y un solo error volvía a bloquear.
 */
describe('después de recuperar el acceso, la racha de fallos empieza de cero', () => {
  const fallar = () =>
    iniciarSesion(argon2id, RELOJ, {
      correo: destinatario.correo,
      contrasena: 'incorrecta',
      origen: '203.0.113.7',
    }).catch(() => undefined)

  const bloqueado = async () =>
    (await prismaBase.usuario.findUniqueOrThrow({ where: { id: destinatario.id } }))
      .bloqueadoHasta !== null

  const bloquear = async () => {
    for (let i = 0; i < 5; i++) await fallar()
    expect(await bloqueado()).toBe(true)
  }

  it('tras fijar la clave con el enlace propio, un fallo no bloquea', async () => {
    await bloquear()
    await pedirRestablecimiento(RELOJ, { correo: destinatario.correo, urlBase: URL_BASE })
    const [trabajo] = await correos(destinatario.correo)
    await fijarContrasena(argon2id, RELOJ, {
      credencial: credencialDe((trabajo.carga as { cuerpo: string }).cuerpo),
      contrasena: NUEVA,
    })

    await fallar()
    expect(await bloqueado()).toBe(false)
  })

  it('tras el enlace del administrador, un fallo no bloquea', async () => {
    await bloquear()
    await enviarEnlaceDeClave(repositorioHabilitaciones, RELOJ, {
      usuarioId: admin,
      consorcioId,
      destinatarioId: destinatario.id,
      urlBase: URL_BASE,
    })

    await fallar()
    expect(await bloqueado()).toBe(false)
  })

  it('tras el desbloqueo del administrador, un fallo no bloquea y cinco sí', async () => {
    await bloquear()
    await desbloquearUsuario(destinatario.id)

    await fallar()
    expect(await bloqueado()).toBe(false)
    for (let i = 0; i < 4; i++) await fallar()
    expect(await bloqueado()).toBe(true)
  })
})
