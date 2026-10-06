import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import {
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  type Escenario,
} from './sesion'

/** RNF-11: el panel del asistente abierto, sin infracciones A/AA. */

let escenario: Escenario

test.beforeAll(async () => {
  escenario = await sembrarEscenario('consorcista')
})

test.afterAll(async () => {
  await limpiarServicios(escenario)
  await limpiarEscenario(escenario)
  await prisma.$disconnect()
})

test('el asistente abierto, con una conversacion, sin infracciones A/AA', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}`)
  await page.getByRole('button', { name: 'Abrir asistente' }).click()
  const panel = page.getByRole('dialog', { name: 'Asistente' })
  await panel.getByLabel('Tu consulta').fill('ver_espacios')
  await panel.getByRole('button', { name: 'Enviar' }).click()
  await expect(panel.getByRole('link', { name: /Espacios/ })).toBeVisible()

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const resumen = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
  expect(resumen, resumen.join('\n')).toEqual([])
})

test('con las sugerencias a la vista y el hilo sin region viva, sin infracciones A/AA', async ({
  page,
}) => {
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}`)
  await page.getByRole('button', { name: 'Abrir asistente' }).click()
  const panel = page.getByRole('dialog', { name: 'Asistente' })
  await panel.getByLabel('Tu consulta').fill('se rompió algo en la terraza')
  await panel.getByRole('button', { name: 'Enviar' }).click()
  await expect(panel.getByRole('button', { name: 'Levantar un reclamo' })).toBeVisible()

  // Un texto que crece token a token no puede vivir dentro de una region viva.
  const hilo = panel.locator('.asistente__hilo')
  await expect(hilo).not.toHaveAttribute('aria-live', /.+/)
  await expect(hilo).toHaveAttribute('aria-busy', 'false')

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const resumen = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
  expect(resumen, resumen.join('\n')).toEqual([])
})
