import { pathToFileURL } from 'node:url'

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// RNF-11 sobre la propia guia: prescribe la interfaz, tiene que cumplir la vara
// que le pone al resto.
test('la guia de estilos no tiene infracciones A/AA', async ({ page }) => {
  await page.goto(pathToFileURL('docs/guia-estilos-ejemplo.html').href)

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const resumen = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
  expect(resumen, resumen.join('\n')).toEqual([])
})
