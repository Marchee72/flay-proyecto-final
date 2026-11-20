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

/**
 * SC-020, RNF-11: las pantallas de `004-servicios` que el consorcista usa desde
 * el telefono —reclamos y reservas— con cero infracciones A y AA. Se amplia por
 * historia a medida que las pantallas existen.
 */

let escenario: Escenario
let administrador: Escenario
let reclamoId: string
let extraccionId: string
let documentoId: string
let consorcioArchivadoId: string

test.beforeAll(async () => {
  escenario = await sembrarEscenario('consorcista')
  administrador = await sembrarEscenario('administrador', 'San Martin 7890')
  // Nivel de administradora y un consorcio archivado, para Archivados y el modal de eliminar (RN-22).
  await prisma.habilitacionAdministradora.create({
    data: {
      usuarioId: administrador.usuarioId,
      administradoraId: administrador.administradoraId,
      vigenciaDesde: new Date('2026-01-01'),
    },
  })
  const consorcioArchivado = await prisma.consorcio.create({
    data: {
      administradoraId: administrador.administradoraId,
      nombre: 'Edificio archivado',
      direccion: 'Rioja 1',
      localidad: 'Rosario',
      cuit: `33-${Date.now() % 100_000_000}-4`,
      archivadoEn: new Date(),
    },
  })
  consorcioArchivadoId = consorcioArchivado.id
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
  await prisma.espacioComun.create({
    data: { consorcioId: escenario.consorcioId, nombre: 'SUM', capacidadMaxima: 40 },
  })
  // Espacios del administrador: uno vacío, uno con historia y uno archivado (RN-22).
  const unidadAdmin = await sembrarUnidadPropia(administrador)
  const [, conHistoria, archivado] = await Promise.all(
    ['Terraza', 'Quincho', 'Parrilla vieja'].map((nombre) =>
      prisma.espacioComun.create({
        data: {
          consorcioId: administrador.consorcioId,
          nombre,
          archivadoEn: nombre === 'Parrilla vieja' ? new Date() : null,
        },
      }),
    ),
  )
  for (const espacioId of [conHistoria.id, archivado.id])
    await prisma.reserva.create({
      data: {
        consorcioId: administrador.consorcioId,
        espacioId,
        unidadId: unidadAdmin,
        solicitadaPor: administrador.usuarioId,
        desde: new Date('2026-03-01T15:00:00Z'),
        hasta: new Date('2026-03-01T18:00:00Z'),
        estado: 'confirmada',
      },
    })
  const extraccion = await prisma.extraccionComprobante.create({
    data: {
      consorcioId: administrador.consorcioId,
      claveObjeto: `extracciones/${administrador.consorcioId}/a11y/factura.pdf`,
      tipoContenido: 'application/pdf',
      cargadoPor: administrador.usuarioId,
      estado: 'propuesta',
      proveedorDetectado: 'Ascensores del Litoral',
      importeDetectado: '15400.00',
      confianza: '0.600',
      procesadoEn: new Date(),
    },
  })
  extraccionId = extraccion.id
  // Lo que deja `sugerir_configuracion` sobre el reglamento de prueba: dos
  // pendientes y una ya revisada, para ver tarjetas e historia (RF-19).
  const documento = await prisma.documentoConsorcio.create({
    data: {
      consorcioId: administrador.consorcioId,
      tipo: 'reglamento_interno',
      titulo: 'Reglamento interno',
      claveAlmacenamiento: `documentos/${administrador.consorcioId}/a11y/reglamento.pdf`,
      tipoContenido: 'application/pdf',
      visibleConsorcistas: true,
      cargadoPor: administrador.usuarioId,
      estadoIndexacion: 'indexado',
    },
  })
  documentoId = documento.id
  // Un documento archivado, para la sección Eliminados (RN-22).
  await prisma.documentoConsorcio.create({
    data: {
      consorcioId: administrador.consorcioId,
      tipo: 'otro',
      titulo: 'Póliza archivada',
      claveAlmacenamiento: `documentos/${administrador.consorcioId}/a11y/poliza.pdf`,
      tipoContenido: 'application/pdf',
      visibleConsorcistas: true,
      cargadoPor: administrador.usuarioId,
      estadoIndexacion: 'indexado',
      archivadoEn: new Date(),
    },
  })
  await prisma.sugerenciaConfiguracion.createMany({
    data: [
      {
        consorcioId: administrador.consorcioId,
        documentoId,
        tipo: 'espacio_nuevo',
        cita: 'El SUM se usa de 10 a 23 horas y se reserva con 48 horas de anticipación.',
        datos: {
          nombre: 'SUM',
          horario: { apertura: '10:00', cierre: '23:00' },
          anticipacionMinimaHoras: 48,
        },
      },
      {
        consorcioId: administrador.consorcioId,
        documentoId,
        tipo: 'vencimientos',
        cita: 'La mora devenga un interés punitorio del 3 % mensual.',
        datos: { tasaMoraMensual: '3.0000' },
      },
      {
        consorcioId: administrador.consorcioId,
        documentoId,
        tipo: 'instrucciones_pago',
        cita: 'Las expensas se pagan por transferencia.',
        datos: { texto: 'Transferencia a la cuenta del consorcio.' },
        estado: 'descartada',
        resueltaPor: administrador.usuarioId,
        resueltaEn: new Date(),
      },
    ],
  })
})

