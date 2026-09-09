import { pathToFileURL } from 'node:url'

import { expect, test } from '@playwright/test'

// La guia de estilos prescribe la interfaz: si ella misma desborda, la regla no
// vale nada. Corre en los dos proyectos de dispositivo, asi el de telefono
// verifica los 390 px de RNF-01.
const GUIA = pathToFileURL('docs/guia-estilos-ejemplo.html').href

test('la guia de estilos no desborda a lo ancho', async ({ page }) => {
  await page.goto(GUIA)

  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(desborda).toBe(false)
})

test('la navegacion sigue disponible en telefono', async ({ page }, testInfo) => {
  await page.goto(GUIA)

  const lateral = page.locator('.disposicion > .lateral')
  const menu = page.locator('.menu')

  if (testInfo.project.name === 'telefono') {
    await expect(lateral).toBeHidden()
    await expect(menu).toBeVisible()

    // El lateral no se esconde y ya: la hamburguesa lo devuelve.
    await expect(menu.getByRole('link', { name: 'Gastos' })).toBeHidden()
    await menu.locator('summary').click()
    await expect(menu.getByRole('link', { name: 'Gastos' })).toBeVisible()
  } else {
    await expect(lateral).toBeVisible()
    await expect(menu).toBeHidden()
  }
})

test('todo lo accionable es alcanzable por teclado', async ({ page }) => {
  await page.goto(GUIA)

  // Los avisos llevan enlaces de verdad, no texto subrayado.
  for (const nombre of ['Ver nómina', 'Ver estado de cuenta']) {
    await expect(page.getByRole('link', { name: nombre })).toBeVisible()
  }

  await page.keyboard.press('Tab')
  const conFoco = await page.evaluate(() => {
    const activo = document.activeElement
    if (!activo || activo === document.body) return null
    return { etiqueta: activo.tagName, contorno: getComputedStyle(activo).outlineStyle }
  })
  expect(conFoco).not.toBeNull()
})
