import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { NoEncontrado, RolInsuficiente } from '@/compartido/errores'
import { plantillaPara } from '@/aplicacion/importacion/plantilla'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { leerPlanilla } from '@/infraestructura/planillas/leer-planilla'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

const RELOJ = relojFijo('2026-09-09T12:00:00Z')
let consorcioId: string
let administrador: string
let vecino: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id)).id
  administrador = (await crearUsuario('Ada')).id
  vecino = (await crearUsuario('Vera')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(vecino, consorcioId, 'consorcista')
})

afterEach(limpiar)

const pedir = (usuarioId: string, tipo: 'padron' | 'ocupantes', consorcio = consorcioId) =>
  plantillaPara(repositorioHabilitaciones, RELOJ, { usuarioId, consorcioId: consorcio, tipo })

describe('plantillaPara (RF-02, RF-03)', () => {
  it('el administrador recibe el xlsx con nombre por consorcio', async () => {
    const r = await pedir(administrador, 'padron')
    expect(r.nombre).toBe(`padron-${consorcioId}.xlsx`)
    expect((await leerPlanilla(r.bytes, r.nombre)).encabezados[0]).toBe('Designación')
  })

  it('ocupantes lista las designaciones vigentes del consorcio', async () => {
    await cargarPadron(repositorioHabilitaciones, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidades: [
        { designacion: '1A', coeficiente: '60.00000000' },
        { designacion: '1B', coeficiente: '40.00000000' },
      ],
    })
    const r = await pedir(administrador, 'ocupantes')
    const ExcelJS = (await import('exceljs')).default
    const libro = new ExcelJS.Workbook()
    await libro.xlsx.load(r.bytes as unknown as import('exceljs').Buffer)
    const listas = libro.getWorksheet('Listas')!
    const valores = [1, 2].map((i) => listas.getCell(`A${i}`).value)
    expect(valores.sort()).toEqual(['1A', '1B'])
  })

  it('el consorcista y quien no tiene acceso no la reciben', async () => {
    await expect(pedir(vecino, 'padron')).rejects.toBeInstanceOf(RolInsuficiente)
    await expect(pedir(administrador, 'padron', crypto.randomUUID())).rejects.toBeInstanceOf(
      NoEncontrado,
    )
  })
})
