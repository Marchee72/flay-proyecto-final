import { expect, test } from '@playwright/test'

import {
  desbordaALoAncho,
  entrar,
  limpiarEscenario,
  limpiarExpensa,
  prisma,
  sembrarEscenario,
  type Escenario,
} from './sesion'

/**
 * `RF-07`, `CU-03`: el administrador revisa los gastos y el reparto de un
 * periodo **abierto** y lo liquida desde la misma pantalla. El escenario trae
 * un gasto de $ 184.320,75; aca se le suma un padron de dos mitades.
 */

let escenario: Escenario

test.beforeAll(async () => {
  escenario = await sembrarEscenario('administrador', 'Mitre 456')
  // Las dos unidades entran juntas: el padron tiene que sumar 100 al confirmar.
  await prisma.unidad.createMany({
    data: ['3B', '3C'].map((designacion) => ({
      consorcioId: escenario.consorcioId,
      designacion,
      coeficiente: '50.00000000',
    })),
  })
})

test.afterAll(async () => {
  await limpiarExpensa(escenario)
  await limpiarEscenario(escenario)
  await prisma.$disconnect()
})

test('revisa los gastos y el reparto, y liquida el periodo abierto', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}/periodos`)

  await page.getByRole('link', { name: 'Revisar y liquidar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Liquidar 09/2026')
  await expect(page.getByText('El período está abierto')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Mantenimiento mensual del ascensor' })).toBeVisible()

  // El reparto por unidad no esta en la pagina: es detalle y vive en el dialogo.
  await expect(page.getByRole('cell', { name: '3B', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: /Ver el reparto entre 2 unidades/ }).click()

  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByRole('cell', { name: '3B', exact: true })).toBeVisible()
  await expect(dialogo.getByRole('cell', { name: '3C', exact: true })).toBeVisible()
  // La mitad de 184.320,75 son 92.160,375: el ajuste por redondeo va aparte.
  await expect(dialogo).toContainText('$ 92.160,38')
  expect(await desbordaALoAncho(page)).toBe(false)

  await page.keyboard.press('Escape')
  await expect(dialogo).toBeHidden()

  // Un solo clic: la pantalla ya es la revision, no hay segundo paso.
  await page.getByRole('button', { name: 'Confirmar y liquidar' }).click()

  // El resultado sale por la pila de avisos, no dentro de la pantalla, y se va
  // solo a los ocho segundos.
  const aviso = page.getByRole('status').filter({ hasText: 'Liquidación emitida' })
  await expect(aviso).toBeVisible()
  await expect(aviso).toHaveCount(0, { timeout: 12_000 })

  const periodo = await prisma.periodo.findUniqueOrThrow({ where: { id: escenario.periodoId } })
  expect(periodo.estado).toBe('liquidado')

  // Quien administra ve lo emitido mes a mes, no la expensa de cada unidad: con
  // 96 unidades esa tabla no se lee y cuesta una URL firmada por fila.
  await page.goto(`/consorcios/${escenario.consorcioId}/expensas`)
  await expect(page.getByRole('cell', { name: '09/2026' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '$ 184.320,75' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '3B', exact: true })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: '3C', exact: true })).toHaveCount(0)
  expect(await desbordaALoAncho(page)).toBe(false)

  // Y el detalle por unidad sigue a un clic, dentro de la liquidación.
  await page.getByRole('cell', { name: '09/2026' }).getByRole('link').click()
  await expect(page.getByRole('cell', { name: '3B', exact: true })).toBeVisible()
})
