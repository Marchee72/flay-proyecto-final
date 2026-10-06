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

/**
 * El asistente conversacional (RF-27) con la implementacion determinista: el
 * pedido de una escritura muestra una tarjeta y NO ejecuta; el clic en
 * «Confirmar» ejecuta una sola vez. Corre en escritorio y en telefono.
 */

let escenario: Escenario
let unidadId: string
let espacioId: string

test.beforeAll(async () => {
  escenario = await sembrarEscenario('consorcista', 'Mitre 456')
  unidadId = await sembrarUnidadPropia(escenario)
  espacioId = (
    await prisma.espacioComun.create({
      data: { consorcioId: escenario.consorcioId, nombre: 'SUM', capacidadMaxima: 40 },
    })
  ).id
})

test.afterAll(async () => {
  await limpiarServicios(escenario)
  await limpiarEscenario(escenario)
  await prisma.$disconnect()
})

const enHoras = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

test('reservar por el chat: tarjeta, confirmar una vez y aviso', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}`)

  await page.getByRole('button', { name: 'Abrir asistente' }).click()
  const panel = page.getByRole('dialog', { name: 'Asistente' })
  await panel
    .getByLabel('Tu consulta')
    .fill(
      `crear_reserva espacioId=${espacioId} unidadId=${unidadId} desde=${enHoras(72)} hasta=${enHoras(75)}`,
    )
  await panel.getByRole('button', { name: 'Enviar' }).click()

  await expect(panel.getByText(/Reservar SUM/)).toBeVisible()
  expect(await prisma.reserva.count({ where: { consorcioId: escenario.consorcioId } })).toBe(0)
  expect(await desbordaALoAncho(page)).toBe(false)

  await panel.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'la acción se realizó' })).toBeVisible()
  await expect(panel.getByText('Resuelta.')).toBeVisible()
  expect(await prisma.reserva.count({ where: { consorcioId: escenario.consorcioId } })).toBe(1)
})

test('una lectura muestra la respuesta con sus datos reales y un pedido ajeno se niega', async ({
  page,
}) => {
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}`)
  await page.getByRole('button', { name: 'Abrir asistente' }).click()
  const panel = page.getByRole('dialog', { name: 'Asistente' })

  await panel.getByLabel('Tu consulta').fill('ver_espacios')
  await panel.getByRole('button', { name: 'Enviar' }).click()
  await expect(panel.getByRole('link', { name: /Espacios/ })).toBeVisible()

  await panel.getByLabel('Tu consulta').fill('escribime un poema')
  await panel.getByRole('button', { name: 'Enviar' }).click()
  await expect(panel.getByText(/Solo puedo ayudarte con cosas de tu consorcio/)).toBeVisible()
})

test('el turno viaja como flujo de eventos: pensando, texto en partes y fin', async ({ page }) => {
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}`)

  // Se lee dentro de la pagina: Playwright no puede pedir despues el cuerpo de un flujo.
  const eventos = await page.evaluate(async (consorcioId) => {
    const res = await fetch('/api/asistente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consorcioId, conversacionId: null, texto: 'ver_espacios' }),
    })
    const texto = await res.text()
    return texto
      .split(String.fromCharCode(10))
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { t: string })
  }, escenario.consorcioId)

  expect(eventos[0].t).toBe('pensando')
  expect(eventos.filter((e) => e.t === 'texto').length).toBeGreaterThan(1)
  expect(eventos.map((e) => e.t)).toContain('fin')
})

test('una sugerencia no ejecuta nada: manda el pedido y la tarjeta espera el clic', async ({
  page,
}) => {
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}`)
  await page.getByRole('button', { name: 'Abrir asistente' }).click()
  const panel = page.getByRole('dialog', { name: 'Asistente' })

  await panel.getByLabel('Tu consulta').fill('se rompió algo en la terraza')
  await panel.getByRole('button', { name: 'Enviar' }).click()
  await panel.getByRole('button', { name: 'Levantar un reclamo' }).click()
  // El consorcista puede reclamar pero no deshabilitar el espacio.
  await expect(panel.getByRole('button', { name: 'Deshabilitar el espacio' })).toHaveCount(0)

  await expect(panel.getByRole('button', { name: 'Confirmar' })).toBeVisible()
  expect(await prisma.reclamo.count({ where: { consorcioId: escenario.consorcioId } })).toBe(0)
  expect(await desbordaALoAncho(page)).toBe(false)

  await panel.getByRole('button', { name: 'Confirmar' }).click()
  await expect(panel.getByText('Resuelta.')).toBeVisible()
  // `Resuelta.` se marca también si la confirmación falló: se espera el efecto, no el cartel, y
  // si no llega el mensaje dice qué avisó la pantalla.
  const avisos = await page.locator('[role=status], [role=alert]').allTextContents()
  await expect
    .poll(() => prisma.reclamo.count({ where: { consorcioId: escenario.consorcioId } }), {
      message: `avisos en pantalla: ${avisos.join(' | ')}`,
    })
    .toBe(1)
})
