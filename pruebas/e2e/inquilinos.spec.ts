import { expect, test } from '@playwright/test'

import {
  desbordaALoAncho,
  entrar,
  limpiarEscenario,
  limpiarServicios,
  prisma,
  sembrarEscenario,
  sembrarUnidadPropia,
  sembrarUsuarioEn,
  type Escenario,
} from './sesion'

const unico = () => crypto.randomUUID().slice(0, 8)

let duenio: Escenario
let admin: { usuarioId: string; personaId: string; correo: string }
let archivado: Escenario
const correosCreados: string[] = []

test.beforeAll(async () => {
  duenio = await sembrarEscenario('consorcista', 'Mitre 456')
  await sembrarUnidadPropia(duenio)
  admin = await sembrarUsuarioEn(duenio, 'administrador')

  archivado = await sembrarEscenario('consorcista', 'Archivado 999')
  await sembrarUnidadPropia(archivado)
  await prisma.$executeRaw`
    UPDATE "Consorcio" SET archivado_en = now() WHERE id = ${archivado.consorcioId}::uuid
  `
})

test.afterAll(async () => {
  await prisma.$executeRaw`
    UPDATE "Consorcio" SET archivado_en = NULL WHERE id = ${archivado.consorcioId}::uuid
  `
  await limpiarServicios(archivado)
  await limpiarEscenario(archivado)

  await limpiarServicios(duenio, [admin])

  if (correosCreados.length > 0) {
    await prisma.$executeRaw`
      DELETE FROM "TrabajoPendiente"
      WHERE tipo = 'invitacion' AND carga->>'destino' = ANY(${correosCreados})
    `
    const usuarios = await prisma.usuario.findMany({
      where: { correo: { in: correosCreados } },
      select: { id: true, personaId: true },
    })
    const usuarioIds = usuarios.map((u) => u.id)
    const personaIds = usuarios.map((u) => u.personaId)
    if (usuarioIds.length > 0) {
      await prisma.habilitacion.deleteMany({ where: { usuarioId: { in: usuarioIds } } })
      await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } })
    }
    if (personaIds.length > 0) {
      await prisma.persona.deleteMany({ where: { id: { in: personaIds } } })
    }
  }

  await limpiarEscenario(duenio)
  await prisma.$disconnect()
})

test.describe.serial('inquilinos por unidad (RF-03)', () => {
  test('el dueño asigna un inquilino desde Mis unidades y después termina el alquiler', async ({
    page,
  }) => {
    const correo = `inq-${unico()}@ejemplo.test`
    correosCreados.push(correo)

    await entrar(page, duenio.correo)
    await page.goto(`/consorcios/${duenio.consorcioId}/mis-unidades`)

    const ficha3B = page.getByRole('article').filter({ hasText: '3B' })
    await ficha3B.getByRole('button', { name: 'Asignar inquilino' }).click()

    const dialogo = page.getByRole('dialog', { name: 'Asignar inquilino en 3B' })
    await dialogo.getByLabel('Nombre').fill('Juan')
    await dialogo.getByLabel('Apellido').fill('Pérez')
    await dialogo.getByLabel('Correo').fill(correo)
    await dialogo.getByRole('button', { name: 'Asignar', exact: true }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Inquilino asignado.' })).toBeVisible()
    await expect(ficha3B).toContainText('Juan Pérez')

    await ficha3B.getByRole('button', { name: 'Terminar alquiler' }).click()
    const dialogoFin = page.getByRole('dialog', { name: 'Terminar el alquiler de Juan Pérez' })
    await expect(dialogoFin).toContainText(
      'Juan Pérez deja de tener acceso al consorcio desde el día siguiente, salvo que ocupe otra unidad.',
    )
    await dialogoFin.getByRole('button', { name: 'Confirmar' }).click()

    await expect(
      page.getByRole('status').filter({ hasText: 'Fin del alquiler registrado.' }),
    ).toBeVisible()
  })

  test('el error de fecha se ve al tipear', async ({ page }) => {
    await entrar(page, duenio.correo)
    await page.goto(`/consorcios/${duenio.consorcioId}/mis-unidades`)

    const ficha3B = page.getByRole('article').filter({ hasText: '3B' })
    await ficha3B.getByRole('button', { name: 'Asignar inquilino' }).click()

    const dialogo = page.getByRole('dialog', { name: 'Asignar inquilino en 3B' })
    await dialogo.getByLabel('Desde').fill('2026-09-10')
    const hasta = dialogo.getByLabel('Hasta')
    await hasta.fill('2026-09-01')

    await expect(hasta).toHaveAttribute('aria-invalid', 'true')
    await expect(
      dialogo.getByText('La fecha de fin no puede ser anterior al ingreso, el 10/09/2026.'),
    ).toBeVisible()
  })

  test('volver adulterado cae en mis-unidades', async ({ page }) => {
    const correo = `adulterado-${unico()}@ejemplo.test`
    correosCreados.push(correo)

    await entrar(page, duenio.correo)
    await page.goto(`/consorcios/${duenio.consorcioId}/mis-unidades`)

    const ficha3B = page.getByRole('article').filter({ hasText: '3B' })
    await ficha3B.getByRole('button', { name: 'Asignar inquilino' }).click()

    const dialogo = page.getByRole('dialog', { name: 'Asignar inquilino en 3B' })
    await dialogo.getByLabel('Nombre').fill('Marta')
    await dialogo.getByLabel('Apellido').fill('Gómez')
    await dialogo.getByLabel('Correo').fill(correo)
    // Fecha futura sin superposición con el inquilino terminado hoy.
    await dialogo.getByLabel('Desde').fill('2027-01-01')
    await dialogo.getByLabel('Hasta').fill('2027-06-30')

    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('dialog[open] input[name="volver"]')
      if (input) input.value = 'https://ejemplo.test'
    })

    await dialogo.getByRole('button', { name: 'Asignar', exact: true }).click()
    await page.waitForURL(new RegExp(`/consorcios/${duenio.consorcioId}/mis-unidades\\?`))
    await expect(page.getByRole('status').filter({ hasText: 'Inquilino asignado.' })).toBeVisible()
  })

  test('el administrador ve la columna Inquilino en Unidades con las acciones', async ({
    page,
  }) => {
    await entrar(page, admin.correo)
    await page.goto(`/consorcios/${duenio.consorcioId}/unidades`)

    await expect(page.getByRole('columnheader', { name: 'Inquilino' })).toBeVisible()
    const fila3C = page.getByRole('row').filter({ hasText: '3C' })
    await expect(fila3C.getByRole('button', { name: 'Asignar inquilino' })).toBeVisible()
  })

  test('consorcio archivado: sin botones', async ({ page }) => {
    await entrar(page, archivado.correo)
    await page.goto(`/consorcios/${archivado.consorcioId}/mis-unidades`)

    await expect(page.getByRole('heading', { name: 'Mis unidades', level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Asignar inquilino' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Terminar alquiler' })).toHaveCount(0)
  })

  test('Mis unidades no desborda a lo ancho', async ({ page }) => {
    await entrar(page, duenio.correo)
    await page.goto(`/consorcios/${duenio.consorcioId}/mis-unidades`)

    await expect(page.getByRole('heading', { name: 'Mis unidades', level: 1 })).toBeVisible()
    expect(await desbordaALoAncho(page)).toBe(false)
  })
})
