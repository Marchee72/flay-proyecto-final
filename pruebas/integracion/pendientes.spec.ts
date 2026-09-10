import { afterEach, describe, expect, it } from 'vitest'

import { encolar } from '@/aplicacion/pendientes/encolar'
import { drenar, reintentarAhora } from '@/aplicacion/pendientes/drenar'
import { invitarPersona } from '@/aplicacion/identidad/invitar-persona'
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

/**
 * El mecanismo que sostiene RNF-14: un efecto externo puede fallar sin voltear
 * la operacion del usuario, y se reintenta despues (FR-006b).
 */

afterEach(async () => {
  await prismaBase.trabajoPendiente.deleteMany({})
})

describe('trabajos pendientes', () => {
  it('despacha lo vencido y lo marca despachado', async () => {
    await encolar('invitacion', { destino: 'quien@ejemplo.test' })

    const vistos: unknown[] = []
    const resultado = await drenar({
      invitacion: async (carga) => {
        vistos.push(carga)
      },
    })

    expect(resultado).toEqual({ despachados: 1, fallidos: 0 })
    expect(vistos).toEqual([{ destino: 'quien@ejemplo.test' }])

    const [trabajo] = await prismaBase.trabajoPendiente.findMany({})
    expect(trabajo.estado).toBe('despachado')
  })

  it('si el manejador falla, queda pendiente con el proximo intento mas lejos', async () => {
    const creado = await encolar('invitacion', { destino: 'falla@ejemplo.test' })

    const resultado = await drenar({
      invitacion: async () => {
        throw new Error('el proveedor de correo no responde')
      },
    })

    expect(resultado).toEqual({ despachados: 0, fallidos: 1 })

    const trabajo = await prismaBase.trabajoPendiente.findUniqueOrThrow({
      where: { id: creado.id },
    })
    expect(trabajo.estado).toBe('pendiente')
    expect(trabajo.intentos).toBe(1)
    expect(trabajo.ultimoError).toContain('no responde')
    expect(trabajo.proximoIntento.getTime()).toBeGreaterThan(Date.now())
  })

  it('no vuelve a tomar lo que todavia no vencio', async () => {
    await encolar('invitacion', { destino: 'espera@ejemplo.test' })
    await drenar({
      invitacion: async () => {
        throw new Error('falla')
      },
    })

    const segunda = await drenar({
      invitacion: async () => {
        throw new Error('no deberia llamarse')
      },
    })

    expect(segunda).toEqual({ despachados: 0, fallidos: 0 })
  })

  it('el reenvio del administrador lo despacha sin esperar el proximo intento', async () => {
    const creado = await encolar('invitacion', { destino: 'reenvio@ejemplo.test' })
    await drenar({
      invitacion: async () => {
        throw new Error('falla')
      },
    })

    await reintentarAhora(creado.id)

    const resultado = await drenar({ invitacion: async () => undefined })
    expect(resultado.despachados).toBe(1)
  })

  it('deja pendiente lo que ningun manejador conoce', async () => {
    await encolar('confirmacion_subida', { clave: 'comprobantes/x' })

    const resultado = await drenar({ invitacion: async () => undefined })

    expect(resultado).toEqual({ despachados: 0, fallidos: 0 })
    const [trabajo] = await prismaBase.trabajoPendiente.findMany({})
    expect(trabajo.estado).toBe('pendiente')
  })
})

/**
 * SC-013b de punta a punta: el alta no depende del correo.
 *
 * Los casos de arriba prueban el mecanismo con manejadores de juguete. Este
 * prueba la promesa: con el proveedor caído el usuario **queda creado igual**,
 * y el correo sale cuando el servicio vuelve o cuando el administrador lo
 * reenvía. Es la clausula de notificaciones (RNF-14) vista desde el negocio.
 */
describe('el correo caído no voltea el alta (SC-013b)', () => {
  const RELOJ = relojFijo('2026-09-09T12:00:00Z')

  afterEach(limpiar)

  it('el usuario queda creado, el correo espera, y al volver el servicio sale', async () => {
    const administradora = await crearAdministradora()
    const consorcio = await crearConsorcio(administradora.id, 'Mitre 456')
    const admin = await crearUsuario('Ada')
    await habilitarEnConsorcio(admin.id, consorcio.id, 'administrador')

    const correo = `invitado-${crypto.randomUUID()}@ejemplo.test`

    const { usuarioId } = await invitarPersona(repositorioHabilitaciones, RELOJ, {
      invitadorId: admin.id,
      nombre: 'Franco',
      apellido: 'Ferrero',
      correo,
      rol: 'consorcista',
      consorcioId: consorcio.id,
      consorcioNombre: 'Mitre 456',
      vigenciaDesde: new Date('2026-09-09'),
      urlBase: 'https://flay.test',
    })

    // El alta cerró: la persona existe y puede ser habilitada, haya correo o no.
    const invitado = await prismaBase.usuario.findUniqueOrThrow({ where: { id: usuarioId } })
    expect(invitado.estado).toBe('invitado')

    // Primer intento con el proveedor caído.
    const caido = await drenar({
      invitacion: async () => {
        throw new Error('el proveedor de correo no responde')
      },
    })
    expect(caido).toEqual({ despachados: 0, fallidos: 1 })

    const enEspera = await prismaBase.trabajoPendiente.findFirstOrThrow({
      where: { tipo: 'invitacion' },
    })
    expect(enEspera.estado).toBe('pendiente')
    expect(enEspera.ultimoError).toContain('no responde')

    // El administrador no espera la espera creciente: reenvía.
    await reintentarAhora(enEspera.id)

    const enviados: string[] = []
    const vuelto = await drenar({
      invitacion: async (carga) => {
        enviados.push((carga as { destino: string }).destino)
      },
    })

    expect(vuelto).toEqual({ despachados: 1, fallidos: 0 })
    expect(enviados).toEqual([correo])

    const despachado = await prismaBase.trabajoPendiente.findUniqueOrThrow({
      where: { id: enEspera.id },
    })
    expect(despachado.estado).toBe('despachado')
    expect(despachado.ultimoError).toBeNull()
  })

  it('el enlace que sale por correo es el que fija la contraseña', async () => {
    const administradora = await crearAdministradora()
    const consorcio = await crearConsorcio(administradora.id, 'San Luis 900')
    const admin = await crearUsuario('Ada')
    await habilitarEnConsorcio(admin.id, consorcio.id, 'administrador')

    await invitarPersona(repositorioHabilitaciones, RELOJ, {
      invitadorId: admin.id,
      nombre: 'Lucia',
      apellido: 'Gomez',
      correo: `lucia-${crypto.randomUUID()}@ejemplo.test`,
      rol: 'consorcista',
      consorcioId: consorcio.id,
      consorcioNombre: 'San Luis 900',
      vigenciaDesde: new Date('2026-09-09'),
      urlBase: 'https://flay.test',
    })

    let enlace = ''
    await drenar({
      invitacion: async (carga) => {
        enlace = (carga as { enlaceDeAlta: string }).enlaceDeAlta
      },
    })

    expect(enlace.startsWith('https://flay.test/invitacion/')).toBe(true)
  })
})
