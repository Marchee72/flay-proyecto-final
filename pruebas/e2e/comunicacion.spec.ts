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
  await prisma.documentoConsorcio.deleteMany({ where: { consorcioId: administrador.consorcioId } })
  await prisma.novedad.deleteMany({ where: { consorcioId: administrador.consorcioId } })
  await limpiarServicios(administrador, [consorcista])
  await limpiarEscenario(administrador)
  await prisma.$disconnect()
})

test('la novedad del administrador la ve el consorcista, y el contrato no visible no', async ({
  page,
}) => {
  await entrar(page, administrador.correo)
  await page.goto(`/novedades?consorcio=${administrador.consorcioId}`)
  await page.getByRole('button', { name: 'Publicar novedad' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Título').fill('Corte de agua el jueves')
  await dialogo.getByLabel('Texto').fill('De 9 a 12 por obras en la calle.')
  await dialogo.getByRole('button', { name: 'Publicar' }).click()
  await expect(page.getByRole('status')).toContainText('Novedad publicada')
  await expect(page.getByRole('heading', { name: /Corte de agua el jueves/ })).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)

  await page.goto(`/documentos?consorcio=${administrador.consorcioId}`)
  await expect(page.getByRole('table')).toContainText('Contrato de limpieza')
  await expect(page.getByRole('table')).toContainText('Reglamento de copropiedad')

  await page.goto(`/pendientes?consorcio=${administrador.consorcioId}`)
  await page.getByRole('button', { name: 'Enviar avisos ahora' }).click()
  await expect(page.getByRole('status')).toContainText('Se despachó')

  await page.context().clearCookies()
  await entrar(page, consorcista.correo)
  await page.goto(`/novedades?consorcio=${administrador.consorcioId}`)
  await expect(page.getByRole('heading', { name: /Corte de agua el jueves/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Publicar novedad' })).toHaveCount(0)

  await page.goto(`/documentos?consorcio=${administrador.consorcioId}`)
  await expect(page.getByRole('table')).toContainText('Reglamento de copropiedad')
  await expect(page.getByText('Contrato de limpieza')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cargar documento' })).toHaveCount(0)
  expect(await desbordaALoAncho(page)).toBe(false)
})
