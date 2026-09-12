import { existsSync } from 'node:fs'

import { hash } from '@node-rs/argon2'
import { PrismaClient } from '@prisma/client'
import type { Page } from '@playwright/test'

/**
 * Siembra y sesion para las pruebas de extremo a extremo.
 *
 * Las pantallas del panel exigen sesion, asi que la prueba entra por el mismo
 * formulario que una persona: es la unica forma de recorrer el camino entero.
 * Cada corrida siembra **sus propios datos**, con identificadores unicos, para
 * que dos proyectos de Playwright en paralelo no se pisen.
 */

if (existsSync('.env')) process.loadEnvFile('.env')

export const CONTRASENA = 'una-contrasena-larga-de-prueba'

export const prisma = new PrismaClient()

const unico = () => crypto.randomUUID().slice(0, 8)

export interface Escenario {
  administradoraId: string
  consorcioId: string
  personaId: string
  usuarioId: string
  correo: string
  periodoId: string
  gastoId: string
}

/**
 * Un consorcio con un gasto y su rol. `rol` decide que puede hacer quien entra:
 * con `consorcista` se recorre exactamente lo que ve un usuario final.
 */
export async function sembrarEscenario(
  rol: 'administrador' | 'consorcista',
  nombre = 'Mitre 456',
): Promise<Escenario> {
  const administradora = await prisma.administradora.create({
    data: { razonSocial: `Delta ${unico()}`, cuit: `30-${unico()}-0` },
  })

  const consorcio = await prisma.consorcio.create({
    data: {
      administradoraId: administradora.id,
      nombre,
      direccion: 'Bartolome Mitre 456',
      localidad: 'Rosario',
      cuit: `33-${unico()}-9`,
    },
  })

  const correo = `e2e-${unico()}@ejemplo.test`
  const persona = await prisma.persona.create({ data: { nombre: 'Ada', apellido: 'Diaz' } })

  const usuario = await prisma.usuario.create({
    data: {
      personaId: persona.id,
      correo,
      estado: 'activo',
      claveDerivada: await hash(CONTRASENA, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
    },
  })

  await prisma.habilitacion.create({
    data: {
      usuarioId: usuario.id,
      consorcioId: consorcio.id,
      rol,
      vigenciaDesde: new Date('2026-01-01'),
    },
  })

  const rubro = await prisma.rubroGasto.upsert({
    where: { nombre: 'Mantenimiento de ascensores' },
    update: {},
    create: { nombre: 'Mantenimiento de ascensores', clasificacion: 'ordinario' },
  })

  const proveedor = await prisma.proveedor.create({
    data: {
      consorcioId: consorcio.id,
      razonSocial: 'Ascensores del Litoral',
      cuit: `30-${unico()}-7`,
      rubroHabitualId: rubro.id,
    },
  })

  const periodo = await prisma.periodo.create({
    data: { consorcioId: consorcio.id, anio: 2026, mes: 9 },
  })

  const gasto = await prisma.gasto.create({
    data: {
      consorcioId: consorcio.id,
      periodoId: periodo.id,
      rubroId: rubro.id,
      proveedorId: proveedor.id,
      importe: '184320.75',
      clasificacion: rubro.clasificacion,
      fecha: new Date('2026-09-05'),
      descripcion: 'Mantenimiento mensual del ascensor',
      cargadoPor: usuario.id,
    },
  })

  return {
    administradoraId: administradora.id,
    consorcioId: consorcio.id,
    personaId: persona.id,
    usuarioId: usuario.id,
    correo,
    periodoId: periodo.id,
    gastoId: gasto.id,
  }
}

/** Orden inverso al de las claves foraneas. */
export async function limpiarEscenario(escenario: Escenario): Promise<void> {
  await prisma.comprobante.deleteMany({ where: { gasto: { consorcioId: escenario.consorcioId } } })
  await prisma.gasto.deleteMany({ where: { consorcioId: escenario.consorcioId } })
  await prisma.periodo.deleteMany({ where: { consorcioId: escenario.consorcioId } })
  await prisma.proveedor.deleteMany({ where: { consorcioId: escenario.consorcioId } })
  await prisma.habilitacion.deleteMany({ where: { consorcioId: escenario.consorcioId } })
  await prisma.intentoInicioSesion.deleteMany({ where: { correoProbado: escenario.correo } })
  await prisma.usuario.deleteMany({ where: { id: escenario.usuarioId } })
  await prisma.persona.deleteMany({ where: { id: escenario.personaId } })
  await prisma.consorcio.deleteMany({ where: { id: escenario.consorcioId } })
  await prisma.administradora.deleteMany({ where: { id: escenario.administradoraId } })
}

/** Entra por el formulario, no por una galleta fabricada a mano. */
export async function entrar(page: Page, correo: string): Promise<void> {
  await page.goto('/ingresar')
  await page.getByLabel('Correo electrónico').fill(correo)
  await page.getByLabel('Contraseña').fill(CONTRASENA)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(/\/usuarios/)
}

/** La pagina no se desplaza a lo ancho: la tabla lo hace dentro de su caja. */
export const desbordaALoAncho = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )

