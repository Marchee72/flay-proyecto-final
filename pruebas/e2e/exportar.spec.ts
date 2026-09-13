import { expect, test } from '@playwright/test'

import { entrar, limpiarEscenario, prisma, sembrarEscenario, type Escenario } from './sesion'

/**
 * Exportacion abierta por HTTP (`FR-032b`, SC-018): sin sesion 401, otro
 * consorcio 404, y con la sesion del administrador el CSV baja con BOM,
 * encabezado y el gasto del escenario con su importe como cadena.
 */

let escenario: Escenario
let ajeno: Escenario

test.beforeAll(async () => {
  escenario = await sembrarEscenario('administrador', 'Mitre 456')
  ajeno = await sembrarEscenario('administrador', 'San Martin 7890')
})

test.afterAll(async () => {
  await limpiarEscenario(escenario)
  await limpiarEscenario(ajeno)
  await prisma.$disconnect()
})

test('sin sesión 401, otro consorcio 404, el propio baja el CSV', async ({ page, request }) => {
  const sinSesion = await request.get(`/api/exportar/${escenario.consorcioId}/gastos.csv`)
  expect(sinSesion.status()).toBe(401)

  await entrar(page, escenario.correo)
  const otro = await page.request.get(`/api/exportar/${ajeno.consorcioId}/gastos.csv`)
  expect(otro.status()).toBe(404)
  const tablaInventada = await page.request.get(
    `/api/exportar/${escenario.consorcioId}/usuarios.csv`,
  )
  expect(tablaInventada.status()).toBe(404)

  const propio = await page.request.get(`/api/exportar/${escenario.consorcioId}/gastos.csv`)
  expect(propio.status()).toBe(200)
  expect(propio.headers()['content-type']).toContain('text/csv')
  const texto = await propio.text()
  expect(texto.charCodeAt(0)).toBe(0xfeff)
  const [encabezado, fila] = texto.slice(1).split('\r\n')
  expect(encabezado.split(';')).toContain('importe')
  const gasto = await prisma.gasto.findUniqueOrThrow({ where: { id: escenario.gastoId } })
  expect(fila.split(';')[encabezado.split(';').indexOf('importe')]).toBe(gasto.importe.toFixed(2))

  // El boton esta en el listado.
  await page.goto(`/gastos?consorcio=${escenario.consorcioId}`)
  await expect(page.getByRole('link', { name: 'Exportar CSV' })).toHaveAttribute(
    'href',
    `/api/exportar/${escenario.consorcioId}/gastos.csv`,
  )
})
