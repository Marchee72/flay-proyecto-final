import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { periodoPara } from '@/aplicacion/periodos/periodos'
import {
  altaEspacio,
  deshabilitarEspacio,
  habilitarEspacio,
  listarEspacios,
  suspensionesEnRango,
} from '@/aplicacion/reservas/espacios'
import {
  cancelarReserva,
  historialDeReservas,
  listarReservas,
  reservar,
} from '@/aplicacion/reservas/reservar'
import { RolInsuficiente } from '@/compartido/errores'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

/**
 * Reservas contra la base (`RF-15`, `RF-16`, `CU-09`): la superposicion la
 * rechaza la restriccion de exclusion, tambien con dos inserciones
 * concurrentes que saltan la aplicacion (SC-005); la deuda vencida frena la
 * reserva con causa (SC-006); cada cambio avisa; auditoria (SC-021).
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones
const HORA = 3_600_000
const enHoras = (h: number) => new Date(RELOJ.ahora().getTime() + h * HORA)

let consorcioId: string
let administrador: string
let vecino: { id: string; personaId: string }
let unidadA: string
let unidadB: string
let espacioId: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  const usuario = await crearUsuario('Beto')
  vecino = { id: usuario.id, personaId: usuario.personaId }
  await habilitarEnConsorcio(vecino.id, consorcioId, 'consorcista')

  await cargarPadron(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidades: [
      { designacion: '1A', coeficiente: '50.00000000' },
      { designacion: '1B', coeficiente: '50.00000000' },
    ],
  })
  const unidades = await prismaBase.unidad.findMany({ where: { consorcioId } })
  unidadA = unidades.find((u) => u.designacion === '1A')!.id
  unidadB = unidades.find((u) => u.designacion === '1B')!.id
  await registrarOcupacion(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidadId: unidadA,
    personaId: vecino.personaId,
    tipo: 'propietario',
    desde: new Date('2026-01-01'),
  })
  espacioId = (
    await altaEspacio(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      nombre: 'SUM',
      capacidadMaxima: 40,
    })
  ).espacioId
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await prismaBase.trabajoPendiente.deleteMany({})
  await prismaBase.$executeRaw`DELETE FROM "Reserva"`
  await prismaBase.$executeRaw`DELETE FROM "Ocupacion"`
  await prismaBase.$executeRaw`DELETE FROM "PagoImputacion"`
  await prismaBase.$executeRaw`DELETE FROM "Pago"`
  await prismaBase.$executeRaw`DELETE FROM "InteresLiquidado"`
  await prismaBase.$executeRaw`DELETE FROM "DetalleLiquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Liquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

describe('superposicion (regla RN-10, SC-005)', () => {
  it('dos INSERT concurrentes que saltan la aplicacion: exactamente uno queda confirmado', async () => {
    const fila = (unidadId: string) =>
      prismaBase.reserva.create({
        data: {
          consorcioId,
          espacioId,
          unidadId,
          solicitadaPor: administrador,
          desde: enHoras(72),
          hasta: enHoras(76),
          estado: 'confirmada',
        },
      })
    const resultados = await Promise.allSettled([fila(unidadA), fila(unidadB)])
    const confirmadas = resultados.filter((r) => r.status === 'fulfilled')
    const rechazadas = resultados.filter((r) => r.status === 'rejected')
    expect(confirmadas).toHaveLength(1)
    expect(rechazadas).toHaveLength(1)
    expect(String((rechazadas[0] as PromiseRejectedResult).reason)).toMatch(
      /reserva_sin_superposicion|23P01|exclusion/i,
    )
    expect(await prismaBase.reserva.count({ where: { espacioId, estado: 'confirmada' } })).toBe(1)
  })

  it('por la aplicacion el rechazo tiene un mensaje que nombra la causa', async () => {
    await reservar(repo, RELOJ, {
      usuarioId: vecino.id,
      consorcioId,
      espacioId,
      unidadId: unidadA,
      desde: enHoras(72),
      hasta: enHoras(76),
    })
    await expect(
      reservar(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        espacioId,
        unidadId: unidadB,
        desde: enHoras(74),
        hasta: enHoras(78),
      }),
    ).rejects.toThrow('ya está reservado')
    // Una cancelada no bloquea el rango.
    const [reserva] = await prismaBase.reserva.findMany({ where: { espacioId } })
    await cancelarReserva(repo, RELOJ, { usuarioId: vecino.id, consorcioId, reservaId: reserva.id })
    await expect(
      reservar(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        espacioId,
        unidadId: unidadB,
        desde: enHoras(74),
        hasta: enHoras(78),
      }),
    ).resolves.toHaveProperty('reservaId')
  })
})

describe('deuda vencida (SC-006) y reglas del espacio', () => {
  it('una unidad con deuda vencida no reserva, y el mensaje nombra la causa', async () => {
    // Un periodo de enero liquidado y sin pagar: a septiembre esta vencido.
    const rubroId = (
      await prismaBase.rubroGasto.upsert({
        where: { nombre: 'Rubro de prueba' },
        update: {},
        create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
      })
    ).id
    const { periodoId } = await periodoPara(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      anio: 2026,
      mes: 1,
    })
    await registrarGasto(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
      rubroId,
      importe: '1000.00',
      fecha: new Date('2026-01-05'),
      descripcion: 'Gasto',
    })
    await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
    await liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })

    await expect(
      reservar(repo, RELOJ, {
        usuarioId: vecino.id,
        consorcioId,
        espacioId,
        unidadId: unidadA,
        desde: enHoras(72),
        hasta: enHoras(76),
      }),
    ).rejects.toThrow('tiene deuda vencida')
    expect(await prismaBase.reserva.count({})).toBe(0)
  })

  it('anticipacion, duracion, capacidad y tope mensual, cada uno con su valor', async () => {
    const base = { usuarioId: vecino.id, consorcioId, espacioId, unidadId: unidadA }
    await expect(
      reservar(repo, RELOJ, { ...base, desde: enHoras(10), hasta: enHoras(12) }),
    ).rejects.toThrow('al menos 48 horas')
    await expect(
      reservar(repo, RELOJ, { ...base, desde: enHoras(24 * 70), hasta: enHoras(24 * 70 + 2) }),
    ).rejects.toThrow('hasta 60 días')
    await expect(
      reservar(repo, RELOJ, { ...base, desde: enHoras(72), hasta: enHoras(72 + 9) }),
    ).rejects.toThrow('hasta 8 horas')
    await expect(
      reservar(repo, RELOJ, {
        ...base,
        desde: enHoras(72),
        hasta: enHoras(74),
        cantidadPersonas: 41,
      }),
    ).rejects.toThrow('hasta 40 personas')
    await reservar(repo, RELOJ, { ...base, desde: enHoras(72), hasta: enHoras(74) })
    await reservar(repo, RELOJ, { ...base, desde: enHoras(96), hasta: enHoras(98) })
    await expect(
      reservar(repo, RELOJ, { ...base, desde: enHoras(120), hasta: enHoras(122) }),
    ).rejects.toThrow('el tope es 2')
  })

  it('el consorcista no reserva para una unidad que no ocupa', async () => {
    await expect(
      reservar(repo, RELOJ, {
        usuarioId: vecino.id,
        consorcioId,
        espacioId,
        unidadId: unidadB,
        desde: enHoras(72),
        hasta: enHoras(74),
      }),
    ).rejects.toThrow('No encontramos lo que buscabas.')
  })
})

describe('avisos, aislamiento, baja y auditoria', () => {
  it('confirmar y cancelar avisan al solicitante; otro consorcio no ve la reserva; queda asiento (SC-021)', async () => {
    const { reservaId } = await reservar(repo, RELOJ, {
      usuarioId: vecino.id,
      consorcioId,
      espacioId,
      unidadId: unidadA,
      desde: enHoras(72),
      hasta: enHoras(74),
    })
    await cancelarReserva(repo, RELOJ, { usuarioId: vecino.id, consorcioId, reservaId })
    const avisos = await prismaBase.notificacion.findMany({
      where: { usuarioId: vecino.id },
      orderBy: { creadoEn: 'asc' },
    })
    expect(avisos.map((a) => a.tipo)).toEqual(['reserva_confirmada', 'reserva_rechazada'])

    const otro = (await crearConsorcio((await crearAdministradora('Otra')).id, 'Otro 1')).id
    await habilitarEnConsorcio(administrador, otro, 'administrador')
    const ajenas = await listarReservas(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: otro,
      desde: enHoras(0),
      hasta: enHoras(200),
    })
    expect(ajenas).toEqual([])

    const asientos = await prismaBase.bitacoraAuditoria.findMany({
      where: { tabla: 'Reserva', clave: reservaId },
    })
    expect(asientos.map((a) => a.operacion)).toEqual(['INSERTA', 'MODIFICA'])
  })

  it('deshabilitar abierto cancela y avisa; habilitar reactiva y cierra el tramo', async () => {
    await reservar(repo, RELOJ, {
      usuarioId: vecino.id,
      consorcioId,
      espacioId,
      unidadId: unidadA,
      desde: enHoras(72),
      hasta: enHoras(74),
    })
    const { canceladas } = await deshabilitarEspacio(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      espacioId,
      motivo: 'Reforma del piso',
    })
    expect(canceladas).toBe(1)
    const [reserva] = await prismaBase.reserva.findMany({ where: { espacioId } })
    expect(reserva.estado).toBe('cancelada')
    expect(reserva.motivoRechazo).toContain('deshabilitado')

    // Queda inactivo con el tramo abierto y su motivo.
    const [deshabilitado] = await listarEspacios(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      incluirInactivos: true,
    })
    expect(deshabilitado).toMatchObject({ activo: false })
    expect(deshabilitado.suspension).toMatchObject({ motivo: 'Reforma del piso', hasta: null })

    // Rehabilitar reactiva y le pone fin al tramo (para el calendario).
    await habilitarEspacio(repo, RELOJ, { usuarioId: administrador, consorcioId, espacioId })
    const [reactivado] = await listarEspacios(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      incluirInactivos: true,
    })
    expect(reactivado).toMatchObject({ activo: true, suspension: null })
    const [tramo] = await prismaBase.suspensionEspacio.findMany({ where: { espacioId } })
    expect(tramo.hasta).not.toBeNull()
  })

  it('deshabilitar con fecha de fin cancela solo lo de la ventana; lo posterior sobrevive', async () => {
    // Dentro de la ventana (a 72 h) y despues del fin (a 30 dias).
    const dentro = await reservar(repo, RELOJ, {
      usuarioId: vecino.id,
      consorcioId,
      espacioId,
      unidadId: unidadA,
      desde: enHoras(72),
      hasta: enHoras(74),
    })
    const despues = await reservar(repo, RELOJ, {
      usuarioId: vecino.id,
      consorcioId,
      espacioId,
      unidadId: unidadA,
      desde: enHoras(24 * 30),
      hasta: enHoras(24 * 30 + 2),
    })
    const { canceladas } = await deshabilitarEspacio(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      espacioId,
      motivo: 'Suspendido una semana',
      hasta: enHoras(24 * 7),
    })
    expect(canceladas).toBe(1)
    const estados = await prismaBase.reserva.findMany({
      where: { id: { in: [dentro.reservaId, despues.reservaId] } },
      orderBy: { desde: 'asc' },
    })
    expect(estados.map((r) => r.estado)).toEqual(['cancelada', 'confirmada'])
  })

  it('el tramo deshabilitado aparece en el rango del calendario; el consorcista no', async () => {
    await deshabilitarEspacio(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      espacioId,
      motivo: 'Reforma',
    })
    const rango = {
      consorcioId,
      desde: new Date('2026-09-01T03:00:00Z'),
      hasta: new Date('2026-10-01T03:00:00Z'),
    }
    const tramos = await suspensionesEnRango(repo, RELOJ, { ...rango, usuarioId: administrador })
    expect(tramos).toHaveLength(1)
    expect(tramos[0]).toMatchObject({ motivo: 'Reforma', hasta: null })

    await expect(
      suspensionesEnRango(repo, RELOJ, { ...rango, usuarioId: vecino.id }),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })
})

describe('historial de uso', () => {
  it('el administrador ve meses pasados con quien reservo; el consorcista no entra', async () => {
    // Una reserva de agosto: `reservar` no deja crear en el pasado, va directo.
    await prismaBase.reserva.create({
      data: {
        consorcioId,
        espacioId,
        unidadId: unidadA,
        solicitadaPor: vecino.id,
        desde: new Date('2026-08-10T21:00:00Z'),
        hasta: new Date('2026-08-11T01:00:00Z'),
        estado: 'confirmada',
      },
    })
    const agosto = {
      consorcioId,
      desde: new Date('2026-08-01T03:00:00Z'),
      hasta: new Date('2026-09-01T03:00:00Z'),
    }

    const historial = await historialDeReservas(repo, RELOJ, {
      ...agosto,
      usuarioId: administrador,
    })
    expect(historial).toHaveLength(1)
    expect(historial[0]).toMatchObject({ unidad: '1A', solicitante: 'Beto Diaz', cumplida: true })

    await expect(
      historialDeReservas(repo, RELOJ, { ...agosto, usuarioId: vecino.id }),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('el filtro por unidad deja solo las reservas de esa unidad', async () => {
    const agosto = {
      consorcioId,
      desde: new Date('2026-08-01T03:00:00Z'),
      hasta: new Date('2026-09-01T03:00:00Z'),
    }
    // Dos reservas del mismo mes, una por unidad, en franjas que no se solapan
    // (la exclusion GiST es por espacio, no por unidad).
    await prismaBase.reserva.createMany({
      data: [
        {
          consorcioId,
          espacioId,
          unidadId: unidadA,
          solicitadaPor: vecino.id,
          desde: new Date('2026-08-10T21:00:00Z'),
          hasta: new Date('2026-08-11T01:00:00Z'),
          estado: 'confirmada',
        },
        {
          consorcioId,
          espacioId,
          unidadId: unidadB,
          solicitadaPor: administrador,
          desde: new Date('2026-08-12T21:00:00Z'),
          hasta: new Date('2026-08-13T01:00:00Z'),
          estado: 'confirmada',
        },
      ],
    })

    const soloA = await historialDeReservas(repo, RELOJ, {
      ...agosto,
      usuarioId: administrador,
      unidadId: unidadA,
    })
    expect(soloA).toHaveLength(1)
    expect(soloA[0]).toMatchObject({ unidad: '1A' })

    const todas = await historialDeReservas(repo, RELOJ, { ...agosto, usuarioId: administrador })
    expect(todas).toHaveLength(2)
  })
})
