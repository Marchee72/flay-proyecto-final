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
 * RNF-11 en las pantallas de asambleas (016, FR-039): la sala en vivo con los
 * botones de voto, el acta con la firma, la lista, el alta y las reglas, con
 * cero infracciones A y AA.
 */

let consorcista: Escenario
let administrador: Escenario
let enCurso: string
let aFirmar: string

/** Una asamblea sembrada en el estado pedido, respetando las transiciones que exige la base. */
async function sembrarAsamblea(e: Escenario, unidadId: string, hasta: 'en_curso' | 'a_firmar') {
  const asamblea = await prisma.asamblea.create({
    data: {
      consorcioId: e.consorcioId,
      tipo: 'ordinaria',
      titulo: hasta === 'en_curso' ? 'Asamblea en curso' : 'Asamblea con acta',
      fechaHora: new Date(Date.now() - 30 * 60_000),
      lugar: 'SUM',
      organizadorId: e.usuarioId,
    },
  })
  const punto = await prisma.puntoAsamblea.create({
    data: {
      consorcioId: e.consorcioId,
      asambleaId: asamblea.id,
      orden: 1,
      titulo: 'Pintura del frente',
      modalidad: 'binaria',
      mayoria: 'absoluta',
      resumen: hasta === 'a_firmar' ? 'Se aprobó pintar.' : null,
    },
  })
  await prisma.asamblea.update({ where: { id: asamblea.id }, data: { estado: 'convocada' } })
  await prisma.asamblea.update({
    where: { id: asamblea.id },
    data: { estado: 'en_curso', dirigeId: e.usuarioId },
  })
  const unidades = await prisma.unidad.findMany({ where: { consorcioId: e.consorcioId } })
  await prisma.unidadEnAsamblea.createMany({
    data: unidades.map((u) => ({
      consorcioId: e.consorcioId,
      asambleaId: asamblea.id,
      unidadId: u.id,
      designacion: u.designacion,
      coeficiente: u.coeficiente,
      presente: u.id === unidadId,
      representanteId: u.id === unidadId ? e.usuarioId : null,
      representanteNombre: u.id === unidadId ? 'Ada Diaz' : null,
      representacion: u.id === unidadId ? 'propietario' : null,
    })),
  })
  await prisma.asamblea.update({
    where: { id: asamblea.id },
    data: { constituidaEn: new Date(), convocatoriaQueRige: 'segunda', presidenteId: e.usuarioId },
  })
  await prisma.puntoAsamblea.update({ where: { id: punto.id }, data: { estado: 'abierto' } })
  if (hasta === 'en_curso') return asamblea.id

  await prisma.puntoAsamblea.update({
    where: { id: punto.id },
    data: { estado: 'cerrado', resultado: 'rechazado' },
  })
  await prisma.asamblea.update({ where: { id: asamblea.id }, data: { estado: 'finalizada' } })
  const acta = await prisma.actaAsamblea.create({
    data: { consorcioId: e.consorcioId, asambleaId: asamblea.id },
  })
  await prisma.firmanteActa.create({
    data: {
      consorcioId: e.consorcioId,
      actaId: acta.id,
      usuarioId: e.usuarioId,
      rolEnActa: 'presidente',
    },
  })
  await prisma.actaAsamblea.update({
    where: { id: acta.id },
    data: { estado: 'a_firmar', hashContenido: 'a'.repeat(64), enviadaAFirmarEn: new Date() },
  })
  return asamblea.id
}

test.beforeAll(async () => {
  consorcista = await sembrarEscenario('consorcista', 'Sol 123')
  administrador = await sembrarEscenario('administrador', 'Luna 9')
  const unidadId = await sembrarUnidadPropia(consorcista)
  enCurso = await sembrarAsamblea(consorcista, unidadId, 'en_curso')
  aFirmar = await sembrarAsamblea(consorcista, unidadId, 'a_firmar')
})

test.afterAll(async () => {
  await limpiarServicios(consorcista)
  await limpiarServicios(administrador)
  await limpiarEscenario(consorcista)
  await limpiarEscenario(administrador)
  await prisma.$disconnect()
})

const DEL_CONSORCISTA = [
  {
    nombre: 'lista de asambleas',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/asambleas`,
  },
  {
    nombre: 'sala en vivo',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/asambleas/${enCurso}`,
  },
  {
    nombre: 'acta a firmar',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/asambleas/${aFirmar}/acta`,
  },
]

const DEL_ADMINISTRADOR = [
  {
    nombre: 'nueva asamblea',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/asambleas/nueva`,
  },
  {
    nombre: 'reglas de asamblea',
    ruta: (e: Escenario) => `/consorcios/${e.consorcioId}/asambleas/configuracion`,
  },
]

for (const pantalla of DEL_CONSORCISTA) {
  test(`${pantalla.nombre} sin infracciones A/AA`, async ({ page }) => {
    await entrar(page, consorcista.correo)
    await page.goto(pantalla.ruta(consorcista))
    const resultado = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(resultado.violations).toEqual([])
  })
}

for (const pantalla of DEL_ADMINISTRADOR) {
  test(`${pantalla.nombre} sin infracciones A/AA`, async ({ page }) => {
    await entrar(page, administrador.correo)
    await page.goto(pantalla.ruta(administrador))
    const resultado = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(resultado.violations).toEqual([])
  })
}
