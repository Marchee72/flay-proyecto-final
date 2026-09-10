import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { entrar, limpiarEscenario, prisma, sembrarEscenario, type Escenario } from './sesion'

/**
 * SC-011 y RNF-11: las **tres** pantallas del consorcista, cero infracciones de
 * nivel A y AA. Son las que ve un usuario final, asi que son las que no pueden
 * dejar a nadie afuera.
 */

let escenario: Escenario

test.beforeAll(async () => {
  escenario = await sembrarEscenario('consorcista')
})

test.afterAll(async () => {
  await limpiarEscenario(escenario)
  await prisma.$disconnect()
})

const PANTALLAS = [
  { nombre: 'listado de gastos', ruta: (e: Escenario) => `/gastos?consorcio=${e.consorcioId}` },
  {
    nombre: 'detalle del gasto',
    ruta: (e: Escenario) => `/gastos/${e.gastoId}?consorcio=${e.consorcioId}`,
  },
  { nombre: 'períodos', ruta: (e: Escenario) => `/periodos?consorcio=${e.consorcioId}` },
]

for (const pantalla of PANTALLAS) {
  test(`${pantalla.nombre} sin infracciones A/AA`, async ({ page }) => {
    await entrar(page, escenario.correo)
    await page.goto(pantalla.ruta(escenario))

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const resumen = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
    expect(resumen, resumen.join('\n')).toEqual([])
  })
}
