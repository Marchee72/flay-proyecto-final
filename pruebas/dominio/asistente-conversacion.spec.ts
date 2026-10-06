import { describe, expect, it } from 'vitest'

import type { HerramientaDisponible } from '@/dominio/contratos/asistencia'
import { asistenciaDeterminista } from '@/infraestructura/asistencia/determinista'
import { asistenciaNula } from '@/infraestructura/asistencia/nula'
import {
  HERRAMIENTAS,
  herramientasPara,
  parametrosParaModelo,
} from '@/aplicacion/asistente/herramientas'
import { tituloDe } from '../../src/app/(panel)/asistente/enlaces'

/**
 * Lo conversacional del asistente (RF-27) sin base: el texto llega en partes,
 * las sugerencias respetan lo ofrecido por rol y en cartera solo queda lo que
 * se declara `cartera`.
 */

const contexto = { hoy: 'lunes', rolTexto: 'administrador' }
const como = (nombres: string[]): HerramientaDisponible[] =>
  nombres.map((nombre) => ({ nombre, descripcion: '', parametros: {} }))
const dice = (texto: string) => [{ rol: 'usuario' as const, texto }]

describe('texto en partes', () => {
  it('la determinista emite mas de un fragmento y juntos dan el texto de la respuesta', async () => {
    const partes: string[] = []
    const r = await asistenciaDeterminista.agente.conversar(
      contexto,
      dice('escribime un poema'),
      como(['ver_espacios']),
      (f) => partes.push(f),
    )
    expect(r.disponible && r.valor.tipo === 'responder' && r.valor.texto).toBe(partes.join(''))
    expect(partes.length).toBeGreaterThan(1)
  })

  it('no emite nada cuando decide invocar una herramienta, ni la nula emite', async () => {
    const partes: string[] = []
    const r = await asistenciaDeterminista.agente.conversar(
      contexto,
      dice('ver_espacios'),
      como(['ver_espacios']),
      (f) => partes.push(f),
    )
    expect(r.disponible && r.valor.tipo).toBe('invocar')
    await asistenciaNula.agente.conversar(contexto, dice('hola'), [], (f) => partes.push(f))
    expect(partes).toEqual([])
  })
})

describe('sugerencias', () => {
  const sugerir = (texto: string, herramientas: string[]) =>
    asistenciaDeterminista.agente.sugerir(contexto, dice(texto), como(herramientas))

  it('ante «se rompio algo en la terraza» el administrador recibe reclamo y deshabilitar', async () => {
    const r = await sugerir('se rompió algo en la terraza', [
      'crear_reclamo',
      'deshabilitar_espacio',
      'ver_espacios',
    ])
    expect(r.disponible && r.valor.map((s) => s.herramienta)).toEqual([
      'crear_reclamo',
      'deshabilitar_espacio',
      'ver_espacios',
    ])
  })

  it('el consorcista, sin deshabilitar_espacio, no la recibe', async () => {
    const r = await sugerir('se rompió algo en la terraza', ['crear_reclamo', 'ver_espacios'])
    expect(r.disponible && r.valor.map((s) => s.herramienta)).toEqual([
      'crear_reclamo',
      'ver_espacios',
    ])
  })

  it('un pedido ajeno no sugiere nada y la nula degrada sin lanzar', async () => {
    const r = await sugerir('escribime un poema', ['crear_reclamo'])
    expect(r.disponible && r.valor).toEqual([])
    const n = await asistenciaNula.agente.sugerir(contexto, [], [])
    expect(n.disponible).toBe(false)
  })
})

describe('modo cartera', () => {
  const nombres = (h: { nombre: string }[]) => h.map((x) => x.nombre)

  it('ofrece lecturas, escrituras de un consorcio (que exigen nombrarlo) y el aviso a la cartera', () => {
    const ofrecidas = nombres(herramientasPara(['administrador'], true))
    expect(ofrecidas).toContain('deshabilitar_espacio')
    expect(ofrecidas).toContain('publicar_novedad_cartera')
    expect(ofrecidas).toContain('ver_reclamos')
  })

  it('fuera de cartera no se ofrece el aviso masivo, y el consorcista no lo recibe nunca', () => {
    expect(nombres(herramientasPara(['administrador']))).not.toContain('publicar_novedad_cartera')
    expect(nombres(herramientasPara(['consorcista'], true))).not.toContain(
      'publicar_novedad_cartera',
    )
  })

  it('consorcioId es opcional en cartera: omitirlo consulta todos los consorcios', () => {
    const ver = HERRAMIENTAS.find((h) => h.nombre === 'ver_reclamos')!
    const enCartera = parametrosParaModelo(ver, true) as {
      required?: string[]
      properties: { consorcioId: { description: string } }
    }
    expect(enCartera.required ?? []).not.toContain('consorcioId')
    expect(enCartera.properties.consorcioId.description).toContain('TODOS')
  })
})

describe('titulo del paso', () => {
  it('sale del mismo mapa que los enlaces y no inventa titulos', () => {
    expect(tituloDe('ver_reclamos')).toBe('Reclamos')
    expect(tituloDe('ver_gasto')).toBe('el gasto')
    expect(tituloDe('ver_bandeja')).toBe('Bandeja')
    expect(tituloDe('ver_rubros')).toBeNull()
  })
})
