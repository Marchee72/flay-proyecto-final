import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * SC-003: el filtro por consorcio aparece en **un solo archivo**. La busqueda
 * es la prueba: si alguien lo escribe a mano en una consulta de negocio, sale
 * aca y no en una revision.
 *
 * Las excepciones no son datos de negocio aislados, y cada una dice por que.
 * Cualquier archivo fuera de esta lista es una violacion del Principio I.
 */
const PERMITIDOS: Record<string, string> = {
  'src/infraestructura/cliente-aislado.ts': 'es el unico punto donde se inyecta el filtro',
  'src/infraestructura/repositorios/habilitaciones.ts':
    'decide el aislamiento: sujetarla a el seria circular',
  'src/aplicacion/consorcios/ver-consorcio.ts':
    'la cabecera es el consorcio, direccionado por su propio identificador',
  'src/aplicacion/liquidacion/liquidar.ts':
    'lee del consorcio, por su propio identificador, el dia de vencimiento y la tasa de mora',
  'src/aplicacion/consorcios/alta-consorcio.ts':
    'crea el consorcio: trabaja por encima del aislamiento, no hay contexto todavia',
  'src/aplicacion/consorcios/registrar-ocupacion.ts': 'otorga la habilitacion del consorcista',
  'src/aplicacion/identidad/invitar-persona.ts': 'otorga la habilitacion de la persona invitada',
}

/** El filtro escrito a mano: `consorcioId` dentro de un `where` o un `data`. */
const FILTRO = /(where|data)\s*:\s*\{[^{}]*consorcio_?[iI]d/

function* archivos(directorio: string): Generator<string> {
  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    const ruta = join(directorio, entrada.name)
    if (entrada.isDirectory()) yield* archivos(ruta)
    else if (/\.tsx?$/.test(entrada.name)) yield ruta
  }
}

describe('filtro por consorcio', () => {
  it('no se escribe a mano fuera de los archivos que lo justifican', () => {
    const conFiltro = [...archivos('src')]
      .filter((ruta) => FILTRO.test(readFileSync(ruta, 'utf8')))
      .map((ruta) => ruta.replaceAll('\\', '/'))

    expect(conFiltro.filter((ruta) => !(ruta in PERMITIDOS))).toEqual([])
  })

  it('la lista de excepciones no acumula archivos muertos', () => {
    const existentes = new Set([...archivos('src')].map((ruta) => ruta.replaceAll('\\', '/')))
    expect(Object.keys(PERMITIDOS).filter((ruta) => !existentes.has(ruta))).toEqual([])
  })
})
