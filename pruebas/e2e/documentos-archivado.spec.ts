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

/** Eliminar un documento lo archiva; se ve y se restaura desde Eliminados (`RF-19`, `RN-22`). */

let admin: Escenario
let consorcista: { usuarioId: string; personaId: string; correo: string }
let documentoId: string

test.beforeAll(async () => {
  admin = await sembrarEscenario('administrador', 'Documentos 200')
  consorcista = await sembrarUsuarioEn(admin, 'consorcista')
  const documento = await prisma.documentoConsorcio.create({
    data: {
      consorcioId: admin.consorcioId,
      tipo: 'otro',
      titulo: 'Póliza vieja',
      claveAlmacenamiento: `documentos/${admin.consorcioId}/archivado/poliza.pdf`,
      tipoContenido: 'application/pdf',
      visibleConsorcistas: true,
      cargadoPor: admin.usuarioId,
      estadoIndexacion: 'indexado',
    },
  })
  documentoId = documento.id
})

test.afterAll(async () => {
  await limpiarServicios(admin, [consorcista])
  await limpiarEscenario(admin)
  await prisma.$disconnect()
})

test('archivar un documento, abrirlo desde Eliminados y restaurarlo; el consorcista no ve la sección', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'telefono', 'teléfono 390×844; una sola vez')
  await entrar(page, admin.correo)
  await page.goto(`/consorcios/${admin.consorcioId}/documentos`)
  await expect(page.getByText('Eliminados (', { exact: false })).toHaveCount(0)

  await page.getByRole('button', { name: 'Eliminar «Póliza vieja»' }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toContainText('Se va a archivar')
  await dialogo.getByRole('button', { name: 'Archivar', exact: true }).click()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Documento archivado. Lo encontrás en Eliminados.' }),
  ).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)

  await page.getByText('Eliminados (1)').click()
  await expect(page.getByText('Póliza vieja')).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)

  // Se abre archivado, con el aviso y el control de restaurar.
  await page.getByRole('link', { name: 'Abrir' }).click()
  await expect(page.getByRole('heading', { name: 'Póliza vieja' })).toBeVisible()
  await expect(
    page.locator('.aviso').filter({ hasText: 'Este documento está archivado' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Restaurar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Documento restaurado.' })).toBeVisible()
  await expect(page.getByRole('table')).toContainText('Póliza vieja')
  await expect(page.getByText('Eliminados (', { exact: false })).toHaveCount(0)

  // El consorcista no ve la sección aunque haya algo archivado, ni abre el documento.
  await prisma.documentoConsorcio.update({
    where: { id: documentoId },
    data: { archivadoEn: new Date() },
  })
  await page.context().clearCookies()
  await entrar(page, consorcista.correo)
  await page.goto(`/consorcios/${admin.consorcioId}/documentos`)
  await expect(page.getByRole('heading', { name: 'Documentación', level: 1 })).toBeVisible()
  await expect(page.getByText('Eliminados (', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Póliza vieja')).toHaveCount(0)
})
