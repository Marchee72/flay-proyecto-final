import { expect, test, type Browser, type Page } from '@playwright/test'

import {
  CONTRASENA,
  desbordaALoAncho,
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  sembrarUsuarioEn,
  type Escenario,
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
let asambleaId: string

const ruta = () => `/consorcios/${ada.consorcioId}/asambleas/${asambleaId}`

test.beforeAll(async () => {
  ada = await sembrarEscenario('consorcista', 'Sol 123')
  bruno = await sembrarUsuarioEn(ada, 'consejo')
  cora = await sembrarUsuarioEn(ada, 'consorcista')
  dino = await sembrarUsuarioEn(ada, 'consorcista')
  for (const [extra, nombre] of [
    [bruno, 'Bruno'],
    [cora, 'Cora'],
    [dino, 'Dino'],
  ] as const) {
    await prisma.persona.update({ where: { id: extra.personaId }, data: { nombre } })
  }

  const unidades = [
    { designacion: '1A', coeficiente: '40.00000000', persona: ada.personaId },
    { designacion: '1B', coeficiente: '30.00000000', persona: bruno.personaId },
    { designacion: '2A', coeficiente: '20.00000000', persona: cora.personaId },
    { designacion: '2B', coeficiente: '10.00000000', persona: dino.personaId },
  ].map((u) => ({ ...u, id: crypto.randomUUID() }))
  await prisma.unidad.createMany({
    data: unidades.map(({ id, designacion, coeficiente }) => ({
      id,
      designacion,
      coeficiente,
      consorcioId: ada.consorcioId,
    })),
  })
  for (const u of unidades) {
    await prisma.$executeRaw`
      INSERT INTO "Ocupacion" (unidad_id, persona_id, tipo, vigencia)
      VALUES (${u.id}::uuid, ${u.persona}::uuid, 'propietario'::"TipoOcupacion", daterange('2026-01-01', NULL))`
  }

  // Convocada hace semanas para una reunión que empezó hace diez minutos.
  const asamblea = await prisma.asamblea.create({
    data: {
      consorcioId: ada.consorcioId,
      tipo: 'ordinaria',
      titulo: 'Asamblea ordinaria',
      fechaHora: new Date(Date.now() - 10 * 60_000),
      lugar: 'SUM',
      organizadorId: bruno.usuarioId,
    },
  })
  asambleaId = asamblea.id
  await prisma.puntoAsamblea.create({
    data: {
      consorcioId: ada.consorcioId,
      asambleaId,
      orden: 1,
      titulo: 'Pintura del frente',
      modalidad: 'binaria',
      mayoria: 'absoluta',
    },
  })
  await prisma.asamblea.update({
    where: { id: asambleaId },
    data: {
      estado: 'convocada',
      convocadaEn: new Date(Date.now() - 20 * 86_400_000),
      reglaMayoria: 'presentes',
      anticipacionDias: 15,
      topeApoderado: 3,
      umbralSinVoto: 2,
    },
  })
})

test.afterAll(async () => {
  await limpiarServicios(ada, [bruno, cora, dino])
  await limpiarEscenario(ada)
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
  await page.getByRole('button', { name: 'Verificar quórum y constituir' }).click()
  await expect(
    page.getByText('Asamblea constituida: ya se pueden tratar los puntos.').first(),
  ).toBeVisible()
  await page.getByRole('button', { name: /Abrir el punto 1/ }).click()
  await expect(page.getByText('Punto en votación.').first()).toBeVisible()

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
  await page.getByRole('button', { name: 'Finalizar la asamblea' }).click()
  await page.getByRole('button', { name: 'Confirmar finalización' }).click()
  await expect(page).toHaveURL(/acta\?hecho=asamblea-finalizada/)

  // El acta: resumen, firmantes y envío.
  await page
    .getByLabel('Resumen de lo debatido')
    .fill('Se presentaron tres presupuestos de pintura.')
  await page.getByRole('button', { name: 'Guardar resumen' }).click()
  await expect(page).toHaveURL(/hecho=resumen-guardado/)
  await page.getByRole('checkbox', { name: /Cora/ }).check()
  await page.getByRole('checkbox', { name: /Dino/ }).check()
  await page.getByRole('button', { name: 'Guardar firmantes' }).click()
  await expect(page).toHaveURL(/hecho=firmantes-designados/)
  await page.getByRole('button', { name: 'Enviar a firmar' }).click()
  await page.getByRole('button', { name: 'Confirmar envío' }).click()
  await expect(page).toHaveURL(/hecho=acta-enviada/)

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