test.afterAll(async () => {
  await prisma.consorcio.deleteMany({ where: { id: consorcioArchivadoId } })
  await prisma.habilitacionAdministradora.deleteMany({
    where: { administradoraId: administrador.administradoraId },
  })
  await limpiarServicios(escenario)
  await limpiarServicios(administrador)
  await limpiarEscenario(escenario)
  await limpiarEscenario(administrador)
  await prisma.$disconnect()
})

const PANTALLAS = [
  {
    nombre: 'bandeja de reclamos',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/reclamos`,
  },
  {
    nombre: 'detalle del reclamo',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/reclamos/${reclamoId}`,
  },
  { nombre: 'reservas', ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/reservas` },
  { nombre: 'novedades', ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/novedades` },
  { nombre: 'documentación', ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/documentos` },
  {
    nombre: 'consulta documental',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/documentos/consultar`,
  },
]

const DEL_ADMINISTRADOR = [
  {
    nombre: 'historial de reservas',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/reservas/historial`,
  },
  {
    nombre: 'panel de indicadores',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/indicadores`,
  },
  {
    nombre: 'I-1 morosidad',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/indicadores/morosidad`,
  },
  {
    nombre: 'I-2 gasto por rubro',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/indicadores/gastos`,
  },
  { nombre: 'espacios comunes', ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/espacios` },
  { nombre: 'avisos pendientes', ruta: () => `/bandeja` },
  {
    nombre: 'carga asistida',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/gastos/asistida`,
  },
  {
    nombre: 'documento con aviso de sugerencias',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/documentos/${documentoId}`,
  },
  {
    nombre: 'sugerencias de configuración',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/documentos/sugerencias`,
  },
  {
    nombre: 'revisión del comprobante',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/gastos/asistida/${extraccionId}`,
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

const TAGS_AXE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const sinInfracciones = async (page: Page) => {
  // El dialogo entra con una animacion de 200 ms (`modal-entrar`): axe a mitad de camino
  // mide un contraste mezclado con el fondo. Se espera a que todas terminen.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS_AXE).analyze()
  const resumen = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`)
  expect(resumen, resumen.join(', ')).toEqual([])
}

test('espacios: sección Eliminados desplegada sin infracciones A/AA', async ({ page }) => {
  await entrar(page, administrador.correo)
  await page.goto(`/consorcios/${administrador.consorcioId}/espacios`)
  await page.getByText('Eliminados (1)').click()
  await expect(page.getByRole('button', { name: 'Restaurar' })).toBeVisible()
  await sinInfracciones(page)
})

for (const [espacio, boton] of [
  ['Terraza', 'Eliminar'],
  ['Quincho', 'Archivar'],
] as const)
  test(`espacios: modal ${boton} abierto sin infracciones A/AA`, async ({ page }) => {
    await entrar(page, administrador.correo)
    await page.goto(`/consorcios/${administrador.consorcioId}/espacios`)
    const tarjeta = page.getByRole('article', { name: espacio })
    await tarjeta.getByRole('button', { name: `Más acciones de ${espacio}` }).click()
    await tarjeta.getByRole('button', { name: boton, exact: true }).click()
    await expect(
      page.getByRole('dialog').getByRole('button', { name: boton, exact: true }),
    ).toBeVisible()
    await sinInfracciones(page)
  })

test('documentos: sección Eliminados desplegada sin infracciones A/AA', async ({ page }) => {
  await entrar(page, administrador.correo)
  await page.goto(`/consorcios/${administrador.consorcioId}/documentos`)
  await page.getByText('Eliminados (1)').click()
  await expect(page.getByRole('button', { name: 'Restaurar' })).toBeVisible()
  await sinInfracciones(page)
})

test('documentos: modal Archivar abierto sin infracciones A/AA', async ({ page }) => {
  await entrar(page, administrador.correo)
  await page.goto(`/consorcios/${administrador.consorcioId}/documentos`)
  await page.getByRole('button', { name: 'Eliminar «Reglamento interno»' }).click()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Archivar', exact: true }),
  ).toBeVisible()
  await sinInfracciones(page)
})

test('consorcios: sección Archivados desplegada sin infracciones A/AA', async ({ page }) => {
  await entrar(page, administrador.correo)
  await page.goto('/consorcios')
  await page.locator('summary', { hasText: 'Archivados' }).click()
  await expect(page.getByRole('button', { name: 'Restaurar' })).toBeVisible()
  await sinInfracciones(page)
})

test('consorcio archivado: aviso de solo lectura sin infracciones A/AA', async ({ page }) => {
  await entrar(page, administrador.correo)
  await page.goto(`/consorcios/${consorcioArchivadoId}`)
  await expect(page.getByText('Este consorcio está archivado desde el')).toBeVisible()
  await sinInfracciones(page)
})

test('consorcios: modal Archivar consorcio abierto sin infracciones A/AA', async ({ page }) => {
  await entrar(page, administrador.correo)
  await page.goto('/consorcios')
  await page.getByRole('button', { name: 'Más acciones de San Martin 7890' }).click()
  await page.getByRole('button', { name: /^(Archivar|Eliminar)$/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await sinInfracciones(page)
})
