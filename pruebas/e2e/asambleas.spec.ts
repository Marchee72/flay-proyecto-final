import { expect, test, type Browser, type Page } from '@playwright/test'

import { confirmarUnaVez, sembrarAsambleaE2E } from './asambleas-escenario'
import {
  CONTRASENA,
  desbordaALoAncho,
  entrar,
  prisma,
  type Escenario,
  type sembrarUsuarioEn,
} from './sesion'

/**
 * Una asamblea de punta a punta (016, quickstart § 3), sobre todo desde el
 * teléfono: acreditarse, votar en vivo y verlo en la pantalla de quien dirige
 * en ≤ 5 s (SC-001), cargar un voto a mano, finalizar, redactar el acta y
 * firmarla los cuatro con su contraseña. La convocatoria se siembra ya hecha
 * y con la hora de la reunión pasada: la anticipación mínima no se espera.
 */

type Extra = Awaited<ReturnType<typeof sembrarUsuarioEn>>

let ada: Escenario
let bruno: Extra // consejo: convoca y dirige; secretario
let cora: Extra
let dino: Extra
let eva: Extra // del consorcio, sin unidad ni poder: mira, pero no vota
let asambleaId: string
let ruta: () => string
let limpiar: () => Promise<void>

test.beforeAll(async () => {
  ;({ ada, bruno, cora, dino, eva, asambleaId, ruta, limpiar } = await sembrarAsambleaE2E())
})

test.afterAll(async () => {
  await limpiar()
  await prisma.$disconnect()
})

async function sesion(browser: Browser, correo: string, viewport = { width: 390, height: 844 }) {
  const contexto = await browser.newContext({ viewport })
  const page = await contexto.newPage()
  await entrar(page, correo)
  await page.goto(ruta())
  return page
}

const presente = async (page: Page) => {
  await page.getByRole('button', { name: /Estoy presente/ }).click()
  await expect(page.getByText('Asistencia registrada.').first()).toBeVisible()
}

test('el permiso de escucha exige sesión', async ({ browser }) => {
  const contexto = await browser.newContext()
  const respuesta = await contexto.request.get(
    `/api/asambleas/${crypto.randomUUID()}/en-vivo?consorcio=${crypto.randomUUID()}`,
  )
  expect(respuesta.status()).toBe(401)
  await contexto.close()
})

