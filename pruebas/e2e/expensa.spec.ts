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
  await page.goto(`/consorcios/${escenario.consorcioId}/expensas`)

  // Una tabla con columna Unidad: la suya aparece, la del vecino no (RN-12).
  await expect(page.getByRole('cell', { name: '3B', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '3C', exact: true })).toHaveCount(0)
  // El importe llega como cadena y se formatea en es-AR: nunca se recalcula.
  await expect(page.getByText('$ 92.160,38')).toBeVisible()
})

test('el listado no desborda a lo ancho (RNF-01)', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}/expensas`)

  expect(await desbordaALoAncho(page)).toBe(false)
})

test('la expensa propia se abre por identificador directo', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}/expensas/${expensa.detallePropioId}`)

  await expect(page.getByRole('heading', { name: /unidad 3B/ })).toBeVisible()
  // El documento todavia no se genero en este escenario: la pantalla lo dice,
  // y la liquidacion existe igual (FR-019).
  // Vencida en firme (la sembrada vence en agosto), la pantalla trae otro aviso de
  // estado: se apunta al del documento.
  await expect(page.getByRole('status').filter({ hasText: 'se está generando' })).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)
})

/** El paso 5 del guion de demostracion: la del vecino no existe para mi. */
test('la expensa de otra unidad responde «no encontrado», nunca «prohibido»', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}/expensas/${expensa.detalleAjenoId}`)

  // El anunciador de rutas de Next tambien es `role=alert`: se apunta al aviso.
  await expect(page.locator('p.aviso--problema')).toContainText('No encontramos')
  await expect(page.getByText(/prohibido/i)).toHaveCount(0)
})

test.describe('el administrador registra un pago desde la expensa (CU-04)', () => {
  let administrador: Escenario
  let suya: Expensa

  test.beforeAll(async () => {
    administrador = await sembrarEscenario('administrador')
    suya = await sembrarExpensa(administrador)
  })

  test.afterAll(async () => {
    await prisma.pagoImputacion.deleteMany({
      where: { pago: { consorcioId: administrador.consorcioId } },
    })
    await prisma.pago.deleteMany({ where: { consorcioId: administrador.consorcioId } })
    await limpiarExpensa(administrador)
    await limpiarEscenario(administrador)
  })

  test('el pago viene con la unidad elegida y vuelve a la expensa', async ({ page }) => {
    // La de 3C: no es la primera del listado, asi que no se elige sola.
    const unidad = await prisma.unidad.findFirstOrThrow({
      where: { consorcioId: administrador.consorcioId, designacion: '3C' },
    })
    // Pasado el vencimiento en firme no se acepta ningun pago (RF-08): para este
    // recorrido la expensa todavia esta en termino.
    await prisma.liquidacion.updateMany({
      where: { consorcioId: administrador.consorcioId },
      data: { vencimiento: new Date(Date.now() + 30 * 86_400_000) },
    })
    await entrar(page, administrador.correo)
    await page.goto(`/consorcios/${administrador.consorcioId}/expensas/${suya.detalleAjenoId}`)

    await page.getByRole('button', { name: 'Registrar un pago' }).click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo.getByLabel('Unidad')).toHaveValue(unidad.id)
    await dialogo.getByLabel('Importe').fill('1000')
    await dialogo.getByRole('button', { name: 'Registrar', exact: true }).click()

    await expect(page).toHaveURL(
      new RegExp(`/expensas/${suya.detalleAjenoId}\\?hecho=pago-registrado`),
    )
  })
})
