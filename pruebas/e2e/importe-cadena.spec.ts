import { existsSync } from 'node:fs'

import { hash } from '@node-rs/argon2'
import { PrismaClient } from '@prisma/client'
import { expect, test } from '@playwright/test'

/**
 * SC-010 de punta a punta: el importe cruza base, servidor e interfaz **como
 * cadena** y llega sin perder un centavo.
 *
 * El importe es el maximo que admite la columna `NUMERIC(14,2)`: catorce
 * digitos significativos. La perdida de un `number` con mas de quince digitos
 * se prueba donde no la limita la columna, en `pruebas/dominio/formato.spec.ts`;
 * lo que **solo** se puede probar aca es que ninguna capa del camino real lo
 * convierta por el camino.
 *
 * La prueba siembra sus propios datos y entra por el formulario: es el unico
 * modo de recorrer el camino entero, incluida la sesion.
 */

if (existsSync('.env')) process.loadEnvFile('.env')

const IMPORTE = '999999999999.99'
const IMPORTE_EN_PANTALLA = '$ 999.999.999.999,99'
const CONTRASENA = 'una-contrasena-larga-de-prueba'

const prisma = new PrismaClient()

const unico = () => crypto.randomUUID().slice(0, 8)

let consorcioId: string
let gastoId: string
let correo: string
const creados: { personaId: string; usuarioId: string; administradoraId: string } = {
  personaId: '',
  usuarioId: '',
  administradoraId: '',
}

test.beforeAll(async () => {
  const administradora = await prisma.administradora.create({
    data: { razonSocial: 'Delta SC-010', cuit: `30-${unico()}-0` },
  })

  const consorcio = await prisma.consorcio.create({
    data: {
      administradoraId: administradora.id,
      nombre: 'Importe Largo 1',
      direccion: 'Mitre 456',
      localidad: 'Rosario',
      cuit: `33-${unico()}-9`,
    },
  })

  correo = `sc010-${unico()}@ejemplo.test`

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
      rol: 'administrador',
      vigenciaDesde: new Date('2026-01-01'),
    },
  })

  const rubro = await prisma.rubroGasto.upsert({
    where: { nombre: 'Obra de fachada' },
    update: {},
    create: { nombre: 'Obra de fachada', clasificacion: 'extraordinario' },
  })

  const periodo = await prisma.periodo.create({
    data: { consorcioId: consorcio.id, anio: 2026, mes: 9 },
  })

  const gasto = await prisma.gasto.create({
    data: {
      consorcioId: consorcio.id,
      periodoId: periodo.id,
      rubroId: rubro.id,
      importe: IMPORTE,
      clasificacion: rubro.clasificacion,
      fecha: new Date('2026-09-05'),
      descripcion: 'Obra de fachada completa',
      cargadoPor: usuario.id,
    },
  })

  consorcioId = consorcio.id
  gastoId = gasto.id
  creados.personaId = persona.id
  creados.usuarioId = usuario.id
  creados.administradoraId = administradora.id
})

test.afterAll(async () => {
  await prisma.gasto.deleteMany({ where: { consorcioId } })
  await prisma.periodo.deleteMany({ where: { consorcioId } })
  await prisma.habilitacion.deleteMany({ where: { consorcioId } })
  await prisma.intentoInicioSesion.deleteMany({ where: { correoProbado: correo } })
  await prisma.usuario.deleteMany({ where: { id: creados.usuarioId } })
  await prisma.persona.deleteMany({ where: { id: creados.personaId } })
  await prisma.consorcio.deleteMany({ where: { id: consorcioId } })
  await prisma.administradora.deleteMany({ where: { id: creados.administradoraId } })
  await prisma.$disconnect()
})

test('el importe mas largo que admite la columna llega intacto a la pantalla', async ({ page }) => {
  await page.goto('/ingresar')
  await page.getByLabel('Correo electrónico').fill(correo)
  await page.getByLabel('Contraseña').fill(CONTRASENA)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/usuarios/)

  await page.goto(`/gastos/${gastoId}?consorcio=${consorcioId}`)

  // Exacto, digito por digito, con la agrupacion es-AR hecha sobre la cadena.
  // Si alguna capa lo hubiera pasado por el tipo numerico nativo, el ultimo
  // centavo seria otro.
  await expect(page.locator('.cifra').first()).toHaveText(IMPORTE_EN_PANTALLA)
  expect(await page.content()).toContain(IMPORTE_EN_PANTALLA)
})
