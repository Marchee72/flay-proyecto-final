import { expect, test } from '@playwright/test'

import {
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  type Escenario,
} from './sesion'

/**
 * Degradacion (RNF-14, SC-013): contra el servidor levantado con la
 * implementacion nula, cada funcion del negocio sigue: la pregunta lleva a la
 * lista de documentos, el reclamo se registra igual y la carga
 * asistida deja el comprobante para cargarlo a mano.
 */

let escenario: Escenario

test.beforeAll(async () => {
  escenario = await sembrarEscenario('administrador', 'Mitre 456')
  await prisma.documentoConsorcio.create({
    data: {
      consorcioId: escenario.consorcioId,
      tipo: 'reglamento_copropiedad',
      titulo: 'Reglamento de copropiedad',
      claveAlmacenamiento: `documentos/${escenario.consorcioId}/nula/reglamento.pdf`,
      tipoContenido: 'application/pdf',
      visibleConsorcistas: true,
      cargadoPor: escenario.usuarioId,
    },
  })
})

test.afterAll(async () => {
  await limpiarServicios(escenario)
  await limpiarEscenario(escenario)
  await prisma.$disconnect()
})

test('sin asistencia, la pregunta lleva a los documentos y el reclamo se registra igual', async ({
  page,
}) => {
  await entrar(page, escenario.correo)

  await page.goto(`/documentos/consultar?consorcio=${escenario.consorcioId}`)
  await page.getByLabel('Tu pregunta').fill('¿Cuántas personas entran en el salón?')
  await page.getByRole('button', { name: 'Preguntar' }).click()
  await expect(page.getByRole('status')).toContainText('no está configurado')
  await expect(page.getByRole('heading', { name: 'Documentos para abrir', level: 2 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Reglamento de copropiedad' })).toBeVisible()
  expect(
    await prisma.consultaDocumental.count({ where: { consorcioId: escenario.consorcioId } }),
  ).toBe(0)

  await page.goto(`/reclamos?consorcio=${escenario.consorcioId}`)
  await page.getByRole('button', { name: 'Nuevo reclamo' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Qué pasa').fill('El ascensor quedó parado entre pisos')
  await dialogo.getByLabel('Detalle').fill('Hay una persona atrapada en el ascensor.')
  await dialogo.getByRole('button', { name: 'Registrar reclamo' }).click()
  await expect(page).toHaveURL(/\/reclamos\/[0-9a-f-]+/)
  await expect(page.getByRole('status')).toContainText('Reclamo registrado')
  const reclamoId = page.url().split('/reclamos/')[1].split('?')[0]

  // Lo que importa aca es que el reclamo existe y sigue su curso sin la
  // asistencia (PI-09 lo prueba en integracion). No se afirma la ausencia de
  // sugerencia: la cola es una sola y la puede drenar el otro servidor.
  await expect(page.getByText('Abierto', { exact: true })).toBeVisible()
  const reclamo = await prisma.reclamo.findUniqueOrThrow({ where: { id: reclamoId } })
  expect(reclamo.estado).toBe('abierto')

  await page.goto(`/gastos/asistida?consorcio=${escenario.consorcioId}`)
  await expect(page.getByRole('heading', { name: 'Carga asistida', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Subir y extraer' })).toBeVisible()
})
