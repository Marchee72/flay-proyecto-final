import { expect, test } from '@playwright/test'

import { confirmarUnaVez, sembrarAsambleaE2E } from './asambleas-escenario'
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

test('constituir con doble clic envía una sola vez', async ({ browser }, info) => {
  test.skip(info.project.name !== 'telefono', 'el recorrido es del teléfono; una sola vez')
  test.setTimeout(120_000)
  const propio = await sembrarAsambleaE2E()
  try {
    // Bruno abre; Ada, Bruno y Cora se acreditan (90 % del padrón) y él designa autoridades.
    const sesion = async (correo: string) => {
      const pagina = await (
        await browser.newContext({ viewport: { width: 390, height: 844 } })
      ).newPage()
      await entrar(pagina, correo)
      await pagina.goto(propio.ruta())
      return pagina
    }
    const deBruno = await sesion(propio.bruno.correo)
    await deBruno.getByRole('button', { name: 'Abrir la asamblea' }).click()
    await expect(deBruno).toHaveURL(/hecho=asamblea-abierta/)
    for (const pagina of [
      deBruno,
      await sesion(propio.ada.correo),
      await sesion(propio.cora.correo),
    ]) {
      await pagina.getByRole('button', { name: /Estoy presente/ }).click()
      await expect(pagina.getByText('Asistencia registrada.').first()).toBeVisible()
    }
    await deBruno.goto(propio.ruta())
    await deBruno.getByLabel('Presidente').selectOption({ index: 1 })
    await deBruno.getByLabel('Secretario/a').selectOption({ index: 2 })
    await deBruno.getByRole('button', { name: 'Designar' }).click()
    await expect(deBruno.getByText('Presidente y secretario designados.').first()).toBeVisible()

    await confirmarUnaVez(
      deBruno,
      propio.asambleaId,
      'Verificar quórum y constituir',
      'Constituyendo…',
      /asambleas\//,
      // La acción no navega: el fin es el aviso de éxito.
      () =>
        expect(
          deBruno.getByText('Asamblea constituida: ya se pueden tratar los puntos.').first(),
        ).toBeVisible(),
    )
    await expect(deBruno.getByText('La asamblea ya está constituida.')).toHaveCount(0)
  } finally {
    await propio.limpiar()
  }
})

test('tomar la dirección pide confirmación', async ({ browser }, info) => {
  test.skip(info.project.name !== 'telefono', 'el recorrido es del teléfono; una sola vez')
  const propio = await sembrarAsambleaE2E()
  try {
    // Dino pasa a consejo: puede dirigir, pero ya dirige Bruno.
    await prisma.habilitacion.updateMany({
      where: { usuarioId: propio.dino.usuarioId },
      data: { rol: 'consejo' },
    })
    const abrir = async (correo: string) => {
      const pagina = await (
        await browser.newContext({ viewport: { width: 390, height: 844 } })
      ).newPage()
      await entrar(pagina, correo)
      await pagina.goto(propio.ruta())
      return pagina
    }
    const deBruno = await abrir(propio.bruno.correo)
    await deBruno.getByRole('button', { name: 'Abrir la asamblea' }).click()
    await expect(deBruno).toHaveURL(/hecho=asamblea-abierta/)

    const deDino = await abrir(propio.dino.correo)
    await deDino.getByRole('button', { name: 'Tomar la dirección' }).click()
    const dialogo = deDino.getByRole('dialog')
    await expect(dialogo.getByText(/deja de dirigir/)).toBeVisible()
    await expect(deDino.getByText('Ahora dirigís la asamblea.')).toHaveCount(0)
    await dialogo.getByRole('button', { name: 'Confirmar' }).click()
    await expect(deDino.getByText('Ahora dirigís la asamblea.').first()).toBeVisible()
  } finally {
    await propio.limpiar()
  }
})

test('una opción con coma no se parte', async ({ browser }, info) => {
  test.skip(info.project.name !== 'telefono', 'el recorrido es del teléfono; una sola vez')
  const propio = await sembrarAsambleaE2E()
  try {
    const contexto = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const pagina = await contexto.newPage()
    await entrar(pagina, propio.bruno.correo)
    await pagina.goto(`/consorcios/${propio.ada.consorcioId}/asambleas/nueva`)
    await pagina.getByLabel('Título', { exact: true }).first().fill('Asamblea con opciones')
    await pagina.getByLabel('Primera convocatoria').fill('2099-03-10T19:00')
    await pagina.getByLabel('Lugar').fill('Salón')
    await pagina.locator('#punto-titulo-0').fill('Entre opciones')
    await pagina.locator('#punto-modalidad-0').selectOption('opcion_multiple')
    const campo = pagina.locator('#punto-0-opciones')
    await campo.fill('Limpiar, Inc.')
    await campo.press('Enter')
    await campo.fill('Brillo S.A.')
    await campo.press('Enter')
    const chips = pagina.locator('.opciones-coma__chip')
    await expect(chips).toHaveCount(2)
    await expect(chips.nth(0)).toContainText('1. Limpiar, Inc.')
    await expect(chips.nth(1)).toContainText('2. Brillo S.A.')
    await pagina.getByRole('button', { name: 'Guardar borrador' }).click()
    await expect(pagina).toHaveURL(/hecho=/)
    const opciones = await prisma.opcionPunto.findMany({
      where: {
        punto: {
          asamblea: { consorcioId: propio.ada.consorcioId, titulo: 'Asamblea con opciones' },
        },
      },
      orderBy: { orden: 'asc' },
    })
    expect(opciones.map((o) => o.texto)).toEqual(['Limpiar, Inc.', 'Brillo S.A.'])
  } finally {
    await propio.limpiar()
  }
})
