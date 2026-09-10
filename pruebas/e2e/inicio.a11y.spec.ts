import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// RNF-11 (I-09): 0 infracciones A/AA. Cada pantalla se suma a esta lista al
// nacer. Las publicas primero: son las unicas que se pueden mirar sin sesion.
const PANTALLAS = ['/', '/ingresar', '/invitacion/no-importa-si-es-valida']

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
