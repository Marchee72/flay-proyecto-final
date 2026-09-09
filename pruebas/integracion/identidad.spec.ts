import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  CredencialesInvalidas,
  desbloquearUsuario,
  iniciarSesion,
} from '@/aplicacion/identidad/iniciar-sesion'
import { fijarContrasena, invitarPersona } from '@/aplicacion/identidad/invitar-persona'
import { argon2id } from '@/infraestructura/contrasenas/argon2'
import { prismaBase } from '@/infraestructura/prisma'

import { relojFijo } from '../dominio/reloj-fijo'
import { crearAdministradora, crearConsorcio, limpiar } from './ayudas'

/**
 * FR-001b y FR-001c: Argon2id protege la base robada; el bloqueo protege el
 * formulario. SC-006d verifica que el sexto intento falle aunque la contrasena
 * sea correcta.
 */

const RELOJ = relojFijo('2026-09-09T12:00:00Z')
const CONTRASENA = 'una-contrasena-larga-y-buena'

let correo: string
let usuarioId: string

beforeEach(async () => {
  correo = `usuario-${crypto.randomUUID()}@ejemplo.test`
  const persona = await prismaBase.persona.create({ data: { nombre: 'Ana', apellido: 'Diaz' } })
  const usuario = await prismaBase.usuario.create({
    data: {
      personaId: persona.id,
      correo,
      estado: 'activo',
      claveDerivada: await argon2id.derivar(CONTRASENA),
    },
  })
  usuarioId = usuario.id
})

afterEach(limpiar)

const intentar = (contrasena: string) =>
  iniciarSesion(argon2id, RELOJ, { correo, contrasena, origen: '203.0.113.7' })

describe('inicio de sesion', () => {
  it('entra con la contrasena correcta y deja el intento registrado', async () => {
    await expect(intentar(CONTRASENA)).resolves.toEqual({ usuarioId })

    const intentos = await prismaBase.intentoInicioSesion.findMany({
      where: { correoProbado: correo },
    })
    expect(intentos).toHaveLength(1)
    expect(intentos[0].exitoso).toBe(true)
    expect(intentos[0].origen).toBe('203.0.113.7')
  })

  it('al sexto intento rechaza aunque la contrasena sea correcta (SC-006d)', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(intentar('incorrecta')).rejects.toBeInstanceOf(CredencialesInvalidas)
    }

    await expect(intentar(CONTRASENA)).rejects.toBeInstanceOf(CredencialesInvalidas)

    const usuario = await prismaBase.usuario.findUniqueOrThrow({ where: { id: usuarioId } })
    expect(usuario.bloqueadoHasta).not.toBeNull()
  })

  it('el administrador levanta el bloqueo y la cuenta vuelve a entrar', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(intentar('incorrecta')).rejects.toBeInstanceOf(CredencialesInvalidas)
    }
    await expect(intentar(CONTRASENA)).rejects.toBeInstanceOf(CredencialesInvalidas)

    await desbloquearUsuario(usuarioId)

    await expect(intentar(CONTRASENA)).resolves.toEqual({ usuarioId })
  })

  it('el mensaje es identico exista o no la cuenta y este o no bloqueada (FR-001c)', async () => {
    const mensajes: string[] = []

    // Cuenta inexistente
    await iniciarSesion(argon2id, RELOJ, {
      correo: 'nadie@ejemplo.test',
      contrasena: 'x',
      origen: '203.0.113.7',
    }).catch((e: Error) => mensajes.push(e.message))

    // Contrasena incorrecta
    await intentar('incorrecta').catch((e: Error) => mensajes.push(e.message))

    // Cuenta bloqueada
    for (let i = 0; i < 4; i++) await intentar('incorrecta').catch(() => undefined)
    await intentar(CONTRASENA).catch((e: Error) => mensajes.push(e.message))

    expect(new Set(mensajes).size).toBe(1)
    expect(mensajes).toHaveLength(3)
  })

  it('un intento exitoso corta la racha de fallos', async () => {
    for (let i = 0; i < 4; i++) await expect(intentar('incorrecta')).rejects.toThrow()
    await expect(intentar(CONTRASENA)).resolves.toEqual({ usuarioId })

    for (let i = 0; i < 4; i++) await expect(intentar('incorrecta')).rejects.toThrow()

    const usuario = await prismaBase.usuario.findUniqueOrThrow({ where: { id: usuarioId } })
    expect(usuario.bloqueadoHasta).toBeNull()
  })
})

describe('invitacion', () => {
  it('crea persona, usuario invitado y habilitacion, y encola el correo sin enviarlo', async () => {
    const consorcio = await crearConsorcio((await crearAdministradora()).id, 'Mitre 456')

    const { usuarioId: invitado } = await invitarPersona(RELOJ, {
      nombre: 'Franco',
      apellido: 'Ferrero',
      correo: `franco-${crypto.randomUUID()}@ejemplo.test`,
      rol: 'consorcista',
      consorcioId: consorcio.id,
      consorcioNombre: 'Mitre 456',
      vigenciaDesde: new Date('2026-09-09'),
      urlBase: 'https://flay.test',
    })

    const usuario = await prismaBase.usuario.findUniqueOrThrow({ where: { id: invitado } })
    expect(usuario.estado).toBe('invitado')
    expect(usuario.claveDerivada).toBeNull()
    expect(usuario.invitacionHash).not.toBeNull()

    // El correo no se envio: quedo encolado (RNF-14).
    const pendientes = await prismaBase.trabajoPendiente.findMany({ where: { tipo: 'invitacion' } })
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].estado).toBe('pendiente')

    await prismaBase.trabajoPendiente.deleteMany({})
  })

  it('la credencial no se guarda en claro: en la base queda solo su resumen', async () => {
    const consorcio = await crearConsorcio((await crearAdministradora()).id, 'San Luis 900')

    const { usuarioId: invitado } = await invitarPersona(RELOJ, {
      nombre: 'Lucia',
      apellido: 'Gomez',
      correo: `lucia-${crypto.randomUUID()}@ejemplo.test`,
      rol: 'consejo',
      consorcioId: consorcio.id,
      consorcioNombre: 'San Luis 900',
      vigenciaDesde: new Date('2026-09-09'),
      urlBase: 'https://flay.test',
    })

    const [trabajo] = await prismaBase.trabajoPendiente.findMany({ where: { tipo: 'invitacion' } })
    const enlace = (trabajo.carga as { enlaceDeAlta: string }).enlaceDeAlta
    const credencial = enlace.split('/').at(-1)!

    const usuario = await prismaBase.usuario.findUniqueOrThrow({ where: { id: invitado } })
    expect(usuario.invitacionHash).not.toBe(credencial)

    // Con la credencial del enlace, el invitado fija su contrasena y queda activo.
    await fijarContrasena(argon2id, RELOJ, { credencial, contrasena: 'otra-contrasena-larga' })

    const activo = await prismaBase.usuario.findUniqueOrThrow({ where: { id: invitado } })
    expect(activo.estado).toBe('activo')
    expect(activo.invitacionHash).toBeNull()

    await prismaBase.trabajoPendiente.deleteMany({})
  })
})
