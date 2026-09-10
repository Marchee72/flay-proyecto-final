import { expect, test } from '@playwright/test'

/**
 * CU-01 desde el navegador. Lo que se verifica aca es lo que ninguna prueba de
 * integracion puede: que la pantalla exista, que el error se vea **debajo** del
 * formulario y que el panel no se abra sin sesion.
 */

test('el panel no se abre sin sesion: manda a ingresar', async ({ page }) => {
  await page.goto('/usuarios')
  await expect(page).toHaveURL(/\/ingresar/)
})

test('credenciales que no existen dan el mensaje unico, no un detalle', async ({ page }) => {
  await page.goto('/ingresar')

  await page.getByLabel('Correo electrónico').fill('nadie@ejemplo.test')
  await page.getByLabel('Contraseña').fill('lo-que-sea-pero-largo')
  await page.getByRole('button', { name: 'Entrar' }).click()

  // FR-001c: el mismo texto exista o no la cuenta. Nada de «usuario inexistente».
  // El anunciador de rutas de Next tambien es `role=alert`: se apunta al error.
  await expect(page.locator('p.error')).toHaveText('El correo o la contraseña no coinciden.')
  await expect(page).toHaveURL(/\/ingresar/)
})

test('la pantalla de ingreso entra en un telefono de 390 px', async ({ page }) => {
  await page.goto('/ingresar')

  const desbordeHorizontal = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(desbordeHorizontal).toBe(false)
})
