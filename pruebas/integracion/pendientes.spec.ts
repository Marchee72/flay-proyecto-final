import { afterEach, describe, expect, it } from 'vitest'

import { encolar } from '@/aplicacion/pendientes/encolar'
import { drenar, reintentarAhora } from '@/aplicacion/pendientes/drenar'
import { prismaBase } from '@/infraestructura/prisma'

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
