import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import {
  desbordaALoAncho,
  entrar,
  limpiarEscenario,
  prisma,
  sembrarEscenario,
  type Escenario,
} from './sesion'

/**
 * La navegacion con el consorcio como raiz (diseno 2026-09-13 § 7): con uno
 * solo se entra derecho al resumen; con dos, a la lista; el atajo de la barra
 * conserva la seccion; las direcciones viejas redirigen; el lateral agrupado
 * pasa axe y no desborda en un telefono.
 */

let unico: Escenario
let conDos: Escenario
let segundoConsorcioId: string

test.beforeAll(async () => {
  unico = await sembrarEscenario('administrador', 'Mitre 456')

  conDos = await sembrarEscenario('administrador', 'San Martin 7890')
  const segundo = await prisma.consorcio.create({
    data: {
      administradoraId: conDos.administradoraId,
      nombre: 'Corrientes 1234',
      direccion: 'Corrientes 1234',
      localidad: 'Rosario',
      cuit: `33-${Date.now().toString().slice(-8)}-1`,
    },
  })
  segundoConsorcioId = segundo.id
  await prisma.habilitacion.create({
    data: {
      usuarioId: conDos.usuarioId,
      consorcioId: segundoConsorcioId,
      rol: 'administrador',
      vigenciaDesde: new Date('2026-01-01'),
    },
  })
})

test.afterAll(async () => {
  await prisma.habilitacion.deleteMany({ where: { consorcioId: segundoConsorcioId } })
  await prisma.consorcio.deleteMany({ where: { id: segundoConsorcioId } })
  await limpiarEscenario(unico)
  await limpiarEscenario(conDos)
  await prisma.$disconnect()
})

test('con un solo consorcio se entra derecho al resumen', async ({ page }) => {
  await entrar(page, unico.correo)
  await expect(page).toHaveURL(`/consorcios/${unico.consorcioId}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Resumen')
  await expect(page.locator('.kpi__rotulo').first()).toHaveText('Período abierto')
  // El lateral agrupado, con sus cuatro bloques; en telefono vive en el menu.
  if (test.info().project.name === 'telefono') {
    await expect(page.getByRole('navigation', { name: 'Secciones principales' })).toBeVisible()
    await page.getByRole('group').locator('summary').click()
  }
  const lateral = page.getByRole('navigation', {
    name: test.info().project.name === 'telefono' ? 'Todas las secciones' : 'Secciones',
  })
  await expect(lateral.getByRole('heading', { level: 2 })).toHaveText([
    'Dinero',
    'Convivencia',
    'Análisis',
    'Administración',
  ])
  expect(await desbordaALoAncho(page)).toBe(false)
})

test('con dos consorcios se entra a la lista, y el atajo conserva la seccion', async ({ page }) => {
  await entrar(page, conDos.correo)
  await expect(page).toHaveURL(/\/consorcios$/)
  await expect(page.getByRole('article', { name: 'San Martin 7890' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Corrientes 1234' })).toBeVisible()

  await page.goto(`/consorcios/${conDos.consorcioId}/gastos`)
  await page.getByLabel('Cambiar de consorcio').selectOption(segundoConsorcioId)
  await expect(page).toHaveURL(`/consorcios/${segundoConsorcioId}/gastos`)
})

test('una direccion vieja va a la misma seccion del consorcio pedido', async ({ page }) => {
  await entrar(page, conDos.correo)
  await page.goto(`/periodos?consorcio=${segundoConsorcioId}`)
  await expect(page).toHaveURL(`/consorcios/${segundoConsorcioId}/periodos`)
  await page.goto('/pendientes')
  await expect(page).toHaveURL('/bandeja')
})

test('un consorcio fuera del alcance no dibuja nada', async ({ page }) => {
  await entrar(page, unico.correo)
  await page.goto(`/consorcios/${segundoConsorcioId}/gastos`)
  await expect(page.getByRole('status')).toContainText('no está al alcance')
  await expect(page.locator('.lateral')).toHaveCount(0)
})

test('resumen, lista y bandeja sin infracciones A/AA y sin desborde', async ({ page }) => {
  await entrar(page, conDos.correo)
  for (const ruta of ['/consorcios', `/consorcios/${conDos.consorcioId}`, '/bandeja']) {
    await page.goto(ruta)
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const resumen = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    expect(resumen, `${ruta}\n${resumen.join('\n')}`).toEqual([])
    expect(await desbordaALoAncho(page), ruta).toBe(false)
  }
})
