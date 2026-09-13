import { expect, test } from '@playwright/test'

import { asistenciaDeterminista } from '../../src/infraestructura/asistencia/determinista'
import {
  desbordaALoAncho,
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  type Escenario,
} from './sesion'

/**
 * Los tres servicios asistidos con la implementacion determinista (research
 * R-02), y siempre con la persona en el medio (Principio IV): la propuesta de
 * un comprobante se revisa y **recien al confirmar** nace el gasto (CU-06,
 * SC-017); la pregunta con respaldo cita el documento (CU-10, SC-014) y la que
 * no lo tiene dice que no (SC-015); la sugerencia de triage se aplica a mano
 * (CU-14, FR-027).
 */

let escenario: Escenario
let rubroId: string

test.beforeAll(async () => {
  escenario = await sembrarEscenario('administrador', 'Mitre 456')
  rubroId = (await prisma.gasto.findUniqueOrThrow({ where: { id: escenario.gastoId } })).rubroId

  // El reglamento indexado a mano con los vectores de la determinista: lo que
  // dejaria la cola despues de `indexar_documento`.
  const documento = await prisma.documentoConsorcio.create({
    data: {
      consorcioId: escenario.consorcioId,
      tipo: 'reglamento_copropiedad',
      titulo: 'Reglamento de copropiedad',
      claveAlmacenamiento: `documentos/${escenario.consorcioId}/e2e/reglamento.md`,
      tipoContenido: 'text/markdown',
      visibleConsorcistas: true,
      cargadoPor: escenario.usuarioId,
      estadoIndexacion: 'indexado',
      hashSha256: 'e'.repeat(64),
    },
  })
  const fragmentos = [
    'Artículo 40. El salón de usos múltiples admite hasta cuarenta personas y se reserva con una semana de anticipación.',
    'Artículo 41. Las mascotas circulan por las áreas comunes con correa y bajo responsabilidad de su dueño.',
  ]
  const vectores = await asistenciaDeterminista.vectores.vectorizar(fragmentos, 'documento')
  if (!vectores.disponible) throw new Error(vectores.motivo)
  for (const [i, contenido] of fragmentos.entries()) {
    await prisma.$executeRaw`
      INSERT INTO "FragmentoDocumento" (documento_id, numero_fragmento, pagina, contenido, vector)
      VALUES (${documento.id}::uuid, ${i + 1}, 1, ${contenido},
              ${`[${vectores.valor[i].join(',')}]`}::vector)`
  }
})

test.afterAll(async () => {
  await limpiarServicios(escenario)
  await limpiarEscenario(escenario)
  await prisma.$disconnect()
})

test('la propuesta del comprobante se revisa y el gasto nace al confirmar (SC-017)', async ({
  page,
}) => {
  // Lo que deja la cola despues de `extraccion_comprobante`: una propuesta.
  const extraccion = await prisma.extraccionComprobante.create({
    data: {
      consorcioId: escenario.consorcioId,
      claveObjeto: `extracciones/${escenario.consorcioId}/e2e/factura.pdf`,
      tipoContenido: 'application/pdf',
      cargadoPor: escenario.usuarioId,
      estado: 'propuesta',
      proveedorDetectado: 'Ascensores del Litoral',
      importeDetectado: '15400.00',
      fechaDetectada: new Date('2026-09-03'),
      rubroSugeridoId: rubroId,
      confianza: '0.800',
      procesadoEn: new Date(),
    },
  })
  await entrar(page, escenario.correo)

  await page.goto(`/gastos/asistida?consorcio=${escenario.consorcioId}`)
  await expect(page.getByRole('heading', { name: 'Carga asistida', level: 1 })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Propuesta lista' })).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)

  await page.goto(`/gastos/asistida/${extraccion.id}?consorcio=${escenario.consorcioId}`)
  await expect(page.getByRole('heading', { name: 'Revisar comprobante', level: 1 })).toBeVisible()
  // Cada campo propuesto viene marcado; no hay gasto todavia.
  await expect(page.getByText('Precargado: revisar antes de confirmar').first()).toBeVisible()
  await expect(page.getByLabel('Importe')).toHaveValue('15400.00')
  await expect(page.getByLabel('Proveedor')).toHaveValue(
    (await prisma.proveedor.findFirstOrThrow({ where: { consorcioId: escenario.consorcioId } })).id,
  )
  expect(await prisma.gasto.count({ where: { consorcioId: escenario.consorcioId } })).toBe(1)
  expect(await desbordaALoAncho(page)).toBe(false)

  // La persona corrige el importe y confirma: ahora si existe el gasto, atado
  // a la extraccion y con la correccion registrada.
  await page.getByLabel('Importe').fill('15450.00')
  await page.getByRole('button', { name: 'Registrar gasto' }).click()
  await expect(page).toHaveURL(/\/gastos\/[0-9a-f-]+\?.*nuevo=1/)
  await expect(page.getByRole('status').first()).toContainText('Gasto registrado')

  const revisada = await prisma.extraccionComprobante.findUniqueOrThrow({
    where: { id: extraccion.id },
  })
  expect(revisada.estado).toBe('corregida')
  expect(revisada.camposCorregidos).toEqual(['importe'])
  expect(revisada.gastoId).not.toBeNull()
  const gasto = await prisma.gasto.findUniqueOrThrow({ where: { id: revisada.gastoId! } })
  expect(gasto.importe.toFixed(2)).toBe('15450.00')
})

test('sin asistencia el comprobante queda guardado y el gasto se carga a mano', async ({
  page,
}) => {
  const extraccion = await prisma.extraccionComprobante.create({
    data: {
      consorcioId: escenario.consorcioId,
      claveObjeto: `extracciones/${escenario.consorcioId}/e2e/foto.jpg`,
      tipoContenido: 'image/jpeg',
      cargadoPor: escenario.usuarioId,
      estado: 'no_disponible',
      procesadoEn: new Date(),
    },
  })
  await entrar(page, escenario.correo)
  await page.goto(`/gastos/asistida/${extraccion.id}?consorcio=${escenario.consorcioId}`)
  await expect(page.getByRole('status')).toContainText('La asistencia no está disponible')
  await expect(page.getByText('Precargado: revisar antes de confirmar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Registrar gasto' })).toBeVisible()

  await page.getByRole('button', { name: 'Descartar comprobante' }).click()
  await expect(page).toHaveURL(/\/gastos\/asistida\?.*descartada=1/)
  await expect(page.getByRole('status')).toContainText('Extracción descartada')
  const descartada = await prisma.extraccionComprobante.findUniqueOrThrow({
    where: { id: extraccion.id },
  })
  expect(descartada.estado).toBe('descartada')
  expect(descartada.gastoId).toBeNull()
})

