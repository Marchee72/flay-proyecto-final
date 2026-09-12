import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { drenar } from '@/aplicacion/pendientes/drenar'
import { verReclamo } from '@/aplicacion/reclamos/consultar'
import { registrarReclamo } from '@/aplicacion/reclamos/registrar'
import {
  aplicarSugerencia,
  descartarSugerencia,
  manejadorTriage,
} from '@/aplicacion/reclamos/sugerencia'
import { asistenciaDeterminista } from '@/infraestructura/asistencia/determinista'
import { asistenciaNula } from '@/infraestructura/asistencia/nula'
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
 * Triage asistido (`RF-12`, `CU-14`, `FR-027`): la sugerencia sugiere y nunca
 * decide. El proveedor sugerido es del consorcio o nulo; aplicar copia rubro,
 * urgencia y proveedor sin tocar el estado; con la nula no hay sugerencia y el
 * reclamo existe igual (PI-09).
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let administrador: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  const rubro = await prismaBase.rubroGasto.upsert({
    where: { nombre: 'Mantenimiento de bombas y tanques' },
    update: {},
    create: { nombre: 'Mantenimiento de bombas y tanques', clasificacion: 'ordinario' },
  })
  await prismaBase.proveedor.create({
    data: {
      consorcioId,
      razonSocial: 'Bombas del Litoral',
      cuit: `30-${crypto.randomUUID().slice(0, 8)}-1`,
      rubroHabitualId: rubro.id,
    },
  })
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await prismaBase.trabajoPendiente.deleteMany({})
  await limpiar()
})

const abrir = () =>
  registrarReclamo(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    titulo: 'No sube el agua al tanque',
    descripcion: 'La bomba hace ruido y no sube agua a los pisos altos desde ayer.',
  })

describe('triage', () => {
  it('sugiere rubro, urgencia y un proveedor del consorcio; aplicar copia sin cambiar el estado', async () => {
    const { reclamoId } = await abrir()
    const resultado = await drenar({
      triage_reclamo: manejadorTriage(asistenciaDeterminista.clasificador),
    })
    expect(resultado.despachados).toBe(1)

    const antes = await verReclamo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      reclamoId,
    })
    expect(antes.sugerencia).not.toBeNull()
    expect(antes.sugerencia!.urgencia).toBe('critica')
    // La determinista elige por palabras: propone un rubro del catalogo, y el
    // proveedor, si lo hay, es uno del consorcio.
    expect(antes.sugerencia!.rubro).not.toBeNull()
    expect([null, 'Bombas del Litoral']).toContain(antes.sugerencia!.proveedor?.nombre ?? null)
    expect(antes.sugerencia!.aceptada).toBeNull()
    expect(antes.estado).toBe('abierto')
    expect(antes.rubro).toBeNull()

    await aplicarSugerencia(repo, RELOJ, { usuarioId: administrador, consorcioId, reclamoId })
    const despues = await verReclamo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      reclamoId,
    })
    expect(despues.rubro).toBe(antes.sugerencia!.rubro!.nombre)
    expect(despues.urgencia).toBe('critica')
    expect(despues.proveedor?.nombre ?? null).toBe(antes.sugerencia!.proveedor?.nombre ?? null)
    expect(despues.sugerencia!.aceptada).toBe(true)
    // Nunca cambia el estado ni pone responsable (FR-027).
    expect(despues.estado).toBe('abierto')
    expect(despues.responsable).toBeNull()
  })

  it('descartar marca aceptada = false y no toca el reclamo', async () => {
    const { reclamoId } = await abrir()
    await drenar({ triage_reclamo: manejadorTriage(asistenciaDeterminista.clasificador) })
    await descartarSugerencia(repo, RELOJ, { usuarioId: administrador, consorcioId, reclamoId })
    const r = await verReclamo(repo, RELOJ, { usuarioId: administrador, consorcioId, reclamoId })
    expect(r.sugerencia!.aceptada).toBe(false)
    expect(r.rubro).toBeNull()
    expect(r.urgencia).toBe('media')
  })

  it('un proveedor que no es del consorcio no se sugiere', async () => {
    const { reclamoId } = await abrir()
    const inventor = {
      async clasificar() {
        return {
          disponible: true as const,
          valor: {
            rubroCodigo: null,
            urgencia: 'alta' as const,
            proveedorId: crypto.randomUUID(),
            horasEstimadas: 5,
            confianza: '0.900',
          },
        }
      },
    }
    await drenar({ triage_reclamo: manejadorTriage(inventor) })
    const sugerencia = await prismaBase.sugerenciaReclamo.findUniqueOrThrow({
      where: { reclamoId },
    })
    expect(sugerencia.proveedorSugeridoId).toBeNull()
    expect(sugerencia.urgenciaSugerida).toBe('alta')
  })

  it('con la nula el reclamo se crea sin sugerencia (PI-09)', async () => {
    const { reclamoId } = await abrir()
    const resultado = await drenar({ triage_reclamo: manejadorTriage(asistenciaNula.clasificador) })
    expect(resultado).toEqual({ despachados: 1, fallidos: 0 })
    const r = await verReclamo(repo, RELOJ, { usuarioId: administrador, consorcioId, reclamoId })
    expect(r.sugerencia).toBeNull()
    expect(r.estado).toBe('abierto')
  })
})