export interface Expensa {
  detallePropioId: string
  detalleAjenoId: string
  liquidacionId: string
}

/**
 * Una liquidacion emitida sobre dos unidades: la de quien entra y una ajena
 * (`003-liquidacion` SC-008). Se siembra directo, sin pasar por el motor: lo
 * que la prueba de extremo a extremo verifica es la pantalla y quien ve que,
 * no el calculo, que ya tiene sus propias pruebas.
 */
export async function sembrarExpensa(escenario: Escenario): Promise<Expensa> {
  // Las dos unidades entran juntas: el disparador diferido exige que el padron
  // sume 100 al confirmar, y una sola unidad de 50 no confirma (FR-011c).
  const filas = ['3B', '3C'].map((designacion) => ({
    id: crypto.randomUUID(),
    consorcioId: escenario.consorcioId,
    designacion,
    coeficiente: '50.00000000',
  }))
  await prisma.unidad.createMany({ data: filas })
  const [propia, ajena] = filas

  // La ocupacion lleva rango de fechas: el mapeador no lo modela (research R-04 de 002).
  await prisma.$executeRaw`
    INSERT INTO "Ocupacion" (unidad_id, persona_id, tipo, vigencia)
    VALUES (${propia.id}::uuid, ${escenario.personaId}::uuid, 'propietario'::"TipoOcupacion",
            daterange('2026-01-01', NULL))`

  const liquidacion = await prisma.liquidacion.create({
    data: {
      consorcioId: escenario.consorcioId,
      periodoId: escenario.periodoId,
      totalOrdinario: '184320.75',
      totalExtraordinario: '0.00',
      totalGeneral: '184320.75',
      // Ya vencida: asi las dos unidades estan en mora para la prueba de
      // morosidad, cualquiera sea el dia en que corra.
      vencimiento: new Date('2026-08-10'),
      emitidaPor: escenario.usuarioId,
    },
  })

  const detalle = (unidadId: string, importe: string, ajuste: string, total: string) =>
    prisma.detalleLiquidacion.create({
      data: {
        liquidacionId: liquidacion.id,
        unidadId,
        coeficienteAplicado: '50.00000000',
        importeOrdinario: importe,
        importeExtraordinario: '0.00',
        ajusteRedondeo: ajuste,
        totalUnidad: total,
      },
    })

  const [detallePropio, detalleAjeno] = await Promise.all([
    detalle(propia.id, '92160.37', '0.01', '92160.38'),
    detalle(ajena.id, '92160.37', '0.00', '92160.37'),
  ])

  await prisma.periodo.update({ where: { id: escenario.periodoId }, data: { estado: 'liquidado' } })

  return {
    detallePropioId: detallePropio.id,
    detalleAjenoId: detalleAjeno.id,
    liquidacionId: liquidacion.id,
  }
}

