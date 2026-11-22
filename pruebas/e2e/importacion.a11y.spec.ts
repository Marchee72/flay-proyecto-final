import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import {
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  sembrarUnidadPropia,
  type Escenario,
} from './sesion'

let vacio: Escenario
let conPadron: Escenario

test.beforeAll(async () => {
  vacio = await sembrarEscenario('administrador', 'Importar vacío')
  conPadron = await sembrarEscenario('administrador', 'Importar con padrón')
  await sembrarUnidadPropia(conPadron)
})

test.afterAll(async () => {
  for (const escenario of [vacio, conPadron]) {
    await limpiarServicios(escenario)
    await limpiarEscenario(escenario)
  }
  await prisma.$disconnect()
})

async function esperarSinInfracciones(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const resumen = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
  expect(resumen, resumen.join('\n')).toEqual([])
}

test('importar padrón, con la lista de errores a la vista, sin infracciones A/AA', async ({
  page,
}) => {
  await entrar(page, vacio.correo)
  await page.goto(`/consorcios/${vacio.consorcioId}/unidades`)
  await page.getByLabel('Archivo del padrón').setInputFiles({
    name: 'padron.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Designación;Coeficiente\n1A;abc\n1B;50\n'),
  })
  await page.getByRole('button', { name: 'Revisar' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Fila 2:' })).toBeVisible()
  await esperarSinInfracciones(page)
})

test('importar ocupantes, con la vista previa, sin infracciones A/AA', async ({ page }) => {
  await entrar(page, conPadron.correo)
  await page.goto(`/consorcios/${conPadron.consorcioId}/usuarios`)
  await page.getByRole('button', { name: 'Importar ocupantes' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Importar ocupantes' })
  await dialogo.getByLabel('Archivo de ocupantes').setInputFiles({
    name: 'ocupantes.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Unidad;Vínculo;Nombre;Apellido\n3C;propietario;Eva;Ruiz\n'),
  })
  await dialogo.getByRole('button', { name: 'Revisar' }).click()
  await expect(dialogo.getByRole('button', { name: 'Confirmar' })).toBeVisible()
  await esperarSinInfracciones(page)
})
