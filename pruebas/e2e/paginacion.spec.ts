import { expect, test } from '@playwright/test'

import { entrar, limpiarEscenario, prisma, sembrarEscenario, type Escenario } from './sesion'

/**
 * Toda tabla pagina de a 20 en el navegador (`TablaDesplazable`). Se prueba
 * sobre Proveedores porque sus filas no tienen restricciones que sembrar.
 */

let escenario: Escenario

test.beforeAll(async () => {
  escenario = await sembrarEscenario('administrador')
  await prisma.proveedor.createMany({
    data: Array.from({ length: 25 }, (_, i) => ({
      consorcioId: escenario.consorcioId,
      razonSocial: `Proveedor ${String(i + 1).padStart(2, '0')}`,
      cuit: `20-${10000000 + i}-1`,
    })),
  })
})

test.afterAll(async () => {
  await limpiarEscenario(escenario)
  await prisma.$disconnect()
})

test('una tabla de mas de 20 filas muestra 20 y pasa a la segunda pagina', async ({ page }) => {
  // El escenario ya trae su propio proveedor: el total se lee, no se supone.
  const total = await prisma.proveedor.count({ where: { consorcioId: escenario.consorcioId } })
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}/proveedores`)

  const filas = page.locator('.tabla-desplazable tbody tr:not([hidden])')
  await expect(filas).toHaveCount(20)
  await expect(page.getByText(`Mostrando 1–20 de ${total}`)).toBeVisible()

  await page.getByRole('button', { name: 'Página 2' }).click()
  await expect(filas).toHaveCount(total - 20)
  await expect(page.getByText(`Mostrando 21–${total} de ${total}`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Página 2' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})
