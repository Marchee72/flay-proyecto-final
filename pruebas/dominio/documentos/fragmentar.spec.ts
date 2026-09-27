import { describe, expect, it } from 'vitest'

import { fragmentar } from '@/dominio/documentos/fragmentar'

/** Fragmentacion sin base (`RF-20`, research R-05, T063). */

describe('fragmentar', () => {
  it('un texto con articulos da un fragmento por articulo, con su pagina', () => {
    const paginas = [
      {
        pagina: 1,
        texto: [
          'Capítulo 1 — Objeto',
          '',
          'Art. 1. El inmueble queda sometido al régimen de propiedad horizontal.',
          '',
          'Art. 2. El edificio se compone de doce pisos.',
          '',
          'Art. 3. Cada unidad comprende la parte privativa.',
        ].join('\n'),
      },
      {
        pagina: 2,
        texto: [
          'Art. 4. Son cosas comunes el terreno y los cimientos.',
          '',
          'Art. 5. Los balcones.',
        ].join('\n'),
      },
    ]
    const fragmentos = fragmentar(paginas)
    expect(fragmentos).toHaveLength(5)
    expect(fragmentos.map((f) => f.numero)).toEqual([1, 2, 3, 4, 5])
    expect(fragmentos[0].contenido).toContain('Capítulo 1')
    expect(fragmentos[0].contenido).toContain('Art. 1.')
    expect(fragmentos[3].pagina).toBe(2)
    expect(fragmentos[4].contenido).toBe('Art. 5. Los balcones.')
  })

  it('un texto sin articulos se agrupa por parrafos de ~1000 caracteres con el ultimo parrafo repetido', () => {
    const parrafo = (n: number) => `Párrafo ${n}. ${'palabra '.repeat(60).trim()}`
    const texto = Array.from({ length: 8 }, (_, i) => parrafo(i + 1)).join('\n\n')
    const fragmentos = fragmentar([{ pagina: 1, texto }])
    expect(fragmentos.length).toBeGreaterThan(1)
    for (let i = 1; i < fragmentos.length; i++) {
      const ultimoDelAnterior = fragmentos[i - 1].contenido.split('\n').at(-1)!
      expect(fragmentos[i].contenido.startsWith(ultimoDelAnterior)).toBe(true)
    }
    // Todo el texto esta en algun fragmento.
    for (let n = 1; n <= 8; n++) {
      expect(fragmentos.some((f) => f.contenido.includes(`Párrafo ${n}.`))).toBe(true)
    }
  })

  it('el texto de un PDF, sin lineas en blanco, igual se corta por articulo', () => {
    const texto = [
      'REGLAMENTO DE COPROPIEDAD',
      'Art. 1. El inmueble queda sometido al régimen',
      'de propiedad horizontal.',
      'Art. 2. Las mascotas se permiten con correa',
      'en los espacios comunes.',
      'Art. 3. El salón de usos múltiples se reserva.',
    ].join('\n')
    const fragmentos = fragmentar([{ pagina: 1, texto }])
    expect(fragmentos).toHaveLength(3)
    expect(fragmentos[1].contenido).toBe(
      'Art. 2. Las mascotas se permiten con correa\nen los espacios comunes.',
    )
  })

  it('un documento vacio da cero fragmentos sin error', () => {
    expect(fragmentar([])).toEqual([])
    expect(fragmentar([{ pagina: 1, texto: '   \n\n  ' }])).toEqual([])
  })
})
