import { expect, test } from '@playwright/test'

import {
  entrar,
  limpiarEscenario,
  limpiarExpensa,
  prisma,
  sembrarEscenario,
  sembrarExpensa,
  type Escenario,
  type Expensa,
} from './sesion'

/**
 * `FR-018`, `CU-06`: desde el detalle de la liquidacion, el administrador llega
 * al documento de cada unidad. La fila es enlace solo cuando el documento ya se
 * genero (`claveDocumento`); mientras no esta, es texto plano y la pantalla de
 * expensa dira que se esta generando.
 */

let escenario: Escenario
let expensa: Expensa

test.beforeAll(async () => {
  escenario = await sembrarEscenario('administrador')
  expensa = await sembrarExpensa(escenario)
  // Solo la propia (3B) tiene documento; la ajena (3C) no.
  await prisma.detalleLiquidacion.update({
    where: { id: expensa.detallePropioId },
    data: { claveDocumento: `expensas/${escenario.consorcioId}/${expensa.liquidacionId}/3b.pdf` },
  })
})

test.afterAll(async () => {
  await limpiarExpensa(escenario)
  await limpiarEscenario(escenario)
  await prisma.$disconnect()
})

test('el detalle enlaza a la expensa de la unidad con documento', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}/liquidaciones/${expensa.liquidacionId}`)

  // 3B tiene documento: su celda es un enlace a la expensa de esa unidad.
  const enlace = page.getByRole('cell', { name: '3B', exact: true }).getByRole('link')
  await expect(enlace).toHaveAttribute(
    'href',
    `/consorcios/${escenario.consorcioId}/expensas/${expensa.detallePropioId}`,
  )

  // 3C no tiene documento todavia: queda en texto plano, sin enlace.
  await expect(page.getByRole('cell', { name: '3C', exact: true }).getByRole('link')).toHaveCount(0)
})
