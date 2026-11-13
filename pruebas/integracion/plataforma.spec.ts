import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { altaAdministradora } from '@/aplicacion/administradoras/alta-administradora'
import { altaConsorcio, ConsorcioYaExiste } from '@/aplicacion/consorcios/alta-consorcio'
import { RolInsuficiente } from '@/compartido/errores'
import { CuitInvalido } from '@/aplicacion/proveedores/proveedores'
import { prismaBase } from '@/infraestructura/prisma'
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
 * SC-002c: el alta de administradoras es de plataforma; la de consorcios, de
 * plataforma o de la administradora dueña. Son las dos operaciones que
 * trabajan por encima del aislamiento, asi que el rol tiene que ser escaso y
 * verificado.
 */

const RELOJ = relojFijo('2026-09-09T12:00:00Z')

let superAdmin: string
let comun: string
let delta: string

beforeEach(async () => {
  superAdmin = (await crearUsuario('Lautaro')).id
  await habilitarEnPlataforma(superAdmin)
  comun = (await crearUsuario('Otro')).id
  delta = (await crearAdministradora()).id
})

afterEach(limpiar)

// Once digitos: el alta normaliza el CUIT y descarta lo que no sea numero.
const cuitUnico = () =>
  `30${Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, '0')}0`

const datosConsorcio = (usuarioId: string, administradoraId: string) => ({
  usuarioId,
  administradoraId,
  nombre: 'Mitre 456',
  direccion: 'Mitre 456',
  localidad: 'Rosario',
  cuit: cuitUnico(),
})

