import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { periodoPara } from '@/aplicacion/periodos/periodos'
import {
  altaEspacio,
  contarReservasAfectadas,
  editarEspacio,
  eliminarEspacio,
  EspacioArchivadoConEseNombre,
  EspacioInvalido,
  deshabilitarEspacio,
  habilitarEspacio,
  listarEspacios,
  listarEspaciosArchivados,
  restaurarEspacio,
  suspensionesEnRango,
} from '@/aplicacion/reservas/espacios'
import {
  cancelarReserva,
  esSuperposicion,
  historialDeReservas,
  listarReservas,
  reservar,
} from '@/aplicacion/reservas/reservar'
import { NoEncontrado, RolInsuficiente } from '@/compartido/errores'
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
  await prismaBase.$executeRaw`DELETE FROM "VencimientoLiquidacion"`
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
      /reserva_sin_superposicion|23P01|exclusion|40P01|deadlock/i,
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

async function generarDeudaVencida() {
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
}

describe('deuda vencida (SC-006) y reglas del espacio', () => {
  it('una unidad con deuda vencida no reserva, y el mensaje nombra la causa', async () => {
    await generarDeudaVencida()

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

describe('horario y rechazo por deuda configurables (RF-15, CU-09)', () => {
  const AR = (iso: string) => new Date(`${iso}:00-03:00`)
  const nuevoEspacio = async (extra: Record<string, unknown>) =>
    (
      await altaEspacio(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        nombre: 'Quincho',
        ...extra,
      })
    ).espacioId
  const base = () => ({ usuarioId: vecino.id, consorcioId, unidadId: unidadA })

  it('fuera del horario se rechaza con el horario en el mensaje (RF-15)', async () => {
    const id = await nuevoEspacio({ horario: { apertura: 600, cierre: 1380 } })
    await expect(
      reservar(repo, RELOJ, {
        ...base(),
        espacioId: id,
        desde: AR('2026-09-20T08:00'),
        hasta: AR('2026-09-20T10:00'),
      }),
    ).rejects.toThrow('se usa de 10:00 a 23:00')
    await expect(
      reservar(repo, RELOJ, {
        ...base(),
        espacioId: id,
        desde: AR('2026-09-20T11:00'),
        hasta: AR('2026-09-20T13:00'),
      }),
    ).resolves.toHaveProperty('reservaId')
  })

  it('sin horario, una reserva de madrugada se acepta igual que antes', async () => {
    await expect(
      reservar(repo, RELOJ, {
        ...base(),
        espacioId,
        desde: AR('2026-09-20T03:00'),
        hasta: AR('2026-09-20T04:00'),
      }),
    ).resolves.toHaveProperty('reservaId')
  })

  it('con rechazaConDeuda en false, la unidad con deuda vencida reserva (CU-09)', async () => {
    await generarDeudaVencida()
    const id = await nuevoEspacio({ rechazaConDeuda: false })
    await expect(
      reservar(repo, RELOJ, { ...base(), espacioId: id, desde: enHoras(72), hasta: enHoras(74) }),
    ).resolves.toHaveProperty('reservaId')
  })

  it('por defecto, la unidad con deuda sigue rechazada', async () => {
    await generarDeudaVencida()
    await expect(
      reservar(repo, RELOJ, { ...base(), espacioId, desde: enHoras(72), hasta: enHoras(74) }),
    ).rejects.toThrow('tiene deuda vencida')
  })

  it('alta con apertura igual al cierre es EspacioInvalido', async () => {
    await expect(nuevoEspacio({ horario: { apertura: 600, cierre: 600 } })).rejects.toBeInstanceOf(
      EspacioInvalido,
    )
  })

  describe('cambiar el horario con reservas hechas', () => {
    const nuevaReserva = (id: string, desde: string, hasta: string) =>
      prismaBase.reserva.create({
        data: {
          consorcioId,
          espacioId: id,
          unidadId: unidadA,
          solicitadaPor: vecino.id,
          desde: AR(desde),
          hasta: AR(hasta),
        },
      })
    const preparar = async () => {
      const id = await nuevoEspacio({})
      // En curso (desde < ahora = 09:00 AR), futura que no cabe, futura que cabe.
      const enCurso = await nuevaReserva(id, '2026-09-15T08:00', '2026-09-15T10:00')
      const afuera = await nuevaReserva(id, '2026-09-20T21:00', '2026-09-20T22:30')
      const adentro = await nuevaReserva(id, '2026-09-21T12:00', '2026-09-21T14:00')
      return { id, enCurso, afuera, adentro }
    }
    const estado = async (id: string) =>
      (await prismaBase.reserva.findUniqueOrThrow({ where: { id } })).estado
    const datos = (id: string, extra: Record<string, unknown>) => ({
      usuarioId: administrador,
      consorcioId,
      espacioId: id,
      nombre: 'Quincho',
      ...extra,
    })

    it('al achicar el horario se cancelan y avisan solo las futuras que no caben', async () => {
      const { id, enCurso, afuera, adentro } = await preparar()
      const { canceladas } = await editarEspacio(
        repo,
        RELOJ,
        datos(id, { horario: { apertura: 600, cierre: 1200 } }),
      )
      expect(canceladas).toBe(1)
      const cancelada = await prismaBase.reserva.findUniqueOrThrow({ where: { id: afuera.id } })
      expect(cancelada.estado).toBe('cancelada')
      expect(cancelada.motivoRechazo).toBe('Cambió el horario de uso del espacio')
      expect(await estado(adentro.id)).toBe('confirmada')
      expect(await estado(enCurso.id)).toBe('confirmada')
      const avisos = await prismaBase.notificacion.findMany({
        where: { usuarioId: vecino.id, tipo: 'reserva_rechazada', entidadId: afuera.id },
      })
      expect(avisos).toHaveLength(1)
      expect(avisos[0]!.cuerpo).toContain('Quincho')
      expect(avisos[0]!.cuerpo).toContain('de 10:00 a 20:00')
    })

    it('editar sin cambiar el horario no cancela nada', async () => {
      const { id, afuera } = await preparar()
      await editarEspacio(repo, RELOJ, datos(id, { horario: { apertura: 600, cierre: 1200 } }))
      await prismaBase.reserva.update({ where: { id: afuera.id }, data: { estado: 'confirmada' } })
      const { canceladas } = await editarEspacio(
        repo,
        RELOJ,
        datos(id, { horario: { apertura: 600, cierre: 1200 } }),
      )
      expect(canceladas).toBe(0)
      expect(await estado(afuera.id)).toBe('confirmada')
    })

    it('horario undefined conserva el guardado y null lo borra, sin cancelar', async () => {
      const { id, afuera } = await preparar()
      const leer = () => prismaBase.espacioComun.findUniqueOrThrow({ where: { id } })
      await editarEspacio(repo, RELOJ, datos(id, { horario: { apertura: 600, cierre: 1200 } }))
      await prismaBase.reserva.update({ where: { id: afuera.id }, data: { estado: 'confirmada' } })
      await editarEspacio(repo, RELOJ, datos(id, {}))
      expect((await leer()).aperturaMinutos).toBe(600)
      const { canceladas } = await editarEspacio(repo, RELOJ, datos(id, { horario: null }))
      expect(canceladas).toBe(0)
      expect((await leer()).aperturaMinutos).toBeNull()
      expect(await estado(afuera.id)).toBe('confirmada')
    })

    it('contarReservasAfectadas anticipa lo mismo sin escribir', async () => {
      const { id, afuera } = await preparar()
      const n = await contarReservasAfectadas(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        espacioId: id,
        horario: { apertura: 600, cierre: 1200 },
      })
      expect(n).toBe(1)
      expect(await estado(afuera.id)).toBe('confirmada')
    })
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

describe('archivado de espacios (RN-22)', () => {
  const quien = () => ({ usuarioId: administrador, consorcioId, espacioId })
  const reservaVieja = (estado: 'cancelada' | 'confirmada' = 'cancelada') =>
    prismaBase.reserva.create({
      data: {
        consorcioId,
        espacioId,
        unidadId: unidadA,
        solicitadaPor: vecino.id,
        desde: new Date('2026-08-10T21:00:00Z'),
        hasta: new Date('2026-08-11T01:00:00Z'),
        estado,
      },
    })

  it('un espacio sin reservas se borra definitivamente', async () => {
    expect(await eliminarEspacio(repo, RELOJ, quien())).toBe('borrado')
    expect(await prismaBase.espacioComun.findFirst({ where: { id: espacioId } })).toBeNull()
  })

  it('un espacio con historia se archiva y se lista aparte', async () => {
    await reservaVieja()
    expect(await eliminarEspacio(repo, RELOJ, quien())).toBe('archivado')
    expect(await prismaBase.reserva.count({ where: { espacioId } })).toBe(1)
    const datos = { usuarioId: administrador, consorcioId }
    expect(await listarEspacios(repo, RELOJ, { ...datos, incluirInactivos: true })).toEqual([])
    expect(await listarEspaciosArchivados(repo, RELOJ, datos)).toMatchObject([
      { id: espacioId, nombre: 'SUM', reservasEnHistorial: 1 },
    ])
  })

  it('archivar cancela y avisa las reservas futuras', async () => {
    const { reservaId } = await reservar(repo, RELOJ, {
      usuarioId: vecino.id,
      consorcioId,
      espacioId,
      unidadId: unidadA,
      desde: enHoras(72),
      hasta: enHoras(74),
    })
    expect(await eliminarEspacio(repo, RELOJ, quien())).toBe('archivado')
    const reserva = await prismaBase.reserva.findUniqueOrThrow({ where: { id: reservaId } })
    expect(reserva.estado).toBe('cancelada')
    const avisos = await prismaBase.notificacion.findMany({
      where: { usuarioId: vecino.id, entidadId: reservaId, tipo: 'reserva_rechazada' },
    })
    expect(avisos).toHaveLength(1)
  })

  it('el historial conserva el nombre del espacio archivado', async () => {
    await reservaVieja('confirmada')
    await eliminarEspacio(repo, RELOJ, quien())
    const historial = await historialDeReservas(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      desde: new Date('2026-08-01T03:00:00Z'),
      hasta: new Date('2026-09-01T03:00:00Z'),
      unidadId: unidadA,
    })
    expect(historial).toHaveLength(1)
    expect(historial[0]).toMatchObject({ espacio: 'SUM' })
  })

  it('no se reserva ni se edita un archivado', async () => {
    await reservaVieja()
    await eliminarEspacio(repo, RELOJ, quien())
    await expect(
      reservar(repo, RELOJ, {
        usuarioId: vecino.id,
        consorcioId,
        espacioId,
        unidadId: unidadA,
        desde: enHoras(72),
        hasta: enHoras(74),
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
    await expect(editarEspacio(repo, RELOJ, { ...quien(), nombre: 'Otro' })).rejects.toBeInstanceOf(
      NoEncontrado,
    )
  })

  it('un alta con el nombre de un archivado remite a Eliminados', async () => {
    await reservaVieja()
    await eliminarEspacio(repo, RELOJ, quien())
    await expect(
      altaEspacio(repo, RELOJ, { usuarioId: administrador, consorcioId, nombre: 'SUM' }),
    ).rejects.toBeInstanceOf(EspacioArchivadoConEseNombre)
  })

  it('restaurar lo devuelve a la lista; las reservas canceladas siguen canceladas', async () => {
    await reservar(repo, RELOJ, {
      usuarioId: vecino.id,
      consorcioId,
      espacioId,
      unidadId: unidadA,
      desde: enHoras(72),
      hasta: enHoras(74),
    })
    await eliminarEspacio(repo, RELOJ, quien())
    await restaurarEspacio(repo, RELOJ, quien())
    const lista = await listarEspacios(repo, RELOJ, { usuarioId: administrador, consorcioId })
    expect(lista.map((e) => e.id)).toEqual([espacioId])
    const [reserva] = await prismaBase.reserva.findMany({ where: { espacioId } })
    expect(reserva.estado).toBe('cancelada')
  })

  it('un consorcista no restaura', async () => {
    await reservaVieja()
    await eliminarEspacio(repo, RELOJ, quien())
    await expect(
      restaurarEspacio(repo, RELOJ, { ...quien(), usuarioId: vecino.id }),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })
})

describe('esSuperposicion (RN-10)', () => {
  it('toma como choque tanto la exclusion como el deadlock entre dos altas', () => {
    expect(
      esSuperposicion(new Error('violates exclusion constraint "reserva_sin_superposicion"')),
    ).toBe(true)
    expect(esSuperposicion(new Error('Code 23P01'))).toBe(true)
    expect(esSuperposicion(new Error('code: "40P01", message: "deadlock detected"'))).toBe(true)
  })
  it('no confunde otro error con un choque', () => {
    expect(esSuperposicion(new Error('connection refused'))).toBe(false)
    expect(esSuperposicion('23P01')).toBe(false)
  })
})
