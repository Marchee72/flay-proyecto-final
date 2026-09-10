import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import {
  entrar,
  limpiarEscenario,
  limpiarExpensa,
  prisma,
  sembrarEscenario,
  sembrarExpensa,
  type Escenario,
  type Expensa,
} from './sesion'

/** SC-016, RNF-11: la descarga de la expensa propia, sin infracciones A ni AA. */

let escenario: Escenario
let expensa: Expensa

test.beforeAll(async () => {
  escenario = await sembrarEscenario('consorcista')
  expensa = await sembrarExpensa(escenario)
})

test.afterAll(async () => {
  await limpiarExpensa(escenario)
  await limpiarEscenario(escenario)
  await prisma.$disconnect()
})

const PANTALLAS = [
  { nombre: 'listado de expensas', ruta: (e: Escenario) => `/expensas?consorcio=${e.consorcioId}` },
  {
    nombre: 'expensa de la unidad',
    ruta: (e: Escenario) => `/expensas/${expensa.detallePropioId}?consorcio=${e.consorcioId}`,
  },
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
