import { expect, test } from '@playwright/test'

import {
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  sembrarUnidadPropia,
  type Escenario,
} from './sesion'

/**
 * RNF-10, A1: cuando el servidor rechaza un formulario, lo tipeado se queda.
 * Antes React 19 vaciaba los campos al terminar la accion y la persona tenia
 * que cargarlo todo de nuevo.
 */

let administrador: Escenario
let consorcista: Escenario

test.beforeAll(async () => {
  administrador = await sembrarEscenario('administrador', 'Mitre 456')
  consorcista = await sembrarEscenario('consorcista', 'Belgrano 12')
  await sembrarUnidadPropia(consorcista)
  await prisma.espacioComun.create({
    data: { consorcioId: consorcista.consorcioId, nombre: 'SUM', capacidadMaxima: 40 },
  })
})

test.afterAll(async () => {
  await limpiarServicios(consorcista)
  await limpiarEscenario(consorcista)
  await limpiarEscenario(administrador)
  await prisma.$disconnect()
})

test('un gasto rechazado conserva importe, fecha y descripción', async ({ page }) => {
  await entrar(page, administrador.correo)
  await page.goto(`/consorcios/${administrador.consorcioId}/gastos`)
  await page.getByRole('button', { name: 'Nuevo gasto' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Importe').fill('0')
  await dialogo.getByLabel('Fecha').fill('2026-11-10')
  await dialogo.getByLabel('Descripción').fill('Prueba')
  await dialogo.getByRole('button', { name: 'Registrar', exact: true }).click()

  await expect(dialogo.getByRole('alert')).toBeVisible()
  await expect(dialogo.getByLabel('Importe')).toHaveValue('0')
  await expect(dialogo.getByLabel('Fecha')).toHaveValue('2026-11-10')
  await expect(dialogo.getByLabel('Descripción')).toHaveValue('Prueba')
})

test('un reclamo rechazado conserva el título', async ({ page }) => {
  await entrar(page, consorcista.correo)
  await page.goto(`/consorcios/${consorcista.consorcioId}/reclamos`)
  await page.getByRole('button', { name: 'Nuevo reclamo' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Qué pasa').fill('Filtración en la cocina')
  await dialogo.getByLabel('Detalle').fill('x')
  await dialogo.getByRole('button', { name: 'Registrar', exact: true }).click()

  await expect(dialogo.getByRole('alert')).toBeVisible()
  await expect(dialogo.getByLabel('Qué pasa')).toHaveValue('Filtración en la cocina')
  await expect(dialogo.getByLabel('Detalle')).toHaveValue('x')
})

test('una reserva rechazada conserva desde y hasta', async ({ page }) => {
  await entrar(page, consorcista.correo)
  await page.goto(`/consorcios/${consorcista.consorcioId}/reservas`)
  await page.getByRole('button', { name: 'Reservar' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Desde').fill('2027-03-10T20:00')
  await dialogo.getByLabel('Hasta').fill('2027-03-10T18:00')
  await dialogo.getByLabel('Cantidad de personas').fill('12')
  await dialogo.getByRole('button', { name: 'Confirmar', exact: true }).click()

  await expect(dialogo.getByRole('alert')).toBeVisible()
  await expect(dialogo.getByLabel('Desde')).toHaveValue('2027-03-10T20:00')
  await expect(dialogo.getByLabel('Hasta')).toHaveValue('2027-03-10T18:00')
  await expect(dialogo.getByLabel('Cantidad de personas')).toHaveValue('12')
})
