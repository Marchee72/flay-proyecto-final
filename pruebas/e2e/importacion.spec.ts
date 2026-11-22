import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  sembrarUnidadPropia,
  type Escenario,
} from './sesion'

/**
 * Importar el padrón y los ocupantes desde una planilla (RF-02, RF-03): bajar
 * la plantilla, completarla, revisar y confirmar. Cada prueba siembra su propio
 * consorcio: el padrón se importa una sola vez y dos pruebas no lo comparten.
 */

const unico = () => crypto.randomUUID().slice(0, 8)
const escenarios: Escenario[] = []
const archivados: string[] = []
const correos: string[] = []

async function nuevo(): Promise<Escenario> {
  const escenario = await sembrarEscenario('administrador', `Importar ${unico()}`)
  escenarios.push(escenario)
  return escenario
}

async function archivar(escenario: Escenario) {
  archivados.push(escenario.consorcioId)
  await prisma.$executeRaw`
    UPDATE "Consorcio" SET archivado_en = now() WHERE id = ${escenario.consorcioId}::uuid`
}

test.afterAll(async () => {
  for (const id of archivados)
    await prisma.$executeRaw`UPDATE "Consorcio" SET archivado_en = NULL WHERE id = ${id}::uuid`
  // Al revés: un escenario puede tener habilitado al usuario de uno anterior.
  for (const escenario of escenarios.reverse()) {
    await limpiarServicios(escenario)
    await limpiarEscenario(escenario)
  }
  if (correos.length > 0) await prisma.persona.deleteMany({ where: { correo: { in: correos } } })
  await prisma.$disconnect()
})

/**
 * Completa la primera hoja por título de columna y borra la fila de ejemplo.
 * En un proceso aparte: ExcelJS no carga bajo el cargador de Playwright (una
 * dependencia suya se resuelve como `require` de ESM en Node 22).
 */
const COMPLETAR = `
const ExcelJS = require('exceljs')
const [, entrada, salida, filas] = process.argv
const libro = new ExcelJS.Workbook()
libro.xlsx.readFile(entrada).then(async () => {
  const hoja = libro.worksheets[0]
  const titulos = hoja.getRow(1).values.map((v) => String(v ?? ''))
  hoja.spliceRows(2, 1)
  JSON.parse(filas).forEach((fila, i) => {
    for (const [titulo, valor] of Object.entries(fila)) {
      const columna = titulos.indexOf(titulo)
      if (columna < 1) throw new Error('La plantilla no tiene la columna ' + titulo)
      hoja.getCell(i + 2, columna).value = valor
    }
  })
  await libro.xlsx.writeFile(salida)
})
`

