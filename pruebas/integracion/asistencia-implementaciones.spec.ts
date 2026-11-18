import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Asistencia, PuntoParaRedactar } from '@/dominio/contratos/asistencia'
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

const exponeLasSiete = (a: Asistencia) =>
  typeof a.extractor.extraer === 'function' &&
  typeof a.clasificador.clasificar === 'function' &&
  typeof a.vectores.vectorizar === 'function' &&
  typeof a.respuestas.responder === 'function' &&
  typeof a.agente.conversar === 'function' &&
  typeof a.agente.sugerir === 'function' &&
  typeof a.redactor.redactar === 'function' &&
  typeof a.lector.leer === 'function' &&
  a.vectores.dimensiones === 768

describe('tres implementaciones por interfaz (SC-012)', () => {
  it('src/infraestructura/asistencia tiene exactamente tres archivos', () => {
    const archivos = readdirSync('src/infraestructura/asistencia').sort()
    expect(archivos).toEqual(['determinista.ts', 'gemini.ts', 'nula.ts'])
  })

  it('cada una expone las siete interfaces', () => {
    for (const a of [asistenciaGemini, asistenciaDeterminista, asistenciaNula]) {
      expect(exponeLasSiete(a)).toBe(true)
    }
  })

  it('la nula responde «no disponible» en los ocho metodos, sin lanzar', async () => {
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
    const r5 = await asistenciaNula.agente.conversar(
      { hoy: 'hoy', rolTexto: 'consorcista' },
      [],
      [],
      () => {},
    )
    const r6 = await asistenciaNula.agente.sugerir({ hoy: 'hoy', rolTexto: 'consorcista' }, [], [])
    const r7 = await asistenciaNula.redactor.redactar(
      { titulo: 'Ordinaria', tipo: 'ordinaria' },
      [],
      [],
    )
    const r8 = await asistenciaNula.lector.leer('texto', { espaciosExistentes: [] })
    for (const r of [r1, r2, r3, r4, r5, r6, r7, r8]) {
      expect(r.disponible).toBe(false)
      if (!r.disponible) expect(r.motivo).toMatch(/no está configurado/)
    }
  })

  it('la determinista repite votos y observaciones sin agregar nada', async () => {
    const punto = (orden: number): PuntoParaRedactar => ({
      orden,
      titulo: 'Pintura',
      descripcion: null,
      resultado: 'aprobado',
      provisorio: false,
      notas: null,
      conteo: [{ opcion: 'Abstención', unidades: 1, coeficiente: '10,00 %' }],
      presentesConVoto: 4,
      noVotaron: 3,
    })
    const r = await asistenciaDeterminista.redactor.redactar(
      { titulo: 'Ordinaria', tipo: 'ordinaria' },
      [punto(1), punto(2)],
      ['Falta el palier'],
    )
    if (!r.disponible) throw new Error('debía estar disponible')
    expect(r.valor[0].resumen).toContain('Abstención: 1 unidades, 10,00 %')
    expect(r.valor[0].resumen).toContain('No votaron 3 de 4')
    expect(r.valor[0].resumen).toContain('Falta el palier')
    expect(r.valor[1].resumen).not.toContain('Falta el palier')
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

  it('el lector determinista lee el reglamento de prueba y cita literal', async () => {
    const texto = readFileSync('pruebas/fixtures/reglamento-de-prueba.txt', 'utf-8')
    const r = await asistenciaDeterminista.lector.leer(texto, {
      espaciosExistentes: [{ id: 'e1', nombre: 'Quincho' }],
    })
    if (!r.disponible) throw new Error('debía estar disponible')
    expect(r.valor).toEqual([
      {
        tipo: 'espacio_nuevo',
        cita: expect.any(String),
        datos: {
          nombre: 'SUM',
          horario: { apertura: '10:00', cierre: '23:00' },
          anticipacionMinimaHoras: 48,
        },
      },
      {
        tipo: 'espacio_cambio',
        espacioId: 'e1',
        cita: expect.any(String),
        datos: { duracionMaximaHoras: 6 },
      },
      { tipo: 'vencimientos', cita: expect.any(String), datos: { tasaMoraMensual: '3.0000' } },
    ])
    for (const s of r.valor) expect(texto).toContain(s.cita)
    const otro = await asistenciaDeterminista.lector.leer('Nada de nada', {
      espaciosExistentes: [],
    })
    expect(otro).toEqual({ disponible: true, valor: [] })
  })
})
