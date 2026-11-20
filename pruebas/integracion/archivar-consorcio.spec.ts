import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { guardarCredencialesPago } from '@/aplicacion/administradoras/credenciales-pago'
import {
  ConsorcioConAsambleaEnCurso,
  ConsorcioConPagosEnCurso,
  eliminarConsorcio,
  previaDeEliminarConsorcio,
  restaurarConsorcio,
} from '@/aplicacion/consorcios/archivar-consorcio'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { iniciarPagoEnLinea } from '@/aplicacion/pagos/iniciar-pago-en-linea'
import { periodoPara } from '@/aplicacion/periodos/periodos'
import { ConsorcioArchivado, RolInsuficiente } from '@/compartido/errores'
import { procesadorDePrueba } from '@/infraestructura/pagos/procesador-de-prueba'
import { prismaBase } from '@/infraestructura/prisma'

import { crearUsuario, habilitarEnAdministradora } from './ayudas'
import {
  administrador,
  consorcioId,
  emitirMes,
  inquilino,
  limpiarEscenario,
  prepararEscenario,
  RELOJ,
  repo,
  rubroId,
  unidadA,
} from './ayudas-pago-en-linea'

/**
 * Eliminar un consorcio (RN-22, CCyC 2067): sin movimiento se borra entero; con
 * historia se archiva en solo lectura. Lo hace quien da de alta consorcios.
 */

const HORA = 3_600_000
let jefa: string
const quien = () => ({ usuarioId: jefa, consorcioId })

beforeEach(async () => {
  await prepararEscenario()
  jefa = (await crearUsuario('Jefa')).id
  const { administradoraId } = await prismaBase.consorcio.findUniqueOrThrow({
    where: { id: consorcioId },
  })
  await habilitarEnAdministradora(jefa, administradoraId)
})

afterEach(async () => {
  await prismaBase.$executeRaw`UPDATE "Consorcio" SET archivado_en = NULL`
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await prismaBase.asamblea.deleteMany({})
  await limpiarEscenario()
})

const gasto = async () => {
  const { periodoId } = await periodoPara(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    anio: 2026,
    mes: 2,
  })
  return registrarGasto(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    periodoId,
    rubroId,
    importe: '100.00',
    fecha: new Date('2026-02-03'),
    descripcion: 'Limpieza',
  })
}

const intento = async (datos: { estado: 'iniciado' | 'vencido'; venceEn: Date }) => {
  const { liquidacionId } = await emitirMes(1)
  const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
    where: { liquidacionId, unidadId: unidadA },
  })
  return prismaBase.intentoDePago.create({
    data: {
      consorcioId,
      unidadId: unidadA,
      detalleLiquidacionId: detalle.id,
      importe: '500.00',
      iniciadoPor: inquilino,
      ...datos,
    },
  })
}

const asamblea = async (estados: ('convocada' | 'en_curso' | 'finalizada')[]) => {
  const { id } = await prismaBase.asamblea.create({
    data: {
      consorcioId,
      tipo: 'ordinaria',
      titulo: 'Asamblea',
      fechaHora: new Date('2026-02-25T22:00:00Z'),
      lugar: 'SUM',
      organizadorId: administrador,
    },
  })
  for (const estado of estados) {
    await prismaBase.asamblea.update({
      where: { id },
      data: { estado, ...(estado === 'en_curso' ? { constituidaEn: new Date() } : {}) },
    })
  }
}