export async function limpiarExpensa(escenario: Escenario): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "Notificacion"`
  await prisma.trabajoPendiente.deleteMany({ where: { tipo: 'documento_expensa' } })
  await prisma.interesLiquidado.deleteMany({
    where: { detalle: { liquidacion: { consorcioId: escenario.consorcioId } } },
  })
  await prisma.detalleLiquidacion.deleteMany({
    where: { liquidacion: { consorcioId: escenario.consorcioId } },
  })
  await prisma.liquidacion.deleteMany({ where: { consorcioId: escenario.consorcioId } })
  await prisma.$executeRaw`
    DELETE FROM "Ocupacion" WHERE unidad_id IN
      (SELECT id FROM "Unidad" WHERE consorcio_id = ${escenario.consorcioId}::uuid)`
  await prisma.coeficienteHistorico.deleteMany({
    where: { unidad: { consorcioId: escenario.consorcioId } },
  })
  await prisma.unidad.deleteMany({ where: { consorcioId: escenario.consorcioId } })
}

/**
 * Un segundo usuario sobre el mismo consorcio, con otro rol: para recorrer el
 * ida y vuelta consorcista ↔ administrador de reclamos y reservas (004).
 */
export async function sembrarUsuarioEn(
  escenario: Escenario,
  rol: 'administrador' | 'consorcista' | 'consejo',
): Promise<{ usuarioId: string; personaId: string; correo: string }> {
  const correo = `e2e-${unico()}@ejemplo.test`
  const persona = await prisma.persona.create({ data: { nombre: 'Bruno', apellido: 'Paz' } })
  const usuario = await prisma.usuario.create({
    data: {
      personaId: persona.id,
      correo,
      estado: 'activo',
      claveDerivada: await hash(CONTRASENA, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
    },
  })
  await prisma.habilitacion.create({
    data: {
      usuarioId: usuario.id,
      consorcioId: escenario.consorcioId,
      rol,
      vigenciaDesde: new Date('2026-01-01'),
    },
  })
  return { usuarioId: usuario.id, personaId: persona.id, correo }
}

/** Dos unidades que suman 100, la primera ocupada por la persona del escenario. Devuelve la propia. */
export async function sembrarUnidadPropia(escenario: Escenario): Promise<string> {
  const filas = ['3B', '3C'].map((designacion) => ({
    id: crypto.randomUUID(),
    consorcioId: escenario.consorcioId,
    designacion,
    coeficiente: '50.00000000',
  }))
  await prisma.unidad.createMany({ data: filas })
  await prisma.$executeRaw`
    INSERT INTO "Ocupacion" (unidad_id, persona_id, tipo, vigencia)
    VALUES (${filas[0].id}::uuid, ${escenario.personaId}::uuid, 'propietario'::"TipoOcupacion",
            daterange('2026-01-01', NULL))`
  return filas[0].id
}

/** Lo de 004-servicios que cuelga del consorcio: reclamos, reservas, espacios, avisos, mas usuarios extra. */
export async function limpiarServicios(
  escenario: Escenario,
  extras: { usuarioId: string; personaId: string; correo: string }[] = [],
): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "Notificacion"`
  await prisma.trabajoPendiente.deleteMany({
    where: { tipo: { in: ['notificacion', 'triage_reclamo'] } },
  })
  await prisma.reclamo.deleteMany({ where: { consorcioId: escenario.consorcioId } })
  await prisma.reserva.deleteMany({ where: { consorcioId: escenario.consorcioId } })
  await prisma.espacioComun.deleteMany({ where: { consorcioId: escenario.consorcioId } })
  await prisma.$executeRaw`
    DELETE FROM "Ocupacion" WHERE unidad_id IN
      (SELECT id FROM "Unidad" WHERE consorcio_id = ${escenario.consorcioId}::uuid)`
  await prisma.coeficienteHistorico.deleteMany({
    where: { unidad: { consorcioId: escenario.consorcioId } },
  })
  await prisma.unidad.deleteMany({ where: { consorcioId: escenario.consorcioId } })
  for (const extra of extras) {
    await prisma.habilitacion.deleteMany({ where: { usuarioId: extra.usuarioId } })
    await prisma.intentoInicioSesion.deleteMany({ where: { correoProbado: extra.correo } })
    await prisma.usuario.deleteMany({ where: { id: extra.usuarioId } })
    await prisma.persona.deleteMany({ where: { id: extra.personaId } })
  }
}
