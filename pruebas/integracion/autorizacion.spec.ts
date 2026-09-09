import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { conAutorizacion } from '@/aplicacion/autorizacion'
import { NoEncontrado, RolInsuficiente } from '@/compartido/errores'
import type { Rol } from '@/dominio/identidad/rol'
import { consorcioActivo } from '@/infraestructura/cliente-aislado'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnAdministradora,
  habilitarEnConsorcio,
  habilitarEnPlataforma,
  limpiar,
} from './ayudas'

/**
 * FR-007c: el rol efectivo se resuelve en un solo lugar por los tres niveles.
 * SC-002, SC-002b, SC-002d y SC-002e verifican que cada nivel alcance lo que
 * debe y nada mas.
 */

const HOY = relojFijo('2026-09-09T12:00:00Z')

let delta: string
let otra: string
let consorcioA: string
let consorcioB: string
let deOtraEmpresa: string
let usuario: string

beforeEach(async () => {
  delta = (await crearAdministradora('Grupo Delta')).id
  otra = (await crearAdministradora('Otra Administradora')).id
  consorcioA = (await crearConsorcio(delta, 'Mitre 456')).id
  consorcioB = (await crearConsorcio(delta, 'San Luis 900')).id
  deOtraEmpresa = (await crearConsorcio(otra, 'Ajeno 100')).id
  usuario = (await crearUsuario()).id
})

afterEach(limpiar)

const correr = (consorcioId: string, rolesPermitidos?: readonly Rol[]) =>
  conAutorizacion(
    repositorioHabilitaciones,
    HOY,
    { usuarioId: usuario, consorcioId, rolesPermitidos, accion: 'esta prueba' },
    async (acceso) => ({
      consorcio: consorcioActivo(),
      origen: acceso.origen,
      roles: acceso.roles,
    }),
  )

describe('nivel consorcio', () => {
  it('sin habilitacion, no encuentra nada', async () => {
    await expect(correr(consorcioA)).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('con habilitacion sobre otro consorcio, tampoco', async () => {
    await habilitarEnConsorcio(usuario, consorcioA, 'administrador')
    await expect(correr(consorcioB)).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('con habilitacion vigente, abre el contexto de aislamiento', async () => {
    await habilitarEnConsorcio(usuario, consorcioA, 'administrador')
    await expect(correr(consorcioA)).resolves.toMatchObject({
      consorcio: consorcioA,
      origen: 'consorcio',
      roles: ['administrador'],
    })
  })

  it('el rol que no alcanza es rechazado, aunque la habilitacion sea vigente', async () => {
    await habilitarEnConsorcio(usuario, consorcioA, 'consorcista')
    await expect(correr(consorcioA, ['administrador'])).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('el consejo se suma a consorcista en vez de reemplazarlo', async () => {
    await habilitarEnConsorcio(usuario, consorcioA, 'consorcista')
    await habilitarEnConsorcio(usuario, consorcioA, 'consejo')

    const acceso = await correr(consorcioA)
    expect(acceso.roles.toSorted()).toEqual(['consejo', 'consorcista'])

    // Alcanza con que uno de sus roles este permitido.
    await expect(correr(consorcioA, ['consejo'])).resolves.toBeTruthy()
  })
})

describe('nivel empresa (SC-002d)', () => {
  beforeEach(() => habilitarEnAdministradora(usuario, delta))

  it('alcanza todos los consorcios de su cartera, como administrador', async () => {
    for (const consorcio of [consorcioA, consorcioB]) {
      await expect(correr(consorcio)).resolves.toMatchObject({
        origen: 'administradora',
        roles: ['administrador'],
      })
    }
  })

  it('no alcanza los consorcios de otra administradora', async () => {
    await expect(correr(deOtraEmpresa)).rejects.toBeInstanceOf(NoEncontrado)
  })
})

describe('nivel plataforma', () => {
  it('el super administrador alcanza cualquier consorcio, de cualquier empresa', async () => {
    await habilitarEnPlataforma(usuario)

    await expect(correr(deOtraEmpresa)).resolves.toMatchObject({
      origen: 'plataforma',
      roles: ['administrador'],
    })
  })
})

describe('vigencia y mensajes', () => {
  it('una habilitacion que vencio ayer equivale a inexistente', async () => {
    const habilitacion = await habilitarEnConsorcio(usuario, consorcioA, 'administrador')
    await import('@/infraestructura/prisma').then(({ prismaBase }) =>
      prismaBase.habilitacion.update({
        where: { id: habilitacion.id },
        data: { vigenciaHasta: new Date('2026-09-08') },
      }),
    )

    await expect(correr(consorcioA)).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('el mensaje de «no encontrado» no revela que el consorcio existe', async () => {
    await expect(correr(deOtraEmpresa)).rejects.toThrow('No encontramos lo que buscabas.')
  })
})
