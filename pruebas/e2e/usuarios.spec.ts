import { expect, test } from '@playwright/test'

import {
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  sembrarUsuarioEn,
  type Escenario,
} from './sesion'

/** RF-03 (C2): el administrador asigna una unidad desde Usuarios y el invitado la ve en Expensas. */

let administrador: Escenario
let consorcista: { usuarioId: string; personaId: string; correo: string }

test.beforeAll(async () => {
  administrador = await sembrarEscenario('administrador', 'Mitre 456')
  consorcista = await sembrarUsuarioEn(administrador, 'consorcista')
  // Padrón de una sola unidad (suma 100), sin ocupante.
  await prisma.unidad.create({
    data: {
      consorcioId: administrador.consorcioId,
      designacion: '1A',
      coeficiente: '100.00000000',
    },
  })
})

test.afterAll(async () => {
  await limpiarServicios(administrador, [consorcista])
  await limpiarEscenario(administrador)
  await prisma.$disconnect()
})

test('el administrador asigna una unidad a un invitado y el invitado la ve en Expensas', async ({
  page,
  browser,
  baseURL,
}) => {
  await entrar(page, administrador.correo)
  await page.goto(`/consorcios/${administrador.consorcioId}/usuarios`)

  const fila = page.getByRole('row').filter({ hasText: consorcista.correo })
  await fila.getByRole('button', { name: 'Asignar unidad' }).click()
  const dialogo = page.getByRole('dialog', { name: /Asignar unidad a/ })
  await dialogo.getByLabel('Unidad').selectOption({ label: '1A' })
  await dialogo.getByRole('button', { name: 'Asignar', exact: true }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Unidad asignada.' })).toBeVisible()
  await expect(fila).toContainText('1A · propietario')

  const contexto = await browser.newContext({ baseURL })
  const paginaDelInvitado = await contexto.newPage()
  await entrar(paginaDelInvitado, consorcista.correo)
  await paginaDelInvitado.goto(`/consorcios/${administrador.consorcioId}/expensas`)
  await expect(
    paginaDelInvitado.getByRole('heading', { name: /expensas/i, level: 1 }),
  ).toBeVisible()
  await expect(paginaDelInvitado.getByText('No hay unidades a tu nombre')).toHaveCount(0)
  await contexto.close()
})
