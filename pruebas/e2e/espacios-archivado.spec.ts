import { expect, test } from '@playwright/test'

import {
  desbordaALoAncho,
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  sembrarUnidadPropia,
  sembrarUsuarioEn,
  type Escenario,
} from './sesion'

/** Eliminar un espacio: sin reservas se borra, con reservas se archiva y se restaura (`RF-15`, `RN-22`). */

let admin: Escenario
let consorcista: { usuarioId: string; personaId: string; correo: string }

test.beforeAll(async () => {
  admin = await sembrarEscenario('administrador', 'Espacios 100')
  const unidadId = await sembrarUnidadPropia(admin)
  consorcista = await sembrarUsuarioEn(admin, 'consorcista')
  await prisma.espacioComun.create({
    data: { consorcioId: admin.consorcioId, nombre: 'Terraza vacía' },
  })
  const conHistoria = await prisma.espacioComun.create({
    data: { consorcioId: admin.consorcioId, nombre: 'Quincho usado' },
  })
  await prisma.reserva.create({
    data: {
      consorcioId: admin.consorcioId,
      espacioId: conHistoria.id,
      unidadId,
      solicitadaPor: admin.usuarioId,
      desde: new Date('2026-03-01T15:00:00Z'),
      hasta: new Date('2026-03-01T18:00:00Z'),
      estado: 'confirmada',
    },
  })
})

test.afterAll(async () => {
  await limpiarServicios(admin, [consorcista])
  await limpiarEscenario(admin)
  await prisma.$disconnect()
})

test('borrar el vacío, archivar el que tiene historia y restaurarlo; el consorcista no ve Eliminados', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'telefono', 'teléfono 390×844; una sola vez')
  await entrar(page, admin.correo)
  await page.goto(`/consorcios/${admin.consorcioId}/espacios`)

  // Sin reservas: borrado definitivo.
  const tarjetaVacia = page.getByRole('article', { name: 'Terraza vacía' })
  await tarjetaVacia.getByRole('button', { name: 'Más acciones de Terraza vacía' }).click()
  await tarjetaVacia.getByRole('button', { name: 'Eliminar', exact: true }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toContainText('se va a borrar definitivamente')
  await dialogo.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Espacio eliminado definitivamente.' }),
  ).toBeVisible()
  await expect(page.getByRole('article', { name: 'Terraza vacía' })).toHaveCount(0)
  await expect(page.getByText('Eliminados (', { exact: false })).toHaveCount(0)

  // Con reservas: se archiva.
  const tarjetaUsada = page.getByRole('article', { name: 'Quincho usado' })
  await tarjetaUsada.getByRole('button', { name: 'Más acciones de Quincho usado' }).click()
  await tarjetaUsada.getByRole('button', { name: 'Archivar', exact: true }).click()
  await expect(dialogo).toContainText('Tiene 1 reservas en su historial: se va a archivar')
  await dialogo.getByRole('button', { name: 'Archivar', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Espacio archivado. Lo encontrás en Eliminados.' }),
  ).toBeVisible()
  await expect(page.getByRole('article', { name: 'Quincho usado' })).toHaveCount(0)
  await page.getByText('Eliminados (1)').click()
  await expect(page.getByText('Quincho usado')).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)

  // Restaurar lo devuelve a la lista.
  await page.getByRole('button', { name: 'Restaurar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Espacio restaurado.' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Quincho usado' })).toBeVisible()
  await expect(page.getByText('Eliminados (', { exact: false })).toHaveCount(0)

  // El consorcista no ve la sección aunque haya algo archivado.
  await prisma.espacioComun.updateMany({
    where: { consorcioId: admin.consorcioId, nombre: 'Quincho usado' },
    data: { archivadoEn: new Date() },
  })
  await page.context().clearCookies()
  await entrar(page, consorcista.correo)
  await page.goto(`/consorcios/${admin.consorcioId}/espacios`)
  await expect(page.getByRole('heading', { name: 'Espacios comunes', level: 1 })).toBeVisible()
  await expect(page.getByText('Eliminados (', { exact: false })).toHaveCount(0)
})