/** Baja la plantilla con el enlace de la pantalla, como lo haría una persona, y la completa. */
async function plantillaCompleta(
  page: Page,
  ambito: Page | Locator,
  filas: Record<string, string>[],
): Promise<Buffer> {
  const descarga = page.waitForEvent('download')
  await ambito.getByRole('link', { name: 'Bajar plantilla' }).click()
  const entrada = await (await descarga).path()
  const salida = join(tmpdir(), `plantilla-${unico()}.xlsx`)
  execFileSync(process.execPath, ['-e', COMPLETAR, entrada, salida, JSON.stringify(filas)])
  const contenido = readFileSync(salida)
  rmSync(salida)
  return contenido
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

test('bajar la plantilla de padrón, completarla, revisar y confirmar sin volver a elegir el archivo', async ({
  page,
}) => {
  const escenario = await nuevo()
  const correo = `imp-${unico()}@ejemplo.test`
  correos.push(correo)

  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}/unidades`)

  const contenido = await plantillaCompleta(page, page, [
    {
      Designación: '1A',
      Coeficiente: '33,33333333',
      Nombre: 'Ana',
      Apellido: 'Pérez',
      Correo: correo,
    },
    { Designación: '1B', Coeficiente: '33,33333333' },
    { Designación: '1C', Coeficiente: '33,33333334' },
  ])

  await page
    .getByLabel('Archivo del padrón')
    .setInputFiles({ name: 'padron.xlsx', mimeType: XLSX, buffer: contenido })
  await page.getByRole('button', { name: 'Revisar' }).click()

  await expect(page.getByText(/3 unidades · suma 100,00000000 %/)).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Ana Pérez' })).toContainText('1A')

  // El campo conserva el archivo: se confirma sin volver a elegirlo.
  await page.getByRole('button', { name: 'Confirmar' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Padrón importado.' })).toBeVisible()
  for (const designacion of ['1A', '1B', '1C'])
    await expect(page.getByRole('cell', { name: designacion, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Revisar' })).toHaveCount(0)
})

test('archivo con errores muestra «Fila N: …» y no carga', async ({ page }) => {
  const escenario = await nuevo()

  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}/unidades`)

  // 60 coeficientes que no son número: más que el tope de errores a la vista.
  const contenido = await plantillaCompleta(
    page,
    page,
    Array.from({ length: 60 }, (_, i) => ({ Designación: `U${i + 1}`, Coeficiente: 'abc' })),
  )

  await page
    .getByLabel('Archivo del padrón')
    .setInputFiles({ name: 'padron.xlsx', mimeType: XLSX, buffer: contenido })
  await page.getByRole('button', { name: 'Revisar' }).click()

  const alerta = page.getByRole('alert').filter({ hasText: 'no se cargó nada' })
  await expect(alerta).toBeVisible()
  await expect(alerta.getByRole('listitem').first()).toContainText(/^Fila 2: /)
  await expect(alerta.getByRole('listitem')).toHaveCount(50)
  await expect(alerta).toContainText(/y \d+ más/)
  await expect(page.getByRole('button', { name: 'Confirmar' })).toHaveCount(0)
  expect(await prisma.unidad.count({ where: { consorcioId: escenario.consorcioId } })).toBe(0)
})

test('importar ocupantes desde Usuarios y verlos en Unidades', async ({ page }) => {
  // ponytail: «Registrados sin acceso» llega con la tarea 8; mientras, se ve en la columna Inquilino.
  const escenario = await nuevo()
  await sembrarUnidadPropia(escenario)
  const apellido = `Paz ${unico()}`
  const correo = `imp-${unico()}@ejemplo.test`
  correos.push(correo)

  await entrar(page, escenario.correo)
  await page.goto(`/consorcios/${escenario.consorcioId}/usuarios`)
  await page.getByRole('button', { name: 'Importar ocupantes' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Importar ocupantes' })

  const contenido = await plantillaCompleta(page, dialogo, [
    { Unidad: '3C', Vínculo: 'inquilino', Nombre: 'Luis', Apellido: apellido, Correo: correo },
  ])

  await dialogo
    .getByLabel('Archivo de ocupantes')
    .setInputFiles({ name: 'ocupantes.xlsx', mimeType: XLSX, buffer: contenido })
  await dialogo.getByRole('button', { name: 'Revisar' }).click()
  await expect(dialogo.getByText(/0 propietarios, 1 inquilino/)).toBeVisible()
  await dialogo.getByRole('button', { name: 'Confirmar' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Ocupantes importados.' })).toBeVisible()
  // Importar registra, no invita: no aparece entre quienes tienen acceso.
  await expect(page.getByRole('row').filter({ hasText: correo })).toHaveCount(0)

  await page.goto(`/consorcios/${escenario.consorcioId}/unidades`)
  await expect(page.getByRole('row').filter({ hasText: '3C' })).toContainText(`Luis ${apellido}`)
})

test('consorcio archivado no muestra los botones de importar', async ({ page }) => {
  const vacio = await nuevo()
  const conPadron = await nuevo()
  await sembrarUnidadPropia(conPadron)
  await prisma.habilitacion.create({
    data: {
      usuarioId: vacio.usuarioId,
      consorcioId: conPadron.consorcioId,
      rol: 'administrador',
      vigenciaDesde: new Date('2026-01-01'),
    },
  })
  await archivar(vacio)
  await archivar(conPadron)

  await entrar(page, vacio.correo)
  await page.goto(`/consorcios/${vacio.consorcioId}/unidades`)
  await expect(page.getByRole('heading', { name: 'Unidades', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Bajar plantilla' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Revisar' })).toHaveCount(0)

  await page.goto(`/consorcios/${conPadron.consorcioId}/usuarios`)
  await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Importar ocupantes' })).toHaveCount(0)
})
