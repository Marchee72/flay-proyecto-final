import { expect, test } from '@playwright/test'

import {
  desbordaALoAncho,
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  sembrarUnidadPropia,
  sembrarUsuarioEn,
  type Escenario,
} from './sesion'

/**
 * `CU-07` y `CU-08` de punta a punta: el consorcista abre el reclamo desde el
 * telefono, el administrador lo asigna y lo lleva hasta cerrado, y el
 * consorcista ve el historial completo (SC-003).
 */

let consorcista: Escenario
let administrador: { usuarioId: string; personaId: string; correo: string }

test.beforeAll(async () => {
  consorcista = await sembrarEscenario('consorcista', 'Mitre 456')
  await sembrarUnidadPropia(consorcista)
  administrador = await sembrarUsuarioEn(consorcista, 'administrador')
})

test.afterAll(async () => {
  await limpiarServicios(consorcista, [administrador])
  await limpiarEscenario(consorcista)
  await prisma.$disconnect()
})

test('del reclamo del consorcista al cierre del administrador, con historial completo', async ({
  page,
}) => {
  await entrar(page, consorcista.correo)
  await page.goto(`/reclamos?consorcio=${consorcista.consorcioId}`)
  await expect(page.getByRole('heading', { name: 'Reclamos', level: 1 })).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)

  await page.getByRole('button', { name: 'Nuevo reclamo' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Qué pasa').fill('Filtración en la cocina')
  await dialogo.getByLabel('Detalle').fill('Desde el domingo gotea agua del techo de la cocina.')
  await dialogo.getByLabel('Unidad').selectOption({ label: '3B' })
  await dialogo.getByLabel('Urgencia').selectOption('alta')
  await dialogo.getByRole('button', { name: 'Registrar reclamo' }).click()

  await expect(page).toHaveURL(/\/reclamos\/[0-9a-f-]+/)
  await expect(
    page.getByRole('heading', { name: 'Filtración en la cocina', level: 1 }),
  ).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Reclamo registrado')
  await expect(page.getByText('Abierto', { exact: true })).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)
  const url = page.url()

  // El consorcista no tiene el boton de asignar.
  await expect(page.getByRole('button', { name: 'Asignar' })).toHaveCount(0)

  // El administrador lo asigna y lo lleva hasta cerrado.
  await page.context().clearCookies()
  await entrar(page, administrador.correo)
  await page.goto(url)
  await page.getByRole('button', { name: 'Asignar', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Responsable').selectOption({ label: 'Bruno Paz' })
  await page.getByRole('dialog').getByRole('button', { name: 'Asignar' }).click()
  await expect(page.getByText('Asignado', { exact: true })).toBeVisible()

  for (const [boton, estado] of [
    ['Marcar en curso', 'En curso'],
    ['Marcar resuelto', 'Resuelto'],
    ['Cerrar', 'Cerrado'],
  ] as const) {
    await page.getByRole('button', { name: boton, exact: true }).click()
    const modal = page.getByRole('dialog')
    if (boton === 'Marcar en curso') await modal.getByLabel('Comentario').fill('Fue el plomero')
    await modal.getByRole('button', { name: /^Pasar a/ }).click()
    await expect(page.locator('.etiqueta').first()).toHaveText(new RegExp(estado))
  }

  // El consorcista ve las cinco transiciones mas el alta, con el comentario.
  await page.context().clearCookies()
  await entrar(page, consorcista.correo)
  await page.goto(url)
  const historial = page.locator('.historial li')
  await expect(historial).toHaveCount(5)
  await expect(historial.first()).toContainText('Registrado')
  await expect(historial.nth(2)).toContainText('Fue el plomero')
  await expect(historial.last()).toContainText('Resuelto → Cerrado')
  // Y puede reabrir: es una de sus dos transiciones.
  await expect(page.getByRole('button', { name: 'Reabrir' })).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)
})
