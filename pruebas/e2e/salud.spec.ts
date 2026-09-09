import { expect, test } from '@playwright/test'

// SC-011: responde en escritorio y en telefono (390x844), sin scroll horizontal.
test('/api/salud responde 200 con estado, version y migracion', async ({ request }) => {
  const respuesta = await request.get('/api/salud')
  expect(respuesta.status()).toBe(200)

  const cuerpo = await respuesta.json()
  expect(cuerpo).toMatchObject({ estado: 'ok' })
  expect(cuerpo.version).toBeTruthy()
  expect(cuerpo.migracion).toBeTruthy()
})

test('la pagina no desborda a lo ancho', async ({ page }) => {
  await page.goto('/')
  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(desborda).toBe(false)
})
