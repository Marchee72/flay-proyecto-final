import { expect, test } from '@playwright/test'

import {
  entrar,
  limpiarEscenario,
  limpiarExpensa,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  sembrarExpensa,
  sembrarUsuarioEn,
  type Escenario,
} from './sesion'

/** Eliminar un consorcio: con historia se archiva en solo lectura y se restaura (`RN-22`, CCyC 2067). */

let escenario: Escenario
let administrador: { usuarioId: string; personaId: string; correo: string }
let bloqueado: Escenario

async function darNivelDeAdministradora(e: Escenario, usuarioId: string) {
  await prisma.habilitacionAdministradora.create({
    data: {
      usuarioId,
      administradoraId: e.administradoraId,
      vigenciaDesde: new Date('2026-01-01'),
    },
  })
}

test.beforeAll(async () => {
  escenario = await sembrarEscenario('consorcista', 'Archivable 100')
  await sembrarExpensa(escenario)
  administrador = await sembrarUsuarioEn(escenario, 'administrador')
  await darNivelDeAdministradora(escenario, administrador.usuarioId)

  // Con una asamblea convocada no se puede archivar.
  bloqueado = await sembrarEscenario('administrador', 'Con asamblea 200')
  await darNivelDeAdministradora(bloqueado, bloqueado.usuarioId)
  const asamblea = await prisma.asamblea.create({
    data: {
      consorcioId: bloqueado.consorcioId,
      tipo: 'ordinaria',
      titulo: 'Asamblea convocada',
      fechaHora: new Date(Date.now() + 30 * 86_400_000),
      lugar: 'SUM',
      organizadorId: bloqueado.usuarioId,
    },
  })
  await prisma.puntoAsamblea.create({
    data: {
      consorcioId: bloqueado.consorcioId,
      asambleaId: asamblea.id,
      orden: 1,
      titulo: 'Pintura del frente',
      modalidad: 'binaria',
      mayoria: 'absoluta',
    },
  })
  await prisma.asamblea.update({ where: { id: asamblea.id }, data: { estado: 'convocada' } })
})

test.afterAll(async () => {
  await prisma.consorcio.updateMany({
    where: { id: escenario.consorcioId },
    data: { archivadoEn: null },
  })
  await prisma.asamblea.deleteMany({ where: { consorcioId: bloqueado.consorcioId } })
  await prisma.habilitacionAdministradora.deleteMany({
    where: { administradoraId: { in: [escenario.administradoraId, bloqueado.administradoraId] } },
  })
  await limpiarServicios(bloqueado)
  await limpiarEscenario(bloqueado)
  await limpiarExpensa(escenario)
  await limpiarServicios(escenario, [administrador])
  await limpiarEscenario(escenario)
  await prisma.$disconnect()
})

test('archivar desde la tarjeta, entrar en solo lectura, ver el consorcista sus expensas y restaurar', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'telefono', 'teléfono 390×844; una sola vez')
  await entrar(page, administrador.correo)
  // Antes de archivar, los controles existen: así «no hay altas» después no es vacío.
  await page.goto(`/consorcios/${escenario.consorcioId}/gastos`)
  await expect(page.getByRole('button', { name: 'Nuevo gasto' })).toBeVisible()
  await page.goto(`/consorcios/${escenario.consorcioId}/espacios`)
  await expect(page.getByRole('button', { name: 'Nuevo espacio' })).toBeVisible()
  await page.goto(`/consorcios/${escenario.consorcioId}/periodos`)
  await expect(page.getByRole('columnheader', { name: 'Acciones' })).toBeVisible()
  await page.goto('/consorcios')

  await page.getByRole('button', { name: 'Más acciones de Archivable 100' }).click()
  await page.getByRole('button', { name: 'Archivar', exact: true }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toContainText('Tiene historia: se va a archivar')
  await dialogo.getByRole('button', { name: 'Archivar', exact: true }).click()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Consorcio archivado. Lo encontrás en Archivados.' }),
  ).toBeVisible()

  // La lista lo trae en Archivados y no en la grilla.
  await page.goto('/consorcios')
  await expect(page.getByRole('article', { name: 'Archivable 100' })).toHaveCount(0)
  await expect(page.getByText('Todavía no hay ningún consorcio')).toHaveCount(0)
  await page.getByText('Archivados (1)').click()
  await expect(page.getByText('Archivable 100')).toBeVisible()
  await page.getByRole('link', { name: 'Abrir' }).click()
  await expect(
    page.locator('.aviso').filter({ hasText: 'Este consorcio está archivado desde el' }),
  ).toContainText('Podés consultar su historia, pero no operar.')

  // Sin altas en Gastos ni Espacios.
  await page.goto(`/consorcios/${escenario.consorcioId}/gastos`)
  await expect(page.getByRole('heading', { name: 'Gastos', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuevo gasto' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Carga asistida' })).toHaveCount(0)
  await page.goto(`/consorcios/${escenario.consorcioId}/periodos`)
  await expect(page.getByRole('heading', { name: 'Períodos', level: 1 })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Acciones' })).toHaveCount(0)
  await page.goto(`/consorcios/${escenario.consorcioId}/espacios`)
  await expect(page.getByRole('heading', { name: 'Espacios comunes', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuevo espacio' })).toHaveCount(0)

  // El consorcista sigue viendo sus expensas.
  await page.context().clearCookies()
  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}/expensas`)
  await expect(page.getByRole('heading', { name: 'Expensas', level: 1 })).toBeVisible()
  await expect(page.getByText('3B').first()).toBeVisible()

  // Restaurar lo devuelve.
  await page.context().clearCookies()
  await entrar(page, administrador.correo)
  await page.goto('/consorcios')
  await page.getByText('Archivados (1)').click()
  await page.getByRole('button', { name: 'Restaurar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Consorcio restaurado.' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Archivable 100' })).toBeVisible()
  await expect(page.getByText('Archivados (', { exact: false })).toHaveCount(0)
})

test('con una asamblea convocada el modal muestra el bloqueo y no deja archivar', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'telefono', 'teléfono 390×844; una sola vez')
  await entrar(page, bloqueado.correo)
  await page.goto('/consorcios')
  await page.getByRole('button', { name: 'Más acciones de Con asamblea 200' }).click()
  await page.getByRole('button', { name: 'Archivar', exact: true }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toContainText('Hay una asamblea convocada o en curso')
  await expect(dialogo.getByRole('button', { name: 'Archivar', exact: true })).toBeDisabled()
})
