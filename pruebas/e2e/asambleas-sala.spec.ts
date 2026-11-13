import { expect, test } from '@playwright/test'

import { sembrarAsambleaE2E } from './asambleas-escenario'
import { entrar, prisma } from './sesion'

/**
 * La sala vista desde afuera (016): lo que pasa en la reunión le llega a quien
 * mira sin recargar. Sin `ABLY_API_KEY` el aviso es nulo y la sala sondea cada
 * 3 s, así que los plazos de acá valen con y sin el servicio.
 */

let escenario: Awaited<ReturnType<typeof sembrarAsambleaE2E>>

test.beforeAll(async () => {
  escenario = await sembrarAsambleaE2E()
})

test.afterAll(async () => {
  await escenario.limpiar()
  await prisma.$disconnect()
})

test('sin quórum, quien dirige cancela desde la sala y quien esperaba lo ve sin recargar', async ({
  browser,
  page,
}, info) => {
  test.skip(info.project.name !== 'telefono', 'el recorrido es del teléfono; una sola vez')
  const { bruno, dino, ruta } = escenario

  // Dino tiene la convocada abierta; Bruno abre la asamblea.
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const deDino = await contexto.newPage()
  await entrar(deDino, dino.correo)
  await deDino.goto(ruta())
  await expect(deDino.getByText('En curso', { exact: true })).toHaveCount(0)

  await entrar(page, bruno.correo)
  await page.goto(ruta())
  await page.getByRole('button', { name: 'Abrir la asamblea' }).click()
  await expect(page).toHaveURL(/hecho=asamblea-abierta/)
  await expect(deDino.getByText('En curso', { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  })

  // Sin nadie acreditado no hay quórum: se cancela desde la sala.
  await page.getByRole('button', { name: 'Cancelar por falta de quórum' }).click()
  await page.getByRole('button', { name: 'Confirmar cancelación' }).click()
  await expect(page).toHaveURL(/hecho=asamblea-cancelada/)
  await expect(page.getByText('Cancelada', { exact: true }).first()).toBeVisible()
  await expect(deDino.locator('p.aviso', { hasText: 'Asamblea cancelada' })).toBeVisible({
    timeout: 10_000,
  })
  await contexto.close()
})
