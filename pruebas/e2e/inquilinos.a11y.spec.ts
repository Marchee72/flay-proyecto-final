import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import {
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  sembrarUnidadPropia,
  sembrarUsuarioEn,
  type Escenario,
} from './sesion'

let duenio: Escenario
let admin: { usuarioId: string; personaId: string; correo: string }

test.beforeAll(async () => {
  duenio = await sembrarEscenario('consorcista', 'Mitre 456')
  await sembrarUnidadPropia(duenio)
  admin = await sembrarUsuarioEn(duenio, 'administrador')
})

test.afterAll(async () => {
  await limpiarServicios(duenio, [admin])
  await limpiarEscenario(duenio)
  await prisma.$disconnect()
})

async function esperarSinInfracciones(page: Parameters<typeof entrar>[0]) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const resumen = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
  expect(resumen, resumen.join('\n')).toEqual([])
}

test('Mis unidades sin infracciones A/AA', async ({ page }) => {
  await entrar(page, duenio.correo)
  await page.goto(`/consorcios/${duenio.consorcioId}/mis-unidades`)
  await expect(page.getByRole('heading', { name: 'Mis unidades', level: 1 })).toBeVisible()
  await esperarSinInfracciones(page)
})

test('diálogo Asignar inquilino sin infracciones A/AA', async ({ page }) => {
  await entrar(page, duenio.correo)
  await page.goto(`/consorcios/${duenio.consorcioId}/mis-unidades`)
  await page.getByRole('button', { name: 'Asignar inquilino' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Asignar inquilino en 3B' })).toBeVisible()
  await esperarSinInfracciones(page)
})

test('Unidades (con columna Inquilino) sin infracciones A/AA', async ({ page }) => {
  await entrar(page, admin.correo)
  await page.goto(`/consorcios/${duenio.consorcioId}/unidades`)
  await expect(page.getByRole('columnheader', { name: 'Inquilino' })).toBeVisible()
  await esperarSinInfracciones(page)
})
