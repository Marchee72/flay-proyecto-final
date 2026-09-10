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
  type Expensa,
} from './sesion'

/**
 * `CU-06`: el consorcista descarga su expensa, y solo la suya (SC-008, SC-016).
 *
 * Corre en escritorio y en telefono de 390 px por la configuracion de proyectos.
 */

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

test('el consorcista ve la expensa de su unidad con su total', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/expensas?consorcio=${escenario.consorcioId}`)

  await expect(page.getByRole('heading', { name: 'Unidad 3B' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unidad 3C' })).toHaveCount(0)
  // El importe llega como cadena y se formatea en es-AR: nunca se recalcula.
  await expect(page.getByText('$ 92.160,38')).toBeVisible()
})

test('el listado no desborda a lo ancho (RNF-01)', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/expensas?consorcio=${escenario.consorcioId}`)

  expect(await desbordaALoAncho(page)).toBe(false)
})

test('la expensa propia se abre por identificador directo', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/expensas/${expensa.detallePropioId}?consorcio=${escenario.consorcioId}`)

  await expect(page.getByRole('heading', { name: /unidad 3B/ })).toBeVisible()
  // El documento todavia no se genero en este escenario: la pantalla lo dice,
  // y la liquidacion existe igual (FR-019).
  await expect(page.getByRole('status')).toContainText('se está generando')
  expect(await desbordaALoAncho(page)).toBe(false)
})

/** El paso 5 del guion de demostracion: la del vecino no existe para mi. */
test('la expensa de otra unidad responde «no encontrado», nunca «prohibido»', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/expensas/${expensa.detalleAjenoId}?consorcio=${escenario.consorcioId}`)

  // El anunciador de rutas de Next tambien es `role=alert`: se apunta al aviso.
  await expect(page.locator('p.aviso--problema')).toContainText('No encontramos')
  await expect(page.getByText(/prohibido/i)).toHaveCount(0)
})
