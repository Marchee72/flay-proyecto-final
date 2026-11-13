import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import { ErrorDeAplicacion, RolInsuficiente } from '@/compartido/errores'
import {
  guardarInstruccionesDePago,
  InstruccionesDemasiadoLargas,
  verInstruccionesDePago,
} from '@/aplicacion/consorcios/instrucciones-de-pago'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { verExpensa } from '@/aplicacion/liquidacion/ver-expensa'
import { periodoPara } from '@/aplicacion/periodos/periodos'
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

/** RF-09 (A7): cómo pagar por fuera de la pasarela, escrito por el administrador. */

const repo = repositorioHabilitaciones
const RELOJ = relojFijo('2026-09-05T12:00:00Z')

const almacenDoble: AlmacenObjetos = {
  async emitirPermisoDeSubida(clave) {
    return { clave, credencial: 'x', vence: new Date() }
  },
  async guardar() {},
  async resolverLecturaAutorizada(clave) {
    return `https://almacen.test/${clave}`
  },
  async eliminar() {},
}

let consorcioId: string
let administrador: string
let consorcista: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Alvear 100')).id
  administrador = (await crearUsuario('Ada')).id
  consorcista = (await crearUsuario('Beto')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(consorcista, consorcioId, 'consorcista')
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await limpiar()
})

async function expensaDelConsorcista() {
  const rubro = await prismaBase.rubroGasto.upsert({
    where: { nombre: 'Rubro de prueba' },
    update: {},
    create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
  })
  await cargarPadron(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidades: [{ designacion: '1A', coeficiente: '100.00000000' }],
  })
  const { periodoId } = await periodoPara(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    anio: 2026,
    mes: 8,
  })
  await registrarGasto(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    periodoId,
    rubroId: rubro.id,
    importe: '40000.00',
    fecha: new Date('2026-08-10'),
    descripcion: 'Limpieza',
  })
  await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
  const emitida = await liquidarPeriodo(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    periodoId,
  })
  const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
    where: { liquidacionId: emitida.liquidacionId },
  })
  await registrarOcupacion(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidadId: detalle.unidadId,
    personaId: (await prismaBase.usuario.findUniqueOrThrow({ where: { id: consorcista } }))
      .personaId,
    tipo: 'propietario',
    desde: new Date('2026-01-01'),
  })
  return detalle.id
}

describe('instrucciones de pago por consorcio (RF-09)', () => {
  it('el administrador guarda las instrucciones y el consorcista las ve en su expensa', async () => {
    const detalleId = await expensaDelConsorcista()

    await guardarInstruccionesDePago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      texto: '  Alias: alvear.100\nHorario: lunes a viernes de 9 a 13  ',
    })

    const expensa = await verExpensa(almacenDoble, repo, RELOJ, {
      usuarioId: consorcista,
      consorcioId,
      detalleId,
    })
    expect(expensa.instruccionesDePago).toBe(
      'Alias: alvear.100\nHorario: lunes a viernes de 9 a 13',
    )
    expect(await verInstruccionesDePago(repo, RELOJ, { usuarioId: consorcista, consorcioId })).toBe(
      'Alias: alvear.100\nHorario: lunes a viernes de 9 a 13',
    )
  })

  it('más de 1000 caracteres se rechaza', async () => {
    const intento = guardarInstruccionesDePago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      texto: 'a'.repeat(1001),
    })
    await expect(intento).rejects.toBeInstanceOf(InstruccionesDemasiadoLargas)
    await expect(intento).rejects.toMatchObject({
      mensajeParaUsuario: 'Las instrucciones de pago pueden tener hasta 1000 caracteres.',
    })
    await expect(intento).rejects.toBeInstanceOf(ErrorDeAplicacion)

    await guardarInstruccionesDePago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      texto: 'a'.repeat(1000),
    })
  })

  it('un consorcista no puede guardarlas', async () => {
    await expect(
      guardarInstruccionesDePago(repo, RELOJ, {
        usuarioId: consorcista,
        consorcioId,
        texto: 'Alias: x',
      }),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('texto vacío las borra', async () => {
    await guardarInstruccionesDePago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      texto: 'Alias: x',
    })
    await guardarInstruccionesDePago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      texto: '   ',
    })

    expect(
      await verInstruccionesDePago(repo, RELOJ, { usuarioId: administrador, consorcioId }),
    ).toBeNull()
  })
})
