import { expect, test } from '@playwright/test'

import {
  entrar,
  limpiarEscenario,
  limpiarExpensa,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  sembrarExpensa,
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
  // 3B y 3C con deuda distinta por un centavo y vencimiento por venir: el pago
  // no está bloqueado y la pista «Debe hoy» delata a qué unidad corresponde.
  const { liquidacionId } = await sembrarExpensa(administrador)
  await prisma.liquidacion.update({
    where: { id: liquidacionId },
    data: { vencimiento: new Date('2099-12-10') },
  })
  consorcista = await sembrarEscenario('consorcista', 'Belgrano 12')
  await sembrarUnidadPropia(consorcista)
  await prisma.espacioComun.create({
    data: { consorcioId: consorcista.consorcioId, nombre: 'SUM', capacidadMaxima: 40 },
  })
})

test.afterAll(async () => {
  await limpiarServicios(consorcista)
  await limpiarEscenario(consorcista)
  await limpiarExpensa(administrador)
  await limpiarEscenario(administrador)
  await prisma.$disconnect()
})

test('un gasto rechazado conserva rubro, clasificación, proveedor, importe, fecha y descripción', async ({
  page,
}) => {
  await entrar(page, administrador.correo)
  await page.goto(`/consorcios/${administrador.consorcioId}/gastos`)
  await page.getByRole('button', { name: 'Nuevo gasto' }).click()
  const dialogo = page.getByRole('dialog')
  // Los filtros de la página repiten id="rubro" e id="clasificacion": la
  // etiqueta del diálogo apunta al primero, así que se buscan por su nombre.
  const rubro = dialogo.locator('select[name="rubro"]')
  const clasificacion = dialogo.locator('select[name="clasificacion"]')
  await rubro.selectOption({ label: 'Mantenimiento de ascensores' })
  await clasificacion.selectOption('extraordinario')
  await dialogo.getByLabel('Proveedor').selectOption({ label: 'Ascensores del Litoral' })
  await dialogo.getByLabel('Importe').fill('0')
  await dialogo.getByLabel('Fecha').fill('2026-11-10')
  await dialogo.getByLabel('Descripción').fill('Prueba')
  await dialogo.getByRole('button', { name: 'Registrar', exact: true }).click()

  await expect(dialogo.getByRole('alert')).toBeVisible()
  await expect(rubro.locator('option:checked')).toHaveText('Mantenimiento de ascensores')
  await expect(clasificacion).toHaveValue('extraordinario')
  await expect(dialogo.getByLabel('Proveedor').locator('option:checked')).toHaveText(
    'Ascensores del Litoral',
  )
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

test('un pago rechazado conserva la unidad y el medio elegidos, con la pista de esa unidad', async ({
  page,
}) => {
  const otra = await prisma.unidad.findFirstOrThrow({
    where: { consorcioId: administrador.consorcioId, designacion: '3C' },
  })
  await entrar(page, administrador.correo)
  await page.goto(`/consorcios/${administrador.consorcioId}/pagos`)
  await page.getByRole('button', { name: 'Registrar un pago' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Unidad').selectOption({ label: '3C' })
  await dialogo.getByLabel('Medio').selectOption('efectivo')
  await dialogo.getByLabel('Importe').fill('0')
  await expect(dialogo.getByText('Debe hoy: $ 92.160,37')).toBeVisible()
  await dialogo.getByRole('button', { name: 'Registrar', exact: true }).click()

  await expect(dialogo.getByRole('alert')).toBeVisible()
  // El reenvío imputaría el pago a la unidad que muestra el desplegable.
  await expect(dialogo.getByLabel('Unidad')).toHaveValue(otra.id)
  await expect(dialogo.getByLabel('Medio')).toHaveValue('efectivo')
  await expect(dialogo.getByLabel('Importe')).toHaveValue('0')
  await expect(dialogo.getByText('Debe hoy: $ 92.160,37')).toBeVisible()
})

test('una invitación rechazada conserva rol, unidad y tipo de ocupación', async ({ page }) => {
  const otra = await prisma.unidad.findFirstOrThrow({
    where: { consorcioId: administrador.consorcioId, designacion: '3C' },
  })
  await entrar(page, administrador.correo)
  await page.goto(`/consorcios/${administrador.consorcioId}/usuarios`)
  await page.getByRole('button', { name: 'Invitar persona' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Nombre').fill('Carla')
  await dialogo.getByLabel('Apellido').fill('Ruiz')
  // Sin arroba: el servidor la rechaza. Consorcista es el último rol de la
  // lista, así que un desplegable que vuelve a su primera opción se nota.
  await dialogo.getByLabel('Correo electrónico').fill('carla.ruiz.ejemplo.test')
  await dialogo.getByLabel('Rol').selectOption('consorcista')
  await dialogo.getByLabel('Unidad').selectOption({ label: '3C' })
  await dialogo.getByLabel('Es', { exact: true }).selectOption('inquilino')
  await dialogo.getByRole('button', { name: 'Invitar', exact: true }).click()

  await expect(dialogo.getByRole('alert')).toBeVisible()
  await expect(dialogo.getByLabel('Rol')).toHaveValue('consorcista')
  await expect(dialogo.getByLabel('Unidad')).toHaveValue(otra.id)
  await expect(dialogo.getByLabel('Es', { exact: true })).toHaveValue('inquilino')
  await expect(dialogo.getByLabel('Correo electrónico')).toHaveValue('carla.ruiz.ejemplo.test')
})
