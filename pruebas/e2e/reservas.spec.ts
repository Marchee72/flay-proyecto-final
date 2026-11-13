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
 * `CU-09` desde el telefono: reservar, chocar con una reserva superpuesta y
 * leer el mensaje, cancelar. La superposicion la rechaza la base (SC-005).
 */

let consorcista: Escenario
let espacioId: string

/** Un instante a N horas de ahora, en el formato de `datetime-local` (hora de Argentina). */
const enHoras = (h: number) => {
  const fecha = new Date(Date.now() + h * 3_600_000)
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha)
  return partes.replace(' ', 'T')
}

test.beforeAll(async () => {
  consorcista = await sembrarEscenario('consorcista', 'Mitre 456')
  await sembrarUnidadPropia(consorcista)
  espacioId = (
    await prisma.espacioComun.create({
      data: { consorcioId: consorcista.consorcioId, nombre: 'SUM', capacidadMaxima: 40 },
    })
  ).id
})

test.afterAll(async () => {
  await limpiarServicios(consorcista)
  await limpiarEscenario(consorcista)
  await prisma.$disconnect()
})

test('reservar, chocar con otra reserva con un mensaje legible, y cancelar', async ({ page }) => {
  await entrar(page, consorcista.correo)
  await page.goto(`/consorcios/${consorcista.consorcioId}/reservas`)
  await expect(page.getByRole('heading', { name: 'Reservas', level: 1 })).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)

  const reservarDesde = async (desde: number, hasta: number) => {
    await page.getByRole('button', { name: 'Reservar' }).click()
    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel('Espacio').selectOption(espacioId)
    await dialogo.getByLabel('Desde').fill(enHoras(desde))
    await dialogo.getByLabel('Hasta').fill(enHoras(hasta))
    await dialogo.getByLabel('Cantidad de personas').fill('12')
    await dialogo.getByRole('button', { name: 'Confirmar', exact: true }).click()
  }

  await reservarDesde(72, 76)
  await expect(page.getByRole('status').filter({ hasText: 'Reserva confirmada' })).toBeVisible()
  await expect(page.getByRole('table')).toContainText('SUM')
  await expect(page.getByRole('table')).toContainText('3B')
  expect(await desbordaALoAncho(page)).toBe(false)

  // La misma unidad, superpuesta: la base la rechaza y el mensaje lo dice.
  await reservarDesde(74, 78)
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('ya está reservado')
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar diálogo' }).click()

  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  // El aviso de la accion («Reserva cancelada.») y, si ya llego, el de la campana
  // («Reserva cancelada: SUM»): se acota al primero para no chocar con el segundo.
  await expect(page.getByRole('status').filter({ hasText: 'Reserva cancelada.' })).toBeVisible()
  await expect(page.getByRole('table')).toContainText('Cancelada')
})

test('el historial de reservas muestra la grilla de siete columnas sin desbordar la página', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'telefono', 'el desborde es del teléfono; una sola vez')
  const admin = await sembrarEscenario('administrador', 'Belgrano 789')
  try {
    await entrar(page, admin.correo)
    await page.goto(`/consorcios/${admin.consorcioId}/reservas/historial`)
    const calendario = page.getByRole('region', { name: 'Calendario de uso' })
    await expect(calendario.getByRole('columnheader', { name: 'Lun' })).toBeVisible()
    expect(await desbordaALoAncho(page)).toBe(false)
    const segundaSemana = await calendario.locator('tbody tr').nth(1).locator('td').all()
    expect(segundaSemana).toHaveLength(7)
    const ys = await Promise.all(segundaSemana.map(async (c) => (await c.boundingBox())?.y))
    expect(new Set(ys).size).toBe(1)
    // Ninguna celda hereda el formato de lista: ni el «· » ni el texto apagado.
    const estilo = (c: (typeof segundaSemana)[number]) =>
      c.evaluate((el) => {
        const e = getComputedStyle(el)
        return [e.fontSize, e.color, getComputedStyle(el, '::before').content]
      })
    const primera = await estilo(segundaSemana[0])
    const quinta = await estilo(segundaSemana[4])
    expect(quinta).toEqual(primera)
    expect(['none', 'normal']).toContain(quinta[2])
  } finally {
    await limpiarEscenario(admin)
  }
})
