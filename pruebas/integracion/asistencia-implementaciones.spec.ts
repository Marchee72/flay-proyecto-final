import { readdirSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Asistencia } from '@/dominio/contratos/asistencia'
import { asistenciaDeterminista } from '@/infraestructura/asistencia/determinista'
import { asistenciaGemini } from '@/infraestructura/asistencia/gemini'
import { asistenciaNula } from '@/infraestructura/asistencia/nula'

/**
 * SC-012: cada interfaz del dominio tiene **exactamente tres**
 * implementaciones —proveedor, determinista, nula—, y se cuentan como
 * archivos. La nula no lanza; la determinista es idempotente (RNF-14, RNF-15).
 */

const RUBROS = [
  { codigo: 'R01', nombre: 'Limpieza', descripcion: 'Gasto corriente' },
  { codigo: 'R02', nombre: 'Mantenimiento de ascensores', descripcion: 'Gasto corriente' },
]

const exponeLasCuatro = (a: Asistencia) =>
  typeof a.extractor.extraer === 'function' &&
  typeof a.clasificador.clasificar === 'function' &&
  typeof a.vectores.vectorizar === 'function' &&
  typeof a.respuestas.responder === 'function' &&
  a.vectores.dimensiones === 768

describe('tres implementaciones por interfaz (SC-012)', () => {
  it('src/infraestructura/asistencia tiene exactamente tres archivos', () => {
    const archivos = readdirSync('src/infraestructura/asistencia').sort()
    expect(archivos).toEqual(['determinista.ts', 'gemini.ts', 'nula.ts'])
  })

  it('cada una expone las cuatro interfaces', () => {
    for (const a of [asistenciaGemini, asistenciaDeterminista, asistenciaNula]) {
      expect(exponeLasCuatro(a)).toBe(true)
    }
  })

  it('la nula responde «no disponible» en los cuatro metodos, sin lanzar', async () => {
    const r1 = await asistenciaNula.extractor.extraer(
      { bytes: new Uint8Array(), tipoContenido: 'application/pdf' },
      { rubros: RUBROS },
    )
    const r2 = await asistenciaNula.clasificador.clasificar(
      { titulo: 'x', descripcion: 'y' },
      { rubros: RUBROS, proveedores: [] },
    )
    const r3 = await asistenciaNula.vectores.vectorizar(['hola'], 'consulta')
    const r4 = await asistenciaNula.respuestas.responder('¿?', [])
    for (const r of [r1, r2, r3, r4]) {
      expect(r.disponible).toBe(false)
      if (!r.disponible) expect(r.motivo).toMatch(/no está configurado/)
    }
  })

  it('la determinista es idempotente: mismo texto, mismo vector, y el vector tiene 768 dimensiones', async () => {
    const a = await asistenciaDeterminista.vectores.vectorizar(
      ['El SUM se reserva con 48 horas'],
      'documento',
    )
    const b = await asistenciaDeterminista.vectores.vectorizar(
      ['El SUM se reserva con 48 horas'],
      'documento',
    )
    expect(a).toEqual(b)
    if (a.disponible) expect(a.valor[0]).toHaveLength(768)
  })

  it('la determinista clasifica agua como critica y no inventa proveedores', async () => {
    const r = await asistenciaDeterminista.clasificador.clasificar(
      { titulo: 'Perdida de agua', descripcion: 'Sale agua por el techo del palier' },
      { rubros: RUBROS, proveedores: [{ id: 'p1', nombre: 'Plomero', rubros: ['Limpieza'] }] },
    )
    expect(r.disponible).toBe(true)
    if (r.disponible) {
      expect(r.valor.urgencia).toBe('critica')
      expect(['p1', null]).toContain(r.valor.proveedorId)
    }
  })
})
