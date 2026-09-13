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
 * `CU-11`: el administrador ve el panel consolidado con la morosidad de su
 * consorcio y las alertas; el consorcista no entra (SC-011).
 */

let administrador: Escenario
let consorcista: Escenario

test.beforeAll(async () => {
  administrador = await sembrarEscenario('administrador', 'San Martin 7890')
  await sembrarExpensa(administrador)
  consorcista = await sembrarEscenario('consorcista', 'Mitre 456')
  await prisma.$executeRaw`SELECT fn_refrescar_indicadores()`
})

test.afterAll(async () => {
  await limpiarExpensa(administrador)
  await limpiarEscenario(administrador)
  await limpiarEscenario(consorcista)
  await prisma.$disconnect()
})

test('el administrador ve el panel, la morosidad de su consorcio y la alerta', async ({ page }) => {
  await entrar(page, administrador.correo)
  await page.goto(`/indicadores?consorcio=${administrador.consorcioId}`)

  await expect(page.getByRole('heading', { name: 'Indicadores', level: 1 })).toBeVisible()
  // La expensa sembrada esta vencida y sin pagar: 100 % de morosidad.
  await expect(page.locator('.kpi__cifra')).toHaveText(/100\.00 %/)
  const fila = page.getByRole('row', { name: /San Martin 7890/ })
  await expect(fila).toContainText('100.00 %')
  expect(await desbordaALoAncho(page)).toBe(false)

  await page.getByRole('link', { name: 'I-1 Morosidad' }).click()
  await expect(page.getByRole('heading', { name: /I-1 · Morosidad/ })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Alertas' })).toContainText('por encima del 15 %')
  // La tabla debajo del grafico trae el dato como cadena.
  await expect(page.getByRole('table')).toContainText('100.00 %')
  expect(await desbordaALoAncho(page)).toBe(false)

  await page.goto(`/indicadores?consorcio=${administrador.consorcioId}`)
  await page.getByRole('button', { name: 'Actualizar ahora' }).click()
  await expect(page.getByRole('status')).toContainText('Indicadores actualizados')
})

test('el consorcista no accede al panel', async ({ page }) => {
  await entrar(page, consorcista.correo)
  await page.goto(`/indicadores?consorcio=${consorcista.consorcioId}`)
  await expect(page.getByRole('alert').first()).toContainText('Tu rol no permite')
  await expect(page.locator('.kpi')).toHaveCount(0)
})