test('la pregunta con respaldo cita el documento; la que no lo tiene, lo dice (SC-014, SC-015)', async ({
  page,
}) => {
  await entrar(page, escenario.correo)
  await page.goto(`/documentos/consultar?consorcio=${escenario.consorcioId}`)
  await expect(
    page.getByRole('heading', { name: 'Preguntarle a la documentación', level: 1 }),
  ).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)

  await page
    .getByLabel('Tu pregunta')
    .fill('¿Cuántas personas entran en el salón de usos múltiples?')
  await page.getByRole('button', { name: 'Preguntar' }).click()
  await expect(page.getByText('cuarenta personas')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fuentes', level: 2 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Reglamento de copropiedad' })).toBeVisible()
  await expect(page.getByText('fragmento 1')).toBeVisible()
  expect(await desbordaALoAncho(page)).toBe(false)

  await page.getByRole('button', { name: 'Sí' }).click()
  await expect
    .poll(async () => {
      const consulta = await prisma.consultaDocumental.findFirst({
        where: { consorcioId: escenario.consorcioId, sinRespaldo: false },
      })
      return consulta?.util ?? null
    })
    .toBe(true)

  await page.getByLabel('Tu pregunta').fill('¿Qué día pasa el camión de la basura?')
  await page.getByRole('button', { name: 'Preguntar' }).click()
  await expect(page.getByRole('status')).toContainText('No lo encontramos en la documentación')
  expect(
    await prisma.consultaDocumental.count({
      where: { consorcioId: escenario.consorcioId, sinRespaldo: true },
    }),
  ).toBe(1)
})

test('la sugerencia del triage se aplica a mano y no cambia el estado (FR-027)', async ({
  page,
}) => {
  await entrar(page, escenario.correo)
  await page.goto(`/reclamos?consorcio=${escenario.consorcioId}`)
  await page.getByRole('button', { name: 'Nuevo reclamo' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Qué pasa').fill('El ascensor quedó parado entre pisos')
  await dialogo
    .getByLabel('Detalle')
    .fill('Hay una persona atrapada en el ascensor: el mantenimiento no responde.')
  await dialogo.getByRole('button', { name: 'Registrar reclamo' }).click()
  await expect(page).toHaveURL(/\/reclamos\/[0-9a-f-]+/)

  // La cola se drena con el pedido siguiente (`after` del panel): recargar
  // hasta ver la sugerencia. Urgencia critica por «atrapada», rubro por palabras.
  await expect
    .poll(
      async () => {
        await page.reload()
        return page.getByRole('heading', { name: 'Sugerencia automática' }).count()
      },
      { timeout: 20_000 },
    )
    .toBe(1)
  const sugerencia = page.locator('section[aria-labelledby="sugerencia"]')
  await expect(sugerencia.getByText('Mantenimiento de ascensores')).toBeVisible()
  await expect(page.getByText('Abierto', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByText('Aplicada.', { exact: true })).toBeVisible()
  await expect(page.getByText('Abierto', { exact: true })).toBeVisible()
  const reclamo = await prisma.reclamo.findFirstOrThrow({
    where: { consorcioId: escenario.consorcioId },
    include: { sugerencia: true },
  })
  expect(reclamo.estado).toBe('abierto')
  expect(reclamo.responsableId).toBeNull()
  expect(reclamo.rubroId).toBe(rubroId)
  expect(reclamo.urgencia).toBe('critica')
  expect(reclamo.sugerencia?.aceptada).toBe(true)
  expect(await desbordaALoAncho(page)).toBe(false)
})
