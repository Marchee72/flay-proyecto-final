import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import {
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
 * `CU-12` y `CU-15`: el administrador publica una novedad y el consorcista la
 * ve; carga un documento no visible y el consorcista no lo ve; el boton de
 * avisos despacha lo pendiente.
 */

let administrador: Escenario
let consorcista: { usuarioId: string; personaId: string; correo: string }

test.beforeAll(async () => {
  administrador = await sembrarEscenario('administrador', 'Mitre 456')
  consorcista = await sembrarUsuarioEn(administrador, 'consorcista')
  await prisma.documentoConsorcio.createMany({
    data: [
      {
        consorcioId: administrador.consorcioId,
        tipo: 'reglamento_copropiedad',
        titulo: 'Reglamento de copropiedad',
        claveAlmacenamiento: `documentos/${administrador.consorcioId}/a/reglamento.pdf`,
        tipoContenido: 'application/pdf',
        visibleConsorcistas: true,
        cargadoPor: administrador.usuarioId,
      },
      {
        consorcioId: administrador.consorcioId,
        tipo: 'contrato',
        titulo: 'Contrato de limpieza',
        claveAlmacenamiento: `documentos/${administrador.consorcioId}/b/contrato.pdf`,
        tipoContenido: 'application/pdf',
        visibleConsorcistas: false,
        cargadoPor: administrador.usuarioId,
      },
    ],
  })
})

test.afterAll(async () => {
  await prisma.novedad.deleteMany({ where: { consorcioId: administrador.consorcioId } })
  await limpiarServicios(administrador, [consorcista])
  await limpiarEscenario(administrador)
  await prisma.$disconnect()
})

test('la novedad del administrador la ve el consorcista, y el contrato no visible no', async ({
  page,
}) => {
  await entrar(page, administrador.correo)
  await page.goto(`/consorcios/${administrador.consorcioId}/novedades`)
  await page.getByRole('button', { name: 'Publicar novedad' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Título').fill('Corte de agua el jueves')
  await dialogo.getByLabel('Texto').fill('De 9 a 12 por obras en la calle.')
  await dialogo.getByRole('button', { name: 'Publicar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Novedad publicada' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Corte de agua el jueves/ })).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)

  await page.goto(`/consorcios/${administrador.consorcioId}/documentos`)
  await expect(page.getByRole('table')).toContainText('Contrato de limpieza')
  await expect(page.getByRole('table')).toContainText('Reglamento de copropiedad')

  await page.goto(`/bandeja`)
  await page.getByRole('button', { name: 'Enviar avisos ahora' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Se despachó' })).toBeVisible()

  await page.context().clearCookies()
  await entrar(page, consorcista.correo)
  await page.goto(`/consorcios/${administrador.consorcioId}/novedades`)
  await expect(page.getByRole('heading', { name: /Corte de agua el jueves/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Publicar novedad' })).toHaveCount(0)

  // En el inicio tambien; descartar la saca del inicio, pero queda en Novedades (RF-18).
  await page.goto(`/consorcios/${administrador.consorcioId}`)
  const tarjeta = page.getByRole('article').filter({ hasText: 'Corte de agua el jueves' })
  await expect(tarjeta).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)
  await tarjeta.getByRole('button', { name: 'Descartar' }).click()
  await expect(tarjeta).toHaveCount(0)
  await page.goto(`/consorcios/${administrador.consorcioId}/novedades`)
  await expect(page.getByRole('heading', { name: /Corte de agua el jueves/ })).toBeVisible()

  await page.goto(`/consorcios/${administrador.consorcioId}/documentos`)
  await expect(page.getByRole('table')).toContainText('Reglamento de copropiedad')
  await expect(page.getByText('Contrato de limpieza')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cargar documento' })).toHaveCount(0)
  expect(await desbordaALoAncho(page)).toBe(false)
})

test('el administrador elimina un documento; el consorcista no ve el botón (RF-19)', async ({
  page,
}) => {
  const documento = await prisma.documentoConsorcio.create({
    data: {
      consorcioId: administrador.consorcioId,
      tipo: 'otro',
      titulo: 'Póliza para eliminar',
      claveAlmacenamiento: `documentos/${administrador.consorcioId}/c/poliza.pdf`,
      tipoContenido: 'application/pdf',
      visibleConsorcistas: true,
      cargadoPor: administrador.usuarioId,
    },
  })
  const ruta = `/consorcios/${administrador.consorcioId}/documentos/${documento.id}`

  await entrar(page, consorcista.correo)
  await page.goto(ruta)
  await expect(page.getByRole('heading', { name: 'Póliza para eliminar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0)

  await page.context().clearCookies()
  await entrar(page, administrador.correo)
  await page.goto(ruta)
  await page.getByRole('button', { name: 'Eliminar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archivar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Documento archivado.' })).toBeVisible()
  await expect(page.getByRole('table')).not.toContainText('Póliza para eliminar')
})

test('el modal de carga se cierra al confirmar, y con error queda abierto (RF-19)', async ({
  page,
}) => {
  // El almacén en memoria no recibe PUT: se da por subido.
  await page.route('**/memoria', (ruta) => ruta.fulfill({ status: 200 }))
  await entrar(page, administrador.correo)
  await page.goto(`/consorcios/${administrador.consorcioId}/documentos`)
  const abrir = () => page.getByRole('button', { name: 'Cargar documento' }).click()
  const pdf = { name: 'r.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }

  // Sin título: el servidor rechaza y el mensaje queda en el modal abierto.
  await abrir()
  const dialogo = page.getByRole('dialog')
  await dialogo.locator('input[type=file]').setInputFiles(pdf)
  await dialogo.getByRole('button', { name: 'Cargar', exact: true }).click()
  await expect(dialogo.getByRole('alert')).toBeVisible()

  await dialogo.getByLabel('Título').fill('Reglamento interno 2026')
  await dialogo.getByRole('button', { name: 'Cargar', exact: true }).click()
  await expect(dialogo).toBeHidden()
  await expect(page.getByRole('table')).toContainText('Reglamento interno 2026')
})

test('las sugerencias de configuración de un reglamento se aplican o se descartan (RF-19, RN-14)', async ({
  page,
}) => {
  // Lo que deja la cola despues de `indexar_documento`: el texto del reglamento
  // de prueba en un fragmento. El almacen de los e2e no guarda lo que se sube.
  const documento = await prisma.documentoConsorcio.create({
    data: {
      consorcioId: administrador.consorcioId,
      tipo: 'reglamento_interno',
      titulo: 'Reglamento interno de espacios',
      claveAlmacenamiento: `documentos/${administrador.consorcioId}/d/reglamento-interno.pdf`,
      tipoContenido: 'application/pdf',
      visibleConsorcistas: true,
      cargadoPor: administrador.usuarioId,
      estadoIndexacion: 'indexado',
      hashSha256: 'f'.repeat(64),
    },
  })
  await prisma.fragmentoDocumento.create({
    data: {
      documentoId: documento.id,
      numeroFragmento: 1,
      pagina: 1,
      contenido: readFileSync('pruebas/fixtures/reglamento-de-prueba.txt', 'utf8'),
    },
  })
  const ruta = `/consorcios/${administrador.consorcioId}/documentos/${documento.id}`

  const lista = `/consorcios/${administrador.consorcioId}/documentos`
  await entrar(page, administrador.correo)
  await page.goto(ruta)
  // Un documento cargado antes del analisis se lee a pedido; el sondeo drena la cola.
  await page.getByRole('button', { name: 'Buscar configuración' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Estamos leyendo el documento' }),
  ).toBeVisible()
  const aviso = page.getByRole('region', { name: /La IA encontró 2 cambios de configuración/ })
  await expect(aviso).toBeVisible({ timeout: 25_000 })
  await aviso.getByRole('link', { name: 'Revisar' }).click()
  await expect(page).toHaveURL(new RegExp(`/documentos/sugerencias#documento-${documento.id}$`))
  await expect(
    page.getByRole('heading', { name: 'Sugerencias de configuración', level: 1 }),
  ).toBeVisible()
  const seccion = page.getByRole('region', { name: 'Reglamento interno de espacios' })
  const sum = seccion.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Nuevo espacio: SUM', level: 3 }),
  })
  await expect(sum).toBeVisible()
  await expect(sum.getByRole('columnheader', { name: 'Propuesto' })).toBeVisible()
  await expect(sum.getByRole('row', { name: /Horario.*de 10:00 a 23:00/ })).toBeVisible()
  await expect(sum.locator('blockquote')).toContainText('El SUM se usa de 10 a 23 horas')
  expect(await desbordaALoAncho(page)).toBe(false)

  // En el listado, el aviso nombra el documento y la fila lleva a su grupo.
  await page.goto(lista)
  await expect(page.getByRole('region', { name: /La IA encontró/ })).toContainText(
    'Reglamento interno de espacios',
  )
  await page.getByRole('link', { name: '2 sugerencias' }).click()
  await expect(page).toHaveURL(new RegExp(`/documentos/sugerencias#documento-${documento.id}$`))

  await sum.getByRole('button', { name: 'Aplicar' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Configuración aplicada.' }),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/documentos\/sugerencias/)
  const mora = seccion.getByRole('article').filter({ hasText: 'Vencimientos y mora' })
  await mora.getByRole('button', { name: 'Descartar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Sugerencia descartada.' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(0)
  const historia = page.locator('details.sugerencias__historia')
  await expect(historia.locator('summary')).toHaveText('Ya revisadas (2)')
  await historia.locator('summary').click()
  await expect(historia).toContainText('Nuevo espacio: SUM')
  await expect(historia).toContainText('Aplicada')
  await expect(historia).toContainText('Descartada')
  await expect(historia).toContainText('Reglamento interno de espacios')
  expect(await desbordaALoAncho(page)).toBe(false)

  await page.goto(lista)
  await expect(page.getByRole('region', { name: /La IA encontró/ })).toHaveCount(0)

  await page.goto(`/consorcios/${administrador.consorcioId}/espacios`)
  const espacio = page.getByRole('article').filter({ hasText: 'SUM' })
  await expect(espacio).toContainText('de 10:00 a 23:00')

  await page.context().clearCookies()
  await entrar(page, consorcista.correo)
  await page.goto(ruta)
  await expect(page.getByRole('heading', { name: 'Reglamento interno de espacios' })).toBeVisible()
  await expect(page.getByRole('region', { name: /La IA encontró/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Buscar configuración' })).toHaveCount(0)
  await page.goto(`${lista}/sugerencias`)
  await expect(page.getByRole('article')).toHaveCount(0)
  await expect(page.getByText(/administrador/i).first()).toBeVisible()
})
