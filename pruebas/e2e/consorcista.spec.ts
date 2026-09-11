import { expect, test } from '@playwright/test'

import {
  desbordaALoAncho,
  entrar,
  limpiarEscenario,
  prisma,
  sembrarEscenario,
  type Escenario,
} from './sesion'

/**
 * `CU-05` desde el navegador, en escritorio y en telefono de 390 px (SC-011,
 * RNF-01). Es la pantalla que hace demostrable la iteracion, y la unica que ve
 * un consorcista.
 *
 * Corre con rol **consorcista** a proposito: probarla como administrador
 * dejaria sin verificar lo unico que aca importa de la autorizacion, que es que
 * el usuario final ve sus datos y ninguna accion que no le corresponde.
 */

let escenario: Escenario

test.beforeAll(async () => {
  escenario = await sembrarEscenario('consorcista')
})

test.afterAll(async () => {
  await limpiarEscenario(escenario)
  await prisma.$disconnect()
})

test('el listado muestra el gasto con su importe y el total', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/gastos?consorcio=${escenario.consorcioId}`)

  await expect(page.getByRole('heading', { name: 'Gastos', level: 1 })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Mantenimiento de ascensores' })).toBeVisible()
  // Importe exacto, como cadena: el total de una sola fila es esa fila.
  await expect(page.locator('tfoot .cifra')).toHaveText('$ 184.320,75')
})

test('el listado no desborda a lo ancho: la tabla se desplaza sola (RNF-01)', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/gastos?consorcio=${escenario.consorcioId}`)

  await expect(page.locator('.tabla-desplazable')).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)
})

test('el detalle del gasto tampoco desborda', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/gastos/${escenario.gastoId}?consorcio=${escenario.consorcioId}`)

  await expect(page.getByText('$ 184.320,75')).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)
})

test('un consorcista no ve el formulario de alta de proveedor (RNF-03)', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/proveedores?consorcio=${escenario.consorcioId}`)

  await expect(page.getByText('Ascensores del Litoral')).toBeVisible()
  // Lo que el rol no puede hacer, la pantalla no lo ofrece.
  await expect(page.getByRole('button', { name: 'Agregar proveedor' })).toHaveCount(0)
})

test('el gasto de otro consorcio no aparece: «no encontrado», nunca «prohibido»', async ({
  page,
}) => {
  const ajeno = await sembrarEscenario('administrador', 'Ajeno 100')

  try {
    await entrar(page, escenario.correo)
    // Por identificador directo en la direccion, que es como lo probaria alguien.
    await page.goto(`/gastos/${ajeno.gastoId}?consorcio=${escenario.consorcioId}`)

    // El anunciador de rutas de Next tambien es `role=alert`: se apunta al aviso.
    await expect(page.locator('.aviso--problema')).toContainText('No encontramos lo que buscabas.')
    await expect(page.getByText('Ajeno 100')).toHaveCount(0)
  } finally {
    await limpiarEscenario(ajeno)
  }
})
