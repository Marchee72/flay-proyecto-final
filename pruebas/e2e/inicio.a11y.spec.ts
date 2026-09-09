import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// RNF-11 (I-09): 0 infracciones A/AA. Arranca con la unica pantalla que existe;
// cada pantalla del consorcista se suma a esta lista al nacer.
const PANTALLAS = ['/']

for (const ruta of PANTALLAS) {
  test(`${ruta} sin infracciones A/AA`, async ({ page }) => {
    await page.goto(ruta)

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const resumen = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
    expect(resumen, resumen.join('\n')).toEqual([])
  })
}
