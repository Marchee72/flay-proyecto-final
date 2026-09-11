import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

/**
 * SC-003: la constitucion es exigible por construccion. Cada fixture viola un
 * principio y la verificacion la rechaza con su propio mensaje. Si alguna
 * pasara, la puerta estaria abierta.
 */

const RAIZ = 'pruebas/fixtures-negativas/src'
const shell = process.platform === 'win32'

const correr = (comando: string, args: string[]) =>
  spawnSync(comando, args, { encoding: 'utf8', shell })

const lint = (archivo: string) => {
  const { status, stdout } = correr('npx', ['eslint', '--no-ignore', `${RAIZ}/${archivo}`])
  return { status, salida: stdout }
}

describe('fixtures negativas', () => {
  it('1. capa cruzada: presentacion no importa dominio', () => {
    const { status, salida } = lint('app/capa-cruzada.ts')
    expect(status).not.toBe(0)
    expect(salida).toContain('Presentacion solo importa src/aplicacion y src/compartido')
  })

  it('2. dinero como numero: lo rechaza el verificador de tipos', () => {
    const { status, stdout } = correr('npx', [
      'tsc',
      '--noEmit',
      '-p',
      'pruebas/fixtures-negativas/tsconfig.json',
    ])
    expect(status).not.toBe(0)
    expect(stdout).toContain("Argument of type 'number' is not assignable to parameter of type")
    expect(stdout).toContain('dinero-como-numero.ts')
  })

  it('3. aritmetica sobre Decimal: la rechaza la regla propia', () => {
    const { status, salida } = lint('dominio/aritmetica-decimal.ts')
    expect(status).not.toBe(0)
    expect(salida).toContain('flay/sin-aritmetica-monetaria')
    expect(salida).toContain('Aritmetica de punto flotante sobre un Decimal')
  })

  it('4. proveedor directo: el dominio no importa el cliente de la base', () => {
    const { status, salida } = lint('dominio/proveedor-directo.ts')
    expect(status).not.toBe(0)
    expect(salida).toContain('El dominio no conoce la base de datos')
  })

  /**
   * La puerta que mas importa: si el punto flotante entra al motor de
   * liquidacion, ninguna otra medida alcanza (`003-liquidacion` FR-007).
   */
  it('5. total de gastos como numero: el motor de prorrateo no lo acepta', () => {
    const { status, stdout } = correr('npx', [
      'tsc',
      '--noEmit',
      '-p',
      'pruebas/fixtures-negativas/tsconfig.json',
    ])
    expect(status).not.toBe(0)
    expect(stdout).toContain("Type 'number' is not assignable to type 'string'")
    expect(stdout).toContain('prorrateo-con-numero.ts')
  })
})