describe('alta de administradora', () => {
  it('la crea el super administrador', async () => {
    const { administradoraId } = await altaAdministradora(repositorioHabilitaciones, RELOJ, {
      usuarioId: superAdmin,
      razonSocial: 'Nueva Administradora',
      cuit: cuitUnico(),
    })

    const creada = await prismaBase.administradora.findUniqueOrThrow({
      where: { id: administradoraId },
    })
    expect(creada.razonSocial).toBe('Nueva Administradora')
  })

  it('el CUIT de la administradora se normaliza y uno inválido se rechaza', async () => {
    const { administradoraId } = await altaAdministradora(repositorioHabilitaciones, RELOJ, {
      usuarioId: superAdmin,
      razonSocial: 'Con Guiones SRL',
      cuit: '30712345671',
    })
    const creada = await prismaBase.administradora.findUniqueOrThrow({
      where: { id: administradoraId },
    })
    expect(creada.cuit).toBe('30-71234567-1')

    await expect(
      altaAdministradora(repositorioHabilitaciones, RELOJ, {
        usuarioId: superAdmin,
        razonSocial: 'Mala SRL',
        cuit: '30',
      }),
    ).rejects.toBeInstanceOf(CuitInvalido)
  })

  it('una razón social vacía se rechaza con su mensaje', async () => {
    await expect(
      altaAdministradora(repositorioHabilitaciones, RELOJ, {
        usuarioId: superAdmin,
        razonSocial: '   ',
        cuit: cuitUnico(),
      }),
    ).rejects.toThrow('Escribí la razón social.')
  })

  it('no la puede crear alguien con habilitacion de empresa', async () => {
    await habilitarEnAdministradora(comun, delta)

    await expect(
      altaAdministradora(repositorioHabilitaciones, RELOJ, {
        usuarioId: comun,
        razonSocial: 'Intento',
        cuit: `30-${crypto.randomUUID().slice(0, 8)}-2`,
      }),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })
})

describe('alta de consorcio', () => {
  it('el super administrador lo crea y queda habilitado sobre el', async () => {
    const { consorcioId } = await altaConsorcio(
      repositorioHabilitaciones,
      RELOJ,
      datosConsorcio(superAdmin, delta),
    )

    const habilitacion = await prismaBase.habilitacion.findFirstOrThrow({
      where: { usuarioId: superAdmin, consorcioId },
    })
    expect(habilitacion.rol).toBe('administrador')

    const consorcio = await prismaBase.consorcio.findUniqueOrThrow({ where: { id: consorcioId } })
    expect(consorcio.administradoraId).toBe(delta)
  })

  it('un administrador de otro consorcio no puede', async () => {
    const otro = await crearConsorcio(delta, 'San Luis 900')
    await habilitarEnConsorcio(comun, otro.id, 'administrador')

    await expect(
      altaConsorcio(repositorioHabilitaciones, RELOJ, datosConsorcio(comun, delta)),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('quien tiene habilitacion de empresa lo crea en su administradora, no en otra', async () => {
    await habilitarEnAdministradora(comun, delta)

    const { consorcioId } = await altaConsorcio(
      repositorioHabilitaciones,
      RELOJ,
      datosConsorcio(comun, delta),
    )
    const consorcio = await prismaBase.consorcio.findUniqueOrThrow({ where: { id: consorcioId } })
    expect(consorcio.administradoraId).toBe(delta)

    const ajena = (await crearAdministradora('Otra SRL')).id
    await expect(
      altaConsorcio(repositorioHabilitaciones, RELOJ, datosConsorcio(comun, ajena)),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('una habilitacion de plataforma vencida ayer ya no alcanza', async () => {
    await prismaBase.habilitacionPlataforma.updateMany({
      where: { usuarioId: superAdmin },
      data: { vigenciaHasta: new Date('2026-09-08') },
    })

    await expect(
      altaConsorcio(repositorioHabilitaciones, RELOJ, datosConsorcio(superAdmin, delta)),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('crea el padron en la misma alta, cada unidad con su fila de historia (FR-011c)', async () => {
    // Doce unidades, con el ajuste de redondeo en la primera para cerrar en
    // 100,00000000 exacto. Entran por lote (dos `createMany`), no de a una: es
    // lo que evita pasarse del tope de la transaccion contra la base administrada.
    const unidades = Array.from({ length: 12 }, (_, i) => ({
      designacion: `${Math.floor(i / 4) + 1}${'ABCD'[i % 4]}`,
      coeficiente: i === 0 ? '8.33333337' : '8.33333333',
    }))

    const { consorcioId } = await altaConsorcio(repositorioHabilitaciones, RELOJ, {
      ...datosConsorcio(superAdmin, delta),
      unidades,
    })

    const creadas = await prismaBase.unidad.findMany({
      where: { consorcioId },
      select: { id: true, designacion: true },
    })
    expect(creadas).toHaveLength(12)
    expect(creadas.map((u) => u.designacion).sort()).toContain('1A')

    const historia = await prismaBase.coeficienteHistorico.count({
      where: { unidadId: { in: creadas.map((u) => u.id) } },
    })
    expect(historia).toBe(12)
  })

  it('rechaza un CUIT repetido con mensaje para el usuario final', async () => {
    const datos = datosConsorcio(superAdmin, delta)
    await altaConsorcio(repositorioHabilitaciones, RELOJ, datos)

    await expect(altaConsorcio(repositorioHabilitaciones, RELOJ, datos)).rejects.toThrow(
      'Ya hay un consorcio con ese CUIT.',
    )
  })

  it('un CUIT de 2 dígitos se rechaza', async () => {
    await expect(
      altaConsorcio(repositorioHabilitaciones, RELOJ, {
        ...datosConsorcio(superAdmin, delta),
        cuit: '30',
      }),
    ).rejects.toBeInstanceOf(CuitInvalido)
  })

  it('el CUIT se guarda normalizado', async () => {
    const { consorcioId } = await altaConsorcio(repositorioHabilitaciones, RELOJ, {
      ...datosConsorcio(superAdmin, delta),
      cuit: '30712345671',
    })
    const consorcio = await prismaBase.consorcio.findUniqueOrThrow({ where: { id: consorcioId } })
    expect(consorcio.cuit).toBe('30-71234567-1')
  })

  it('la misma dirección y localidad en la misma administradora se rechaza, sin importar mayúsculas', async () => {
    await altaConsorcio(repositorioHabilitaciones, RELOJ, datosConsorcio(superAdmin, delta))

    await expect(
      altaConsorcio(repositorioHabilitaciones, RELOJ, {
        ...datosConsorcio(superAdmin, delta),
        direccion: ' MITRE 456 ',
        localidad: 'rosario',
      }),
    ).rejects.toBeInstanceOf(ConsorcioYaExiste)
  })

  it('la misma dirección en otra administradora se acepta', async () => {
    await altaConsorcio(repositorioHabilitaciones, RELOJ, datosConsorcio(superAdmin, delta))
    const ajena = (await crearAdministradora('Otra SRL')).id

    await expect(
      altaConsorcio(repositorioHabilitaciones, RELOJ, datosConsorcio(superAdmin, ajena)),
    ).resolves.toHaveProperty('consorcioId')
  })
})