describe('eliminar un consorcio (RN-22)', () => {
  it('un consorcio sin movimiento se borra', async () => {
    await prismaBase.espacioComun.create({ data: { consorcioId, nombre: 'SUM' } })
    await prismaBase.proveedor.create({
      data: { consorcioId, razonSocial: 'Ascensores SA', cuit: '30-71234567-1' },
    })
    await prismaBase.tramoVencimiento.create({
      data: { consorcioId, orden: 1, diaDelMes: 10, recargoPorcentaje: '0' },
    })
    await prismaBase.conversacionAsistente.create({ data: { consorcioId, usuarioId: inquilino } })

    expect(await previaDeEliminarConsorcio(repo, RELOJ, quien())).toEqual({
      accion: 'borrar',
      pagosEnCurso: 0,
      asambleasEnCurso: 0,
      reservasFuturas: 0,
    })
    expect(await eliminarConsorcio(repo, RELOJ, quien())).toBe('borrado')

    const tablas = await prismaBase.$queryRaw<{ t: string }[]>`
      SELECT c.table_name AS t FROM information_schema.columns c
      JOIN information_schema.tables t USING (table_schema, table_name)
      WHERE c.table_schema = 'public' AND c.column_name = 'consorcio_id' AND t.table_type = 'BASE TABLE'`
    for (const { t } of tablas) {
      const [{ n }] = await prismaBase.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${t}" WHERE consorcio_id = $1::uuid`,
        consorcioId,
      )
      expect([t, Number(n)]).toEqual([t, 0])
    }
    expect(await prismaBase.consorcio.count({ where: { id: consorcioId } })).toBe(0)
    expect(await prismaBase.coeficienteHistorico.count({ where: { unidadId: unidadA } })).toBe(0)
    const [{ n }] = await prismaBase.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "BitacoraAuditoria"
      WHERE tabla = 'Consorcio' AND clave = ${consorcioId} AND operacion = 'BORRA'`
    expect(Number(n)).toBe(1)
  })

  it('con un gasto se archiva', async () => {
    await gasto()
    expect(await eliminarConsorcio(repo, RELOJ, quien())).toBe('archivado')
    const mios = await misConsorcios(repo, RELOJ, administrador)
    expect(mios.find((c) => c.id === consorcioId)?.archivadoEn).toBe(RELOJ.ahora().toISOString())
    await expect(gasto()).rejects.toBeInstanceOf(ConsorcioArchivado)
  })

  it('pago en línea abierto bloquea', async () => {
    const abierto = await intento({
      estado: 'iniciado',
      venceEn: new Date(RELOJ.ahora().getTime() + HORA),
    })
    expect(await previaDeEliminarConsorcio(repo, RELOJ, quien())).toEqual({
      accion: 'archivar',
      pagosEnCurso: 1,
      asambleasEnCurso: 0,
      reservasFuturas: 0,
    })
    const error = await eliminarConsorcio(repo, RELOJ, quien()).catch((e) => e)
    expect(error).toBeInstanceOf(ConsorcioConPagosEnCurso)
    expect(error.mensajeParaUsuario).toBe(
      'Hay 1 pagos en línea sin confirmar; podés archivar cuando terminen.',
    )

    await prismaBase.intentoDePago.update({
      where: { id: abierto.id },
      data: { estado: 'vencido' },
    })
    expect(await eliminarConsorcio(repo, RELOJ, quien())).toBe('archivado')
  })

  it('un intento iniciado vencido hace más de 72 h no bloquea', async () => {
    await intento({ estado: 'iniciado', venceEn: new Date(RELOJ.ahora().getTime() - 73 * HORA) })
    expect(await eliminarConsorcio(repo, RELOJ, quien())).toBe('archivado')
  })

  it('asamblea convocada bloquea', async () => {
    await asamblea(['convocada'])
    const error = await eliminarConsorcio(repo, RELOJ, quien()).catch((e) => e)
    expect(error).toBeInstanceOf(ConsorcioConAsambleaEnCurso)
    expect(error.mensajeParaUsuario).toBe(
      'Hay una asamblea convocada o en curso; podés archivar cuando termine.',
    )
  })

  it('una asamblea finalizada no bloquea', async () => {
    await asamblea(['convocada', 'en_curso', 'finalizada'])
    expect(await eliminarConsorcio(repo, RELOJ, quien())).toBe('archivado')
  })

  it('cancela reservas futuras con aviso', async () => {
    const espacio = await prismaBase.espacioComun.create({ data: { consorcioId, nombre: 'SUM' } })
    const reserva = await prismaBase.reserva.create({
      data: {
        consorcioId,
        espacioId: espacio.id,
        unidadId: unidadA,
        solicitadaPor: inquilino,
        desde: new Date(RELOJ.ahora().getTime() + 48 * HORA),
        hasta: new Date(RELOJ.ahora().getTime() + 50 * HORA),
      },
    })
    expect((await previaDeEliminarConsorcio(repo, RELOJ, quien())).reservasFuturas).toBe(1)
    expect(await eliminarConsorcio(repo, RELOJ, quien())).toBe('archivado')

    const despues = await prismaBase.reserva.findUniqueOrThrow({ where: { id: reserva.id } })
    expect(despues.estado).toBe('cancelada')
    const avisos = await prismaBase.notificacion.findMany({
      where: { usuarioId: inquilino, entidadId: reserva.id, tipo: 'reserva_rechazada' },
    })
    expect(avisos).toHaveLength(1)
  })

  const pagoEnLinea = async () => {
    await guardarCredencialesPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      accessToken: 'TEST-TOKEN-1234',
      secretoWebhook: 'WEBHOOK-SECRET-1234',
    })
    const { liquidacionId } = await emitirMes(1)
    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId, unidadId: unidadA },
    })
    return () =>
      iniciarPagoEnLinea(repo, RELOJ, procesadorDePrueba, {
        usuarioId: inquilino,
        consorcioId,
        detalleLiquidacionId: detalle.id,
        urlBaseRetorno: 'http://localhost:3000/expensas',
      })
  }

  it('carrera con un pago: nunca quedan archivado y un intento nuevo', async () => {
    const iniciar = await pagoEnLinea()

    const [eliminado, iniciado] = await Promise.allSettled([
      eliminarConsorcio(repo, RELOJ, quien()),
      iniciar(),
    ])

    const { archivadoEn } = await prismaBase.consorcio.findUniqueOrThrow({
      where: { id: consorcioId },
    })
    const intentos = await prismaBase.intentoDePago.count({
      where: { consorcioId, estado: 'iniciado' },
    })
    expect(archivadoEn !== null && intentos > 0).toBe(false)
    // Exactamente uno de los dos gana; el otro dice por qué.
    expect([eliminado.status, iniciado.status].filter((s) => s === 'fulfilled')).toHaveLength(1)
    if (eliminado.status === 'rejected') {
      expect(eliminado.reason).toBeInstanceOf(ConsorcioConPagosEnCurso)
    }
    if (iniciado.status === 'rejected') {
      expect(iniciado.reason).toBeInstanceOf(ConsorcioArchivado)
    }
  })

  it('un pago que llega mientras se archiva espera al candado y no nace', async () => {
    const iniciar = await pagoEnLinea()
    // Hace de `eliminarConsorcio` a mitad de camino: tiene la fila y todavía
    // no archivó. Sin el FOR SHARE, el intento nacería en ese hueco.
    let iniciado!: Promise<unknown>
    await prismaBase.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "Consorcio" WHERE id = ${consorcioId}::uuid FOR UPDATE`
        iniciado = iniciar()
        iniciado.catch(() => {})
        await new Promise((listo) => setTimeout(listo, 1500))
        await tx.$executeRaw`UPDATE "Consorcio" SET archivado_en = now() WHERE id = ${consorcioId}::uuid`
      },
      { timeout: 10_000 },
    )
    await expect(iniciado).rejects.toBeInstanceOf(ConsorcioArchivado)
    expect(await prismaBase.intentoDePago.count({ where: { consorcioId } })).toBe(0)
  })

  it('solo el nivel administradora', async () => {
    const delConsorcio = { usuarioId: administrador, consorcioId }
    await expect(eliminarConsorcio(repo, RELOJ, delConsorcio)).rejects.toBeInstanceOf(
      RolInsuficiente,
    )
    await expect(previaDeEliminarConsorcio(repo, RELOJ, delConsorcio)).rejects.toBeInstanceOf(
      RolInsuficiente,
    )
    await expect(restaurarConsorcio(repo, RELOJ, delConsorcio)).rejects.toBeInstanceOf(
      RolInsuficiente,
    )
  })

  it('restaurar vuelve a aceptar gastos', async () => {
    await gasto()
    await eliminarConsorcio(repo, RELOJ, quien())
    await restaurarConsorcio(repo, RELOJ, quien())
    await expect(gasto()).resolves.toBeTruthy()
  })
})
