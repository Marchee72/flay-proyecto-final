import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

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
 * SC-020, RNF-11: las pantallas de `004-servicios` que el consorcista usa desde
 * el telefono —reclamos y reservas— con cero infracciones A y AA. Se amplia por
 * historia a medida que las pantallas existen.
 */

let escenario: Escenario
let administrador: Escenario
let reclamoId: string

test.beforeAll(async () => {
  escenario = await sembrarEscenario('consorcista')
  administrador = await sembrarEscenario('administrador', 'San Martin 7890')
  const unidadId = await sembrarUnidadPropia(escenario)
  const reclamo = await prisma.reclamo.create({
    data: {
      consorcioId: escenario.consorcioId,
      unidadId,
      creadoPor: escenario.usuarioId,
      titulo: 'Filtracion en la cocina',
      descripcion: 'Gotea agua del techo desde el domingo.',
      urgencia: 'alta',
    },
  })
  reclamoId = reclamo.id
  await prisma.reclamoHistorial.create({
    data: { reclamoId, estadoNuevo: 'abierto', usuarioId: escenario.usuarioId },
  })
})

test.afterAll(async () => {
  await limpiarServicios(escenario)
  await limpiarEscenario(escenario)
  await limpiarEscenario(administrador)
  await prisma.$disconnect()
})

const PANTALLAS = [
  { nombre: 'bandeja de reclamos', ruta: (e: Escenario) => `/reclamos?consorcio=${e.consorcioId}` },
  {
    nombre: 'detalle del reclamo',
    ruta: (e: Escenario) => `/reclamos/${reclamoId}?consorcio=${e.consorcioId}`,
  },
]

const DEL_ADMINISTRADOR = [
  {
    nombre: 'panel de indicadores',
    ruta: (e: Escenario) => `/indicadores?consorcio=${e.consorcioId}`,
  },
  {
    nombre: 'I-1 morosidad',
    ruta: (e: Escenario) => `/indicadores/morosidad?consorcio=${e.consorcioId}`,
  },
  {
    nombre: 'I-2 gasto por rubro',
    ruta: (e: Escenario) => `/indicadores/gastos?consorcio=${e.consorcioId}`,
  },
]

for (const pantalla of PANTALLAS) {
  test(`${pantalla.nombre} sin infracciones A/AA`, async ({ page }) => {
    await entrar(page, escenario.correo)
    await page.goto(pantalla.ruta(escenario))

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const resumen = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
    expect(resumen, resumen.join('\n')).toEqual([])
  })
}

for (const pantalla of DEL_ADMINISTRADOR) {
  test(`${pantalla.nombre} sin infracciones A/AA`, async ({ page }) => {
    await entrar(page, administrador.correo)
    await page.goto(pantalla.ruta(administrador))

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const resumen = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
    expect(resumen, resumen.join('\n')).toEqual([])
  })
}
