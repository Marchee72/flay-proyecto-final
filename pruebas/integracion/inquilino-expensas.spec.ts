import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { NoEncontrado } from '@/compartido/errores'
import {
  registrarOcupacion,
  sincronizarHabilitacion,
} from '@/aplicacion/consorcios/registrar-ocupacion'
import { misExpensas, verExpensa } from '@/aplicacion/liquidacion/ver-expensa'
import { verEstadoDeCuenta } from '@/aplicacion/pagos/estado-de-cuenta'
import { registrarPago } from '@/aplicacion/pagos/registrar'
import { prismaBase } from '@/infraestructura/prisma'
import { terminarOcupacion } from '@/infraestructura/repositorios/ocupaciones'

import { almacenEnMemoria } from './asistencia-ayudas'
import { crearUsuario, habilitarEnConsorcio } from './ayudas'
import {
  administrador,
  consorcioId,
  emitirMes,
  inquilino,
  limpiarEscenario,
  prepararEscenario,
  RELOJ,
  repo,
  unidadA,
  unidadB,
} from './ayudas-pago-en-linea'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const { almacen } = almacenEnMemoria({})

let nuevo: string
let nuevoPersonaId: string
let duenio: string
let detalleEnero1B: string

beforeEach(async () => {
  await prepararEscenario()
  await emitirMes(1)

  const uNuevo = await crearUsuario('Nuevo', 'Inquilino')
  const uDuenio = await crearUsuario('Duenio', 'UnidadB')
  nuevo = uNuevo.id
  nuevoPersonaId = uNuevo.personaId
  duenio = uDuenio.id
  await habilitarEnConsorcio(nuevo, consorcioId, 'consorcista')
  await habilitarEnConsorcio(duenio, consorcioId, 'consorcista')

  await registrarOcupacion(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidadId: unidadB,
    personaId: uDuenio.personaId,
    tipo: 'propietario',
    desde: d('2025-01-01'),
  })
  await registrarOcupacion(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidadId: unidadB,
    personaId: uNuevo.personaId,
    tipo: 'inquilino',
    desde: d('2026-02-01'),
  })

  await emitirMes(2)

  const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
    where: {
      unidadId: unidadB,
      liquidacion: { estado: 'vigente', periodo: { anio: 2026, mes: 1 } },
    },
    select: { id: true },
  })
  detalleEnero1B = detalle.id
})

afterEach(async () => {
  await limpiarEscenario()
})

describe('expensas del inquilino (RN-23)', () => {
  it('el inquilino nuevo ve solo desde su ingreso', async () => {
    const vista = await misExpensas(almacen, repo, RELOJ, { usuarioId: nuevo, consorcioId })
    expect(vista).toHaveLength(1)
    expect(vista[0]!.designacion).toBe('1B')
    expect(vista[0]!.expensas.map((e) => e.periodo)).toEqual(['02/2026'])
  })

  it('abrir por id una expensa anterior da no encontrado', async () => {
    await expect(
      verExpensa(almacen, repo, RELOJ, {
        usuarioId: nuevo,
        consorcioId,
        detalleId: detalleEnero1B,
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('avisa la deuda anterior al ingreso', async () => {
    const vista = await misExpensas(almacen, repo, RELOJ, { usuarioId: nuevo, consorcioId })
    expect(vista[0]!.deudaAnteriorAlIngreso).toBe('500.00')
  })

  it('el aviso desaparece al saldar', async () => {
    await registrarPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidadB,
      importe: '500.00',
      fechaPago: d('2026-02-05'),
      medio: 'transferencia',
    })

    const vista = await misExpensas(almacen, repo, RELOJ, { usuarioId: nuevo, consorcioId })
    expect(vista[0]!.deudaAnteriorAlIngreso).toBeNull()
  })

  it('el dueño ve toda la historia y sin aviso', async () => {
    const vista = await misExpensas(almacen, repo, RELOJ, { usuarioId: duenio, consorcioId })
    expect(vista).toHaveLength(1)
    expect(vista[0]!.expensas.map((e) => e.periodo)).toEqual(['02/2026', '01/2026'])
    expect(vista[0]!.deudaAnteriorAlIngreso).toBeNull()
  })

  it('el inquilino de depto y cochera ve las dos, cada una desde su ingreso', async () => {
    const uViejo = await prismaBase.usuario.findUniqueOrThrow({ where: { id: inquilino } })
    const [ocupacionVieja] = await prismaBase.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Ocupacion"
      WHERE "unidad_id" = ${unidadA}::uuid AND "persona_id" = ${uViejo.personaId}::uuid
    `
    await terminarOcupacion(ocupacionVieja!.id, d('2026-01-31'))
    await sincronizarHabilitacion(uViejo.personaId, consorcioId)

    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidadA,
      personaId: nuevoPersonaId,
      tipo: 'inquilino',
      desde: d('2026-02-01'),
    })

    const vista = await misExpensas(almacen, repo, RELOJ, { usuarioId: nuevo, consorcioId })
    expect(vista.map((u) => u.designacion)).toEqual(['1A', '1B'])
    expect(vista[0]!.expensas.map((e) => e.periodo)).toEqual(['02/2026'])
    expect(vista[1]!.expensas.map((e) => e.periodo)).toEqual(['02/2026'])
  })

  it('el estado de cuenta no lista movimientos anteriores', async () => {
    const cuentaNuevo = await verEstadoDeCuenta(repo, RELOJ, {
      usuarioId: nuevo,
      consorcioId,
      unidadId: unidadB,
    })
    const cuentaDuenio = await verEstadoDeCuenta(repo, RELOJ, {
      usuarioId: duenio,
      consorcioId,
      unidadId: unidadB,
    })

    expect(cuentaNuevo.movimientos.some((m) => m.concepto.includes('01/2026'))).toBe(false)
    expect(cuentaNuevo.movimientos.some((m) => m.concepto.includes('02/2026'))).toBe(true)
    expect(cuentaNuevo.saldo).toBe(cuentaDuenio.saldo)
  })
})
