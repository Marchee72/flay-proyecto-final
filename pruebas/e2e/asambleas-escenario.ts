import { expect, type Page } from '@playwright/test'

import {
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  sembrarUsuarioEn,
} from './sesion'

/**
 * La siembra de una asamblea convocada, con cuatro unidades y cinco personas,
 * y lo que comparten las pruebas de la sala: una sola fuente para no divergir.
 */

export async function sembrarAsambleaE2E(
  opciones: { fechaHora?: Date; reglaMayoria?: 'presentes' | 'totalidad' } = {},
) {
  const ada = await sembrarEscenario('consorcista', 'Sol 123')
  const bruno = await sembrarUsuarioEn(ada, 'consejo')
  const cora = await sembrarUsuarioEn(ada, 'consorcista')
  const dino = await sembrarUsuarioEn(ada, 'consorcista')
  const eva = await sembrarUsuarioEn(ada, 'consorcista')
  for (const [extra, nombre] of [
    [bruno, 'Bruno'],
    [cora, 'Cora'],
    [dino, 'Dino'],
  ] as const) {
    await prisma.persona.update({ where: { id: extra.personaId }, data: { nombre } })
  }

  const unidades = [
    { designacion: '1A', coeficiente: '40.00000000', persona: ada.personaId },
    { designacion: '1B', coeficiente: '30.00000000', persona: bruno.personaId },
    { designacion: '2A', coeficiente: '20.00000000', persona: cora.personaId },
    { designacion: '2B', coeficiente: '10.00000000', persona: dino.personaId },
  ].map((u) => ({ ...u, id: crypto.randomUUID() }))
  await prisma.unidad.createMany({
    data: unidades.map(({ id, designacion, coeficiente }) => ({
      id,
      designacion,
      coeficiente,
      consorcioId: ada.consorcioId,
    })),
  })
  for (const u of unidades) {
    await prisma.$executeRaw`
      INSERT INTO "Ocupacion" (unidad_id, persona_id, tipo, vigencia)
      VALUES (${u.id}::uuid, ${u.persona}::uuid, 'propietario'::"TipoOcupacion", daterange('2026-01-01', NULL))`
  }

  // Convocada hace semanas para una reunión que empezó hace diez minutos.
  const asamblea = await prisma.asamblea.create({
    data: {
      consorcioId: ada.consorcioId,
      tipo: 'ordinaria',
      titulo: 'Asamblea ordinaria',
      fechaHora: opciones.fechaHora ?? new Date(Date.now() - 10 * 60_000),
      lugar: 'SUM',
      organizadorId: bruno.usuarioId,
    },
  })
  const asambleaId = asamblea.id
  await prisma.puntoAsamblea.create({
    data: {
      consorcioId: ada.consorcioId,
      asambleaId,
      orden: 1,
      titulo: 'Pintura del frente',
      modalidad: 'binaria',
      mayoria: 'absoluta',
    },
  })
  await prisma.puntoAsamblea.create({
    data: {
      consorcioId: ada.consorcioId,
      asambleaId,
      orden: 2,
      titulo: `Reglamento_${'x'.repeat(170)}`,
      modalidad: 'binaria',
      mayoria: 'absoluta',
    },
  })
  await prisma.asamblea.update({
    where: { id: asambleaId },
    data: {
      estado: 'convocada',
      convocadaEn: new Date(Date.now() - 20 * 86_400_000),
      reglaMayoria: opciones.reglaMayoria ?? 'presentes',
      anticipacionDias: 15,
      topeApoderado: 3,
      umbralSinVoto: 2,
    },
  })

  return {
    ada,
    bruno,
    cora,
    dino,
    eva,
    asambleaId,
    ruta: () => `/consorcios/${ada.consorcioId}/asambleas/${asambleaId}`,
    limpiar: async () => {
      await limpiarServicios(ada, [bruno, cora, dino, eva])
      await limpiarEscenario(ada)
    },
  }
}

/**
 * Doble clic a propósito, con la respuesta retenida: el botón avisa que está
 * trabajando y el segundo clic no sale.
 */
export async function confirmarUnaVez(
  page: Page,
  asambleaId: string,
  etiqueta: string,
  enviando: string,
  destino: RegExp,
  alFinal?: () => Promise<void>,
) {
  let soltar = () => {}
  const retenido = new Promise<void>((resolver) => (soltar = resolver))
  const envios: string[] = []
  const patron = `**/asambleas/${asambleaId}**`
  await page.route(patron, async (pedido) => {
    if (pedido.request().method() === 'POST') {
      envios.push(pedido.request().url())
      await retenido
    }
    await pedido.continue()
  })
  await page.getByRole('button', { name: etiqueta }).dblclick()
  await expect(page.getByRole('button', { name: enviando })).toBeDisabled()
  soltar()
  await expect(page).toHaveURL(destino)
  await alFinal?.()
  expect(envios).toHaveLength(1)
  await page.unroute(patron)
}
