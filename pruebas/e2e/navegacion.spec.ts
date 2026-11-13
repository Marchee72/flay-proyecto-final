import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import {
  desbordaALoAncho,
  entrar,
  limpiarEscenario,
  prisma,
  sembrarEscenario,
  sembrarUsuarioEn,
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
      // Como en `sesion.ts`: con `Date.now()` los dos proyectos chocaban en el mismo ms.
      cuit: `33-${crypto.randomUUID().slice(0, 8)}-1`,
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
  // El logo va adonde ya lleva `/`: un clic no navega a la misma pantalla.
  await expect(page.getByRole('link', { name: 'FLAY' })).toHaveAttribute(
    'href',
    `/consorcios/${unico.consorcioId}`,
  )
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

test('en el teléfono, elegir una sección del menú lo cierra (RNF-01)', async ({ page }) => {
  test.skip(test.info().project.name !== 'telefono', 'el menú «Más» solo existe en el teléfono')
  await entrar(page, unico.correo)
  await page.getByRole('group').locator('summary').click()
  await page
    .getByRole('navigation', { name: 'Todas las secciones' })
    .getByRole('link', { name: 'Gastos' })
    .click()
  await expect(page).toHaveURL(`/consorcios/${unico.consorcioId}/gastos`)
  await expect(page.locator('details.menu')).not.toHaveAttribute('open', '')
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

/** Abre un consorcio y espera a que `RecordarConsorcio` lo haya guardado. */
async function abrirYRecordar(page: Page, consorcioId: string) {
  const recordado = page.waitForResponse((r) => r.url().endsWith('/api/consorcio-activo'))
  await page.goto(`/consorcios/${consorcioId}`)
  expect((await recordado).status()).toBe(204)
}

test('el último consorcio abierto es al que vuelve la portada (FR-002)', async ({ page }) => {
  await entrar(page, conDos.correo)
  await abrirYRecordar(page, segundoConsorcioId)
  await page.goto('/')
  await expect(page).toHaveURL(`/consorcios/${segundoConsorcioId}`)
})

test('precargar un enlace a otro consorcio no lo vuelve el último usado (FR-002)', async ({
  page,
}) => {
  await entrar(page, conDos.correo)
  await abrirYRecordar(page, segundoConsorcioId)
  // La lista dibuja un <Link> por consorcio, y cada uno visible se precarga.
  await page.goto('/consorcios')
  await page.waitForLoadState('networkidle')
  // Y una precarga explicita del otro, por si la de la lista no llego a salir.
  await page.request.get(`/consorcios/${conDos.consorcioId}`, {
    headers: { RSC: '1', 'Next-Router-Prefetch': '1' },
  })
  await page.goto('/')
  await expect(page).toHaveURL(`/consorcios/${segundoConsorcioId}`)
})

test('una direccion vieja va a la misma seccion del consorcio pedido', async ({ page }) => {
  await entrar(page, conDos.correo)
  await page.goto(`/periodos?consorcio=${segundoConsorcioId}`)
  await expect(page).toHaveURL(`/consorcios/${segundoConsorcioId}/periodos`)
  await page.goto('/pendientes')
  await expect(page).toHaveURL('/bandeja')
})

test('filtrar los gastos por periodo no abre el alta; ?abrir=1 si', async ({ page }) => {
  await entrar(page, unico.correo)
  // Es el enlace «Ver gastos» de Expensas: `periodo` es del filtro, no del alta.
  await page.goto(`/consorcios/${unico.consorcioId}/gastos?periodo=${unico.periodoId}`)
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.goto(`/consorcios/${unico.consorcioId}/gastos?abrir=1`)
  await expect(page.getByRole('dialog', { name: 'Nuevo gasto' })).toBeVisible()
})

test('los filtros escritos a mano no rompen la pantalla (RNF-10)', async ({ page }) => {
  await entrar(page, unico.correo)
  await page.goto(`/consorcios/${unico.consorcioId}/gastos?periodo=x&rubro=y`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gastos')
  await page.goto(
    `/consorcios/${unico.consorcioId}/reservas/historial?mes=2026-13&espacio=x&unidad=y`,
  )
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Historial de reservas')
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

test('el superadministrador ve Administradoras en el lateral y un administrador no', async ({
  page,
}) => {
  // En el teléfono el lateral global no se dibuja: los mismos destinos son los íconos de la cabecera.
  const lateral =
    test.info().project.name === 'telefono'
      ? page.locator('.panel__acciones')
      : page.getByRole('navigation', { name: 'Panel' })

  await entrar(page, unico.correo)
  await page.goto('/consorcios')
  await expect(lateral.getByRole('link', { name: 'Consorcios' })).toBeVisible()
  await expect(lateral.getByRole('link', { name: 'Administradoras' })).toHaveCount(0)
  await page.goto('/administradoras')
  await expect(page.locator('.aviso--problema')).toHaveText(
    'Tu rol no permite ver las administradoras.',
  )

  const superAdmin = await sembrarUsuarioEn(unico, 'administrador')
  await prisma.habilitacionPlataforma.create({
    data: { usuarioId: superAdmin.usuarioId, vigenciaDesde: new Date('2026-01-01') },
  })
  try {
    await page.context().clearCookies()
    await entrar(page, superAdmin.correo)
    await page.goto('/consorcios')
    await lateral.getByRole('link', { name: 'Administradoras' }).click()
    await expect(page).toHaveURL('/administradoras')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Administradoras')
  } finally {
    await prisma.habilitacionPlataforma.deleteMany({ where: { usuarioId: superAdmin.usuarioId } })
    await prisma.habilitacion.deleteMany({ where: { usuarioId: superAdmin.usuarioId } })
    await prisma.usuario.deleteMany({ where: { id: superAdmin.usuarioId } })
    await prisma.persona.deleteMany({ where: { id: superAdmin.personaId } })
  }
})
