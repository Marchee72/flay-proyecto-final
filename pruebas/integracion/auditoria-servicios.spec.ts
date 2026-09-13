import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { confirmarExtraccion, iniciarCargaAsistida } from '@/aplicacion/gastos/extraccion'
import { abrirPeriodo } from '@/aplicacion/periodos/periodos'
import { registrarReclamo } from '@/aplicacion/reclamos/registrar'
import { transicionar } from '@/aplicacion/reclamos/transicionar'
import { altaEspacio } from '@/aplicacion/reservas/espacios'
import { cancelarReserva, reservar } from '@/aplicacion/reservas/reservar'
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
 * Auditoria de las tablas de esta etapa (`FR-032`, SC-021, regla RN-15): alta
 * y cambio de `Reclamo`, `Reserva` y `ExtraccionComprobante` dejan exactamente
 * un asiento cada uno, con anterior y posterior. Como la bitacora no se limpia
 * (nota 2 de CLAUDE.md), cada prueba se acota a sus propias claves.
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones
const HORA = 60 * 60 * 1000
const enHoras = (h: number) => new Date(RELOJ.ahora().getTime() + h * HORA)

let consorcioId: string
let administrador: string
let unidadId: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  const usuario = await crearUsuario('Ada')
  administrador = usuario.id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await cargarPadron(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidades: [{ designacion: '1A', coeficiente: '100.00000000' }],
  })
  unidadId = (await prismaBase.unidad.findFirstOrThrow({ where: { consorcioId } })).id
  await registrarOcupacion(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidadId,
    personaId: usuario.personaId,
    tipo: 'propietario',
    desde: new Date('2026-01-01'),
  })
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await prismaBase.trabajoPendiente.deleteMany({})
  await prismaBase.$executeRaw`DELETE FROM "Reserva"`
  await prismaBase.$executeRaw`DELETE FROM "Ocupacion"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

const asientosDe = (tabla: string, clave: string) =>
  prismaBase.bitacoraAuditoria.findMany({
    where: { tabla, clave },
    orderBy: { momento: 'asc' },
    select: { operacion: true, anterior: true, posterior: true },
  })

const campo = (fila: unknown, nombre: string) => (fila as Record<string, unknown>)[nombre]

describe('auditoria de servicios (SC-021)', () => {
  it('un reclamo deja un asiento al abrir y uno por transicion, con el estado anterior', async () => {
    const { reclamoId } = await registrarReclamo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      titulo: 'Gotera',
      descripcion: 'Gotea en el palier del tercero desde ayer.',
    })
    await transicionar(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      reclamoId,
      hacia: 'asignado',
      responsableId: administrador,
    })
    const asientos = await asientosDe('Reclamo', reclamoId)
    expect(asientos.map((a) => a.operacion)).toEqual(['INSERTA', 'MODIFICA'])
    expect(asientos[0].anterior).toBeNull()
    expect(campo(asientos[0].posterior, 'estado')).toBe('abierto')
    expect(campo(asientos[1].anterior, 'estado')).toBe('abierto')
    expect(campo(asientos[1].posterior, 'estado')).toBe('asignado')
    expect(campo(asientos[1].posterior, 'responsable_id')).toBe(administrador)
  })

  it('una reserva deja un asiento al confirmar y otro al cancelar', async () => {
    const { espacioId } = await altaEspacio(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      nombre: 'SUM',
      capacidadMaxima: 40,
    })
    const { reservaId } = await reservar(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      espacioId,
      unidadId,
      desde: enHoras(72),
      hasta: enHoras(76),
    })
    await cancelarReserva(repo, RELOJ, { usuarioId: administrador, consorcioId, reservaId })
    const asientos = await asientosDe('Reserva', reservaId)
    expect(asientos.map((a) => a.operacion)).toEqual(['INSERTA', 'MODIFICA'])
    expect(campo(asientos[0].posterior, 'estado')).toBe('confirmada')
    expect(campo(asientos[1].anterior, 'estado')).toBe('confirmada')
    expect(campo(asientos[1].posterior, 'estado')).toBe('cancelada')
  })

  it('una extraccion deja asiento al cargar y al confirmar, y el gasto nacido deja el suyo', async () => {
    const rubro = await prismaBase.rubroGasto.upsert({
      where: { nombre: 'Rubro de prueba' },
      update: {},
      create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
    })
    const { periodoId } = await abrirPeriodo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      anio: 2026,
      mes: 9,
    })
    const { extraccionId } = await iniciarCargaAsistida(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      clave: `extracciones/${consorcioId}/${crypto.randomUUID()}/f.pdf`,
      tipoContenido: 'application/pdf',
    })
    // La propuesta que dejaria la cola; el asiento es del disparador, no del manejador.
    await prismaBase.extraccionComprobante.update({
      where: { id: extraccionId },
      data: {
        estado: 'propuesta',
        importeDetectado: '100.00',
        fechaDetectada: new Date('2026-09-01'),
        rubroSugeridoId: rubro.id,
        procesadoEn: RELOJ.ahora(),
      },
    })
    const { gastoId } = await confirmarExtraccion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      extraccionId,
      periodoId,
      rubroId: rubro.id,
      importe: '100.00',
      fecha: new Date('2026-09-01'),
      descripcion: 'Factura',
    })
    const asientos = await asientosDe('ExtraccionComprobante', extraccionId)
    expect(asientos.map((a) => a.operacion)).toEqual(['INSERTA', 'MODIFICA', 'MODIFICA'])
    expect(campo(asientos[0].posterior, 'estado')).toBe('pendiente')
    expect(campo(asientos[2].anterior, 'estado')).toBe('propuesta')
    expect(campo(asientos[2].posterior, 'estado')).toBe('confirmada')
    expect(campo(asientos[2].posterior, 'gasto_id')).toBe(gastoId)
    // El gasto es economico y ya estaba auditado desde 002: exactamente un alta.
    expect((await asientosDe('Gasto', gastoId)).map((a) => a.operacion)).toEqual(['INSERTA'])
  })
})
