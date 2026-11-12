import { expect, test } from '@playwright/test'

import { CONTRASENA, limpiarEscenario, prisma, sembrarEscenario, type Escenario } from './sesion'

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

test.describe('ingresar vuelve adonde se iba (FR-002)', () => {
  let escenario: Escenario

  test.beforeAll(async () => {
    escenario = await sembrarEscenario('administrador', 'Mitre 456')
  })

  test.afterAll(async () => {
    await limpiarEscenario(escenario)
    await prisma.$disconnect()
  })

  test('sin sesion, la pantalla pedida queda en ?desde= y se vuelve a ella', async ({ page }) => {
    const gastos = `/consorcios/${escenario.consorcioId}/gastos`
    await page.goto(gastos)
    await expect(page).toHaveURL(/\/ingresar\?desde=%2Fconsorcios%2F/)

    await page.getByLabel('Correo electrónico').fill(escenario.correo)
    await page.getByLabel('Contraseña').fill(CONTRASENA)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(gastos)
  })
})

test.describe('recuperar la contraseña (RF-03)', () => {
  let escenario: Escenario

  test.beforeAll(async () => {
    escenario = await sembrarEscenario('administrador', 'Mitre 456')
  })

  test.afterAll(async () => {
    await limpiarEscenario(escenario)
    await prisma.$disconnect()
  })

  test('desde el ingreso se llega a pedir el enlace y la respuesta no revela si el correo existe', async ({
    page,
  }) => {
    const pedir = async (correo: string) => {
      await page.goto('/ingresar')
      await expect(
        page.getByText('Después de cinco intentos fallidos el ingreso se pausa quince minutos.'),
      ).toBeVisible()
      await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click()
      await expect(page).toHaveURL(/\/recuperar/)
      await page.getByLabel('Correo electrónico').fill(correo)
      await page.getByRole('button', { name: 'Mandarme el enlace' }).click()
      const respuesta = page.getByRole('status').filter({ hasText: 'Si ese correo tiene cuenta' })
      await expect(respuesta).toBeVisible()
      return respuesta.textContent()
    }

    const conCuenta = await pedir(escenario.correo)
    const sinCuenta = await pedir('nadie@ejemplo.test')

    expect(conCuenta).toBe(sinCuenta)
    expect(conCuenta).toContain('Revisá también el correo no deseado.')
  })
})
