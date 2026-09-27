import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { verResumenConsorcio } from '@/aplicacion/consorcios/resumen'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { periodoPara } from '@/aplicacion/periodos/periodos'
import { altaProveedor } from '@/aplicacion/proveedores/proveedores'
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

/** El resumen por consorcio (diseno 2026-09-13 § 4.2): compone lecturas que ya existen. */
const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let otroConsorcioId: string
let administrador: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  otroConsorcioId = (await crearConsorcio(administradora.id, 'San Martin 7890')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(administrador, otroConsorcioId, 'administrador')
  await prismaBase.persona.updateMany({ data: { telefono: '341-5550000' } })
})

afterEach(async () => {
  await prismaBase.pago.deleteMany({})
  await limpiar()
})

describe('resumen del consorcio', () => {
  it('un consorcio recien creado tiene resumen: todo en cero, nada revienta', async () => {
    const resumen = await verResumenConsorcio(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
    })
    expect(resumen.periodoAbierto).toBeNull()
    expect(resumen.gastosDelPeriodo).toBe('0.00')
    expect(resumen.reclamosAbiertos).toBe(0)
    expect(resumen.ultimosGastos).toEqual([])
    expect(resumen.ultimosPagos).toEqual([])
    expect(resumen.padron).toEqual({ unidades: 0, cuadra: true })
    expect(resumen.contactos.map((c) => c.nombre)).toEqual(['Ada Diaz'])
    expect(resumen.contactos[0].telefono).toBe('341-5550000')
  })

  it('con periodo abierto suma sus gastos y deriva el proximo vencimiento', async () => {
    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidades: [
        { designacion: '1A', coeficiente: '50.00000000' },
        { designacion: '1B', coeficiente: '50.00000000' },
      ],
    })
    const { periodoId } = await periodoPara(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      anio: 2026,
      mes: 9,
    })
    const rubro = await prismaBase.rubroGasto.upsert({
      where: { nombre: 'Rubro de prueba' },
      update: {},
      create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
    })
    for (const importe of ['1000.00', '250.50']) {
      await registrarGasto(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        periodoId,
        rubroId: rubro.id,
        importe,
        fecha: new Date('2026-09-10'),
        descripcion: `Gasto de ${importe}`,
      })
    }
    // Un gasto del otro consorcio: no se cuela (RT-04).
    const { periodoId: ajeno } = await periodoPara(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: otroConsorcioId,
      anio: 2026,
      mes: 9,
    })
    await registrarGasto(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: otroConsorcioId,
      periodoId: ajeno,
      rubroId: rubro.id,
      importe: '99999.00',
      fecha: new Date('2026-09-10'),
      descripcion: 'Ajeno',
    })
    await altaProveedor(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      razonSocial: 'Plomeria Lopez',
      cuit: '20-11111111-1',
    })

    const resumen = await verResumenConsorcio(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
    })
    expect(resumen.periodoAbierto).toEqual({
      id: periodoId,
      etiqueta: '09/2026',
      vencimiento: '2026-10-10',
    })
    expect(resumen.gastosDelPeriodo).toBe('1250.50')
    // Los dos gastos son del mismo rubro: una sola fila con la suma (rediseño 013).
    expect(resumen.rubrosDelPeriodo).toEqual([{ rubro: 'Rubro de prueba', importe: '1250.50' }])
    // Sin liquidaciones emitidas todavia, el grafico de emitido va vacio.
    expect(resumen.emitidoPorMes).toEqual([])
    expect(resumen.unidades).toBe(2)
    expect(resumen.ultimosGastos.map((g) => g.descripcion)).toEqual([
      'Gasto de 250.50',
      'Gasto de 1000.00',
    ])
    expect(resumen.padron).toEqual({ unidades: 2, cuadra: true })
    expect(resumen.proveedores.map((p) => p.razonSocial)).toEqual(['Plomeria Lopez'])
  })

  it('el consorcista ve sus pagos y los reclamos propios o generales, nada ajeno (RN-12)', async () => {
    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidades: [
        { designacion: '1A', coeficiente: '50.00000000' },
        { designacion: '1B', coeficiente: '50.00000000' },
      ],
    })
    const unidades = await prismaBase.unidad.findMany({
      where: { consorcioId },
      orderBy: { designacion: 'asc' },
    })
    const [suya, ajena] = unidades
    const vecina = await crearUsuario('Nadia')
    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: suya.id,
      personaId: vecina.personaId,
      tipo: 'propietario',
      desde: new Date('2026-01-01'),
    })

    for (const unidad of [suya, ajena]) {
      await prismaBase.pago.create({
        data: {
          consorcioId,
          unidadId: unidad.id,
          fechaPago: new Date('2026-09-05'),
          importe: '100.00',
          medio: 'transferencia',
          registradoPor: administrador,
        },
      })
    }
    for (const [creadoPor, titulo, alcance] of [
      [administrador, 'Particular ajeno', 'individual'],
      [administrador, 'Del edificio', 'general'],
      [vecina.id, 'Mio', 'individual'],
    ] as const) {
      await prismaBase.reclamo.create({
        data: { consorcioId, creadoPor, titulo, descripcion: '-', alcance },
      })
    }

    const resumen = await verResumenConsorcio(repo, RELOJ, {
      usuarioId: vecina.id,
      consorcioId,
    })
    expect(resumen.ultimosPagos.map((p) => p.unidad)).toEqual(['1A'])
    expect(resumen.reclamosSinResponder.map((r) => r.titulo).sort()).toEqual([
      'Del edificio',
      'Mio',
    ])
    expect(resumen.reclamosAbiertos).toBe(2)

    // El administrador sigue viendo todo.
    const completo = await verResumenConsorcio(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
    })
    expect(completo.ultimosPagos).toHaveLength(2)
    expect(completo.reclamosAbiertos).toBe(3)
  })
})