test('acreditarse, votar en vivo, finalizar y firmar el acta', async ({ browser, page }, info) => {
  test.skip(info.project.name !== 'telefono', 'el recorrido es del teléfono; una sola vez')
  test.setTimeout(240_000)

  // Quien dirige: abre la asamblea y se acredita.
  await entrar(page, bruno.correo)
  await page.goto(ruta())
  await page.getByRole('button', { name: 'Abrir la asamblea' }).click()
  await expect(page).toHaveURL(/hecho=asamblea-abierta/)
  await presente(page)
  expect(await desbordaALoAncho(page)).toBe(false)

  // Los demás, desde su teléfono.
  const deAda = await sesion(browser, ada.correo)
  const inicioAda = Date.now()
  await presente(deAda)
  const deCora = await sesion(browser, cora.correo)
  await presente(deCora)
  const deDino = await sesion(browser, dino.correo)
  await presente(deDino)

  // Autoridades, quórum y primer punto.
  await page.goto(ruta())
  await page.getByLabel('Presidente').selectOption({ label: '1A — Ada Diaz' })
  await page.getByLabel('Secretario/a').selectOption({ label: '1B — Bruno Paz' })
  await page.getByRole('button', { name: 'Designar' }).click()
  await expect(page.getByText('Presidente y secretario designados.').first()).toBeVisible()
  await page.getByRole('button', { name: 'Constituir' }).click()
  await expect(
    page.getByText('Asamblea constituida: ya se pueden tratar los puntos.').first(),
  ).toBeVisible()
  // Sin punto abierto todavía no hay nada que anotar (RF-32).
  const nota = page.getByLabel('Lo que se va debatiendo')
  await expect(page.getByText('0 de 2 tratados, faltan 2')).toBeVisible()
  await expect(nota).toHaveCount(0)
  await expect(page.getByText('No hay ningún punto abierto')).toBeVisible()
  await page.getByRole('button', { name: /Abrir el punto 1/ }).click()
  await expect(page.getByText('Punto en votación.').first()).toBeVisible()

  // El avance se ve, y un título larguísimo no desarma la página (RF-31, RNF-01).
  await expect(page.getByText('punto 1 de 2, falta 1')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Ahora' })).toHaveCount(1)
  expect(await desbordaALoAncho(page)).toBe(false)

  // Las notas son la fuente del borrador del acta.
  await nota.fill('Tres presupuestos de pintura')
  await nota.blur()

  // Ada ve el punto aparecer solo (EnVivo) y vota.
  await deAda
    .getByRole('button', { name: 'Votar Positivo por la unidad 1A' })
    .click({ timeout: 10_000 })
  await expect(deAda.getByText('Voto registrado.').first()).toBeVisible()
  expect(Date.now() - inicioAda).toBeLessThan(30_000 + 60_000) // SC-006, con el resto del alta en el medio
  await expect(
    deAda.getByRole('button', { name: 'Votar Positivo por la unidad 1A' }),
  ).toHaveAttribute('aria-pressed', 'true')

  // Quien dirige lo ve en su pantalla sin recargar (SC-001: ≤ 5 s).
  await expect(page.getByText('Votos por unidad (1)')).toBeVisible({ timeout: 5_000 })

  // Sin unidad ni poder: ve el punto y el motivo, pero no tiene con qué votar.
  await expect(deAda.getByText('No representás ninguna unidad')).toHaveCount(0)
  const deEva = await sesion(browser, eva.correo)
  await expect(deEva.getByText('No representás ninguna unidad')).toBeVisible()
  await expect(deEva.getByRole('button', { name: /^Votar / })).toHaveCount(0)

  // Voto a mano por Cora; Dino y quien dirige votan solos; cierre.
  await page.getByLabel('Cargar voto de').selectOption({ label: '2A — Cora Paz' })
  await page.getByLabel('Voto', { exact: true }).selectOption({ label: 'Negativo' })
  await page.getByRole('button', { name: 'Cargar voto' }).click()
  await expect(page.getByText('Voto registrado.').first()).toBeVisible()
  await deDino
    .getByRole('button', { name: 'Votar Positivo por la unidad 2B' })
    .click({ timeout: 10_000 })
  await expect(deDino.getByText('Voto registrado.').first()).toBeVisible()
  // Quien dirige también vota por su unidad: 1A + 1B + 2B = 3 de 4 unidades y 80 de 100.
  await page.getByRole('button', { name: 'Votar Positivo por la unidad 1B' }).click()
  await expect(page.getByText('Voto registrado.').first()).toBeVisible()
  await page.getByRole('button', { name: /Cerrar el punto 1/ }).click()
  await page.getByRole('button', { name: 'Confirmar cierre' }).click()
  await expect(page.getByText('Punto cerrado con su resultado.').first()).toBeVisible()
  await expect(page.getByText('Aprobado', { exact: true })).toBeVisible()
  await expect(page.getByText('1 de 2 tratados, falta 1')).toBeVisible()
  await expect(page.getByText('Tres presupuestos de pintura')).toBeVisible()

  await page.getByRole('button', { name: /Abrir el punto 2/ }).click()
  await expect(page.getByText('punto 2 de 2, es el último')).toBeVisible()

  // Se cierra el punto con una nota sin guardar: el texto no se pierde en silencio.
  const secretaria = await sesion(browser, bruno.correo)
  const sinRed = secretaria.context()
  await sinRed.route('**/*', (pedido) =>
    pedido.request().method() === 'POST' ? pedido.abort() : pedido.continue(),
  )
  await secretaria.getByLabel('Lo que se va debatiendo').fill('Texto sin guardar')
  await expect(secretaria.getByText(/No se pudo guardar la nota/).first()).toBeVisible()
  await page.getByRole('button', { name: /Cerrar el punto 2/ }).click()
  await page.getByRole('button', { name: 'Confirmar cierre' }).click()
  await expect(page.getByText('Punto cerrado con su resultado.').first()).toBeVisible()
  await sinRed.unroute('**/*')
  await expect(secretaria.getByLabel('No se guardó: copialo')).toHaveValue('Texto sin guardar', {
    timeout: 15_000,
  })

  // Se trató todo: cada presente deja lo que quiere que se tenga en cuenta (RF-32).
  await deAda.getByRole('textbox', { name: 'Tu observación' }).fill('Pido que conste el palier')
  await deAda.getByRole('button', { name: 'Guardar observación' }).click()
  await expect(deAda.getByText('Observación guardada.').first()).toBeVisible()
  await expect(page.getByText('1 observación recibida')).toBeVisible({ timeout: 5_000 })

  await page.getByRole('button', { name: 'Finalizar la asamblea' }).click()
  await confirmarUnaVez(
    page,
    asambleaId,
    'Confirmar finalización',
    'Finalizando…',
    /acta\?hecho=asamblea-finalizada/,
  )

  // El acta: el borrador llega solo y una persona lo revisa antes de firmantes y envío.
  await expect(page.getByText('Borrador de IA, revisalo').first()).toBeVisible({ timeout: 15_000 })
  const resumen = page.getByLabel('Resumen de lo debatido').first()
  await expect(resumen).toHaveValue(/Tres presupuestos de pintura/)
  await expect(resumen).toHaveValue(/Pido que conste el palier/)
  const observaciones = page.getByRole('region', { name: 'Observaciones de los presentes (1)' })
  await expect(observaciones.getByText('Pido que conste el palier')).toBeVisible()
  await expect(observaciones.getByText(/1A/)).toBeVisible()
  // Ada preside y la lee; Cora solo asistió.
  await deCora.goto(`${ruta()}/acta`)
  await expect(deCora.getByText('Lo tratado')).toBeVisible()
  await expect(deCora.getByText('Pido que conste el palier')).toHaveCount(0)

  // Mientras la IA redacta, cada resumen muestra que su texto está por llegar.
  const redactando = (borradorPedidoEn: Date | null) =>
    prisma.actaAsamblea.updateMany({ where: { asambleaId }, data: { borradorPedidoEn } })
  await redactando(new Date())
  await page.reload()
  await expect(page.getByText(/La IA está redactando el borrador/)).toBeVisible()
  await expect(page.locator('.acta__punto [aria-busy="true"]')).toHaveCount(2)
  await expect(page.getByLabel('Resumen de lo debatido')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Guardar resúmenes' })).toBeDisabled()
  await redactando(null)
  await page.reload()

  await resumen.fill('Se presentaron tres presupuestos de pintura.')
  await page.getByRole('button', { name: 'Guardar resúmenes' }).click()
  await expect(page).toHaveURL(/hecho=resumen-guardado/)
  await page.getByRole('checkbox', { name: /Cora/ }).check()
  await page.getByRole('checkbox', { name: /Dino/ }).check()
  await page.getByRole('button', { name: 'Guardar firmantes' }).click()
  await expect(page).toHaveURL(/hecho=firmantes-designados/)
  await page.getByRole('button', { name: 'Enviar a firmar' }).click()
  await confirmarUnaVez(page, asambleaId, 'Confirmar envío', 'Enviando…', /hecho=acta-enviada/)

  // Firman los cuatro con su contraseña.
  for (const firmante of [page, deAda, deCora, deDino]) {
    await firmante.goto(`${ruta()}/acta`)
    await firmante.getByLabel('Confirmá tu contraseña para firmar').fill(CONTRASENA)
    await firmante.getByRole('button', { name: 'Firmar el acta' }).click()
    await expect(firmante).toHaveURL(/hecho=acta-firmada/)
  }
  await page.goto(`${ruta()}/acta`)
  await expect(page.getByText('Firmada. Está en la documentación del consorcio.')).toBeVisible()
  await expect(page.getByText(/Íntegra/)).toBeVisible()

  // Y queda en la documentación del consorcio.
  await page.goto(`/consorcios/${ada.consorcioId}/documentos`)
  await expect(page.getByText('Acta — Asamblea ordinaria')).toBeVisible()
})
