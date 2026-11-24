import { expect, test } from '@playwright/test'

import {
  desbordaALoAncho,
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  sembrarUnidadPropia,
  type Escenario,
} from './sesion'

/** RF-03: con unidades en dos edificios se elige al entrar, y cada tarjeta dice cuáles. */

let a: Escenario
let b: Escenario

test.beforeAll(async () => {
  a = await sembrarEscenario('consorcista', 'Mitre 456')
  b = await sembrarEscenario('consorcista', 'Sarmiento 789')
  await sembrarUnidadPropia(a)
  await prisma.habilitacion.create({
    data: {
      usuarioId: a.usuarioId,
      consorcioId: b.consorcioId,
      rol: 'consorcista',
      vigenciaDesde: new Date('2026-01-01'),
    },
  })
  await sembrarUnidadPropia({ ...b, personaId: a.personaId })
})

test.afterAll(async () => {
  await limpiarServicios(a)
  await limpiarServicios(b)
  // Primero B: se lleva la habilitacion de A en B antes de borrar al usuario de A.
  await limpiarEscenario(b)
  await limpiarEscenario(a)
})

test('con unidades en dos edificios elige al entrar, aunque recuerde uno', async ({ page }) => {
  await entrar(page, a.correo)
  const recordado = page.waitForResponse((r) => r.url().endsWith('/api/consorcio-activo'))
  await page.goto(`/consorcios/${a.consorcioId}`)
  await recordado
  await page.goto('/')
  await expect(page).toHaveURL(/\/consorcios$/)
  await expect(page.getByText('Los edificios a los que tenés acceso. Elegí uno.')).toBeVisible()
  // La lista y el pie van en spans aparte: el texto del nodo no lleva espacio entre ellos.
  for (const edificio of ['Mitre 456', 'Sarmiento 789']) {
    const tarjeta = page.getByRole('article', { name: edificio })
    await expect(tarjeta).toContainText('3B')
    await expect(tarjeta).toContainText('es tu unidad')
  }
})

test('en teléfono la lista no desborda', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await entrar(page, a.correo)
  await page.goto('/consorcios')
  await expect(page.getByRole('article', { name: 'Mitre 456' })).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)
})
