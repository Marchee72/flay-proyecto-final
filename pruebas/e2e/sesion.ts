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
