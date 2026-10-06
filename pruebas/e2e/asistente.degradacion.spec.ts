import { expect, test } from '@playwright/test'

import {
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  type Escenario,
} from './sesion'

/** Sin proveedor (implementacion nula) el asistente avisa y el panel sigue (RNF-14, SC-007). */

let escenario: Escenario

test.beforeAll(async () => {
  escenario = await sembrarEscenario('consorcista', 'Mitre 456')
})

test.afterAll(async () => {
  await limpiarServicios(escenario)
  await limpiarEscenario(escenario)
  await prisma.$disconnect()
})

test('sin asistencia, el asistente dice que no esta disponible y el panel sigue andando', async ({
  page,
}) => {
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}`)
  await page.getByRole('button', { name: 'Abrir asistente' }).click()
  const panel = page.getByRole('dialog', { name: 'Asistente' })
  await panel.getByLabel('Tu consulta').fill('hola')
  await panel.getByRole('button', { name: 'Enviar' }).click()
  await expect(panel.getByRole('status')).toContainText('no está configurado')

  await page.goto(`/consorcios/${escenario.consorcioId}/gastos`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
