import { expect, test } from '@playwright/test'

import {
  desbordaALoAncho,
  entrar,
  limpiarEscenario,
  limpiarExpensa,
  prisma,
  sembrarEscenario,
  sembrarExpensa,
  type Escenario,
} from './sesion'

/**
 * SC-015, regla RN-13: el consorcista ve el dato agregado y **cero** nombres de
 * unidades; el administrador ve la nomina. El escenario deja una liquidacion
 * vencida sobre dos unidades, asi que las dos estan en mora.
 */

let consorcista: Escenario
let administrador: Escenario

test.beforeAll(async () => {
  consorcista = await sembrarEscenario('consorcista', 'Mitre 456')
  await sembrarExpensa(consorcista)

  administrador = await sembrarEscenario('administrador', 'San Martin 7890')
  await sembrarExpensa(administrador)
})

test.afterAll(async () => {
  for (const escenario of [consorcista, administrador]) {
    await limpiarExpensa(escenario)
    await limpiarEscenario(escenario)
  }
  await prisma.$disconnect()
})

test('el consorcista ve el agregado y ningun nombre de unidad', async ({ page }) => {
  await entrar(page, consorcista.correo)
  await page.goto(`/morosidad?consorcio=${consorcista.consorcioId}`)

  // El numero va en su propio <strong>: se mira el parrafo entero.
  await expect(page.locator('.tarjeta p').first()).toHaveText(/2\s+de 2 unidades con deuda vencida/)
  await expect(page.getByRole('table')).toHaveCount(0)
  // Ni la propia ni la vecina: el agregado no nombra a nadie.
  await expect(page.getByText('3B', { exact: true })).toHaveCount(0)
  await expect(page.getByText('3C', { exact: true })).toHaveCount(0)
  expect(await desbordaALoAncho(page)).toBe(false)
})

test('el administrador ve la nomina', async ({ page }) => {
  await entrar(page, administrador.correo)
  await page.goto(`/morosidad?consorcio=${administrador.consorcioId}`)

  const tabla = page.getByRole('table')
  await expect(tabla).toBeVisible()
  await expect(tabla.getByRole('cell', { name: '3B', exact: true })).toBeVisible()
  await expect(tabla.getByRole('cell', { name: '3C', exact: true })).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)
})
