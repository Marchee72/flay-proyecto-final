import { expect, test } from '@playwright/test'

import {
  desbordaALoAncho,
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  type Escenario,
} from './sesion'

/**
 * El asistente fuera de un consorcio y en modo cartera (RF-27, FR-017, FR-018):
 * esta en la lista de consorcios, arranca mirando todos, y su unica escritura es
 * el aviso a toda la cartera, con una sola confirmacion.
 */

let escenario: Escenario
let otroConsorcioId: string

test.beforeAll(async () => {
  escenario = await sembrarEscenario('administrador', 'Mitre 456')
  const otro = await prisma.consorcio.create({
    data: {
      administradoraId: escenario.administradoraId,
      nombre: 'San Martin 7890',
      direccion: 'San Martin 7890',
      localidad: 'Rosario',
      cuit: `33-${Date.now() % 100_000_000}-1`,
    },
  })
  otroConsorcioId = otro.id
  await prisma.habilitacion.create({
    data: {
      usuarioId: escenario.usuarioId,
      consorcioId: otroConsorcioId,
      rol: 'administrador',
      vigenciaDesde: new Date('2026-01-01'),
    },
  })
})

test.afterAll(async () => {
  const ambos = [escenario.consorcioId, otroConsorcioId]
  await prisma.novedad.deleteMany({ where: { consorcioId: { in: ambos } } })
  await prisma.conversacionAsistente.deleteMany({ where: { consorcioId: otroConsorcioId } })
  await limpiarServicios(escenario)
  await prisma.habilitacion.deleteMany({ where: { consorcioId: otroConsorcioId } })
  await prisma.consorcio.deleteMany({ where: { id: otroConsorcioId } })
  await limpiarEscenario(escenario)
  await prisma.$disconnect()
})

test('en la lista de consorcios el asistente arranca en todos y publica a la cartera', async ({
  page,
}) => {
  await entrar(page, escenario.correo)
  await page.goto('/consorcios')
  await page.getByRole('button', { name: 'Abrir asistente' }).click()
  const panel = page.getByRole('dialog', { name: 'Asistente' })

  await expect(panel.getByLabel('Alcance del asistente')).toHaveValue('cartera')
  await expect(panel.getByText(/En contexto: .*Mitre 456.*San Martin 7890/)).toBeVisible()

  await panel
    .getByLabel('Tu consulta')
    .fill('publicar_novedad_cartera titulo="Corte de agua" cuerpo="El martes no hay agua"')
  await panel.getByRole('button', { name: 'Enviar' }).click()
  await expect(
    panel.getByText(/Publicar la novedad "Corte de agua" en los 2 consorcios/),
  ).toBeVisible()
  const ambos = { consorcioId: { in: [escenario.consorcioId, otroConsorcioId] } }
  expect(await prisma.novedad.count({ where: ambos })).toBe(0)
  expect(await desbordaALoAncho(page)).toBe(false)

  await panel.getByRole('button', { name: 'Confirmar' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Publicada en los 2 consorcios' }),
  ).toBeVisible()
  expect(await prisma.novedad.count({ where: ambos })).toBe(2)
})

test('en cartera una escritura de un solo consorcio sin nombrarlo pide el consorcio', async ({
  page,
}) => {
  const espacio = await prisma.espacioComun.create({
    data: { consorcioId: escenario.consorcioId, nombre: 'SUM', capacidadMaxima: 40 },
  })
  await entrar(page, escenario.correo)
  await page.goto('/consorcios')
  await page.getByRole('button', { name: 'Abrir asistente' }).click()
  const panel = page.getByRole('dialog', { name: 'Asistente' })

  await panel
    .getByLabel('Tu consulta')
    .fill(`deshabilitar_espacio espacioId=${espacio.id} motivo=pintura`)
  await panel.getByRole('button', { name: 'Enviar' }).click()
  await expect(
    panel.getByText(/Solo puedo ayudarte|No puedo hacer eso|¿Sobre qué consorcio/),
  ).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Confirmar' })).toHaveCount(0)
  expect((await prisma.espacioComun.findUnique({ where: { id: espacio.id } }))?.activo).toBe(true)
})

test('en cartera una lectura sin consorcio nombrado responde con los dos consorcios', async ({
  page,
}) => {
  await entrar(page, escenario.correo)
  await page.goto('/consorcios')
  await page.getByRole('button', { name: 'Abrir asistente' }).click()
  const panel = page.getByRole('dialog', { name: 'Asistente' })

  await panel.getByLabel('Tu consulta').fill('ver_reclamos')
  await panel.getByRole('button', { name: 'Enviar' }).click()
  // Un botón por consorcio, distinguibles por nombre (el nombre suelto también está en el
  // selector de alcance, oculto: `getByText` caería ahí).
  await expect(panel.getByRole('link', { name: /Ver en .* · Mitre 456/ })).toBeVisible()
  await expect(panel.getByRole('link', { name: /Ver en .* · San Martin 7890/ })).toBeVisible()
})
