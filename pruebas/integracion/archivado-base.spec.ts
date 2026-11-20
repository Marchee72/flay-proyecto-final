import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { altaEspacio, listarEspacios } from '@/aplicacion/reservas/espacios'
import { ConsorcioArchivado } from '@/compartido/errores'
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

/** RN-22: la base rechaza escribir en un consorcio archivado, salvo las excepciones. */
let consorcioId: string

const archivar = () =>
  prismaBase.$executeRaw`UPDATE "Consorcio" SET archivado_en = now() WHERE id = ${consorcioId}::uuid`
const restaurar = () =>
  prismaBase.$executeRaw`UPDATE "Consorcio" SET archivado_en = NULL WHERE id = ${consorcioId}::uuid`
const nuevoProveedor = () =>
  prismaBase.proveedor.create({
    data: {
      consorcioId,
      razonSocial: 'Ascensores SA',
      cuit: `30-${crypto.randomUUID().slice(0, 8)}-1`,
    },
  })

beforeEach(async () => {
  await limpiar()
  consorcioId = (await crearConsorcio((await crearAdministradora()).id)).id
})
afterEach(limpiar)

describe('candado de consorcio archivado (RN-22)', () => {
  it('toda tabla con consorcio_id tiene el candado, salvo las excepciones', async () => {
    const sin = await prismaBase.$queryRaw<{ t: string }[]>`
      SELECT c.table_name AS t FROM information_schema.columns c
      JOIN information_schema.tables t USING (table_schema, table_name)
      WHERE c.table_schema = 'public' AND c.column_name = 'consorcio_id' AND t.table_type = 'BASE TABLE'
        AND NOT EXISTS (SELECT 1 FROM information_schema.triggers g
          WHERE g.event_object_schema = 'public' AND g.event_object_table = c.table_name
            AND g.trigger_name = 'consorcio_no_archivado')
      ORDER BY 1`
    expect(sin.map((f) => f.t)).toEqual([
      'ConsultaDocumental',
      'ConversacionAsistente',
      'Habilitacion',
      'Notificacion',
    ])
  })

  /**
   * Toda tabla sin `consorcio_id` decide cómo la alcanza el candado: con su
   * propio disparador que mira al padre, porque su padre se escribe en la misma
   * transacción, por excepción deliberada, o porque no es de un consorcio.
   */
  const SIN_CONSORCIO_ID: Record<string, 'disparador' | 'padre' | 'excepcion' | 'global'> = {
    Comprobante: 'disparador', // subirComprobante/confirmar no tocan el Gasto
    Ocupacion: 'disparador', // registrarOcupacion e invitarPersona no tocan la Unidad
    SugerenciaReclamo: 'disparador', // el triage escribe sin tocar el Reclamo
    FragmentoDocumento: 'disparador', // la indexación escribe antes de marcar el documento
    CoeficienteHistorico: 'padre', // siempre con la Unidad en la misma transacción
    InteresLiquidado: 'padre', // nace con la Liquidacion
    VencimientoLiquidacion: 'padre', // nace con la Liquidacion
    PagoImputacion: 'padre', // nace con el Pago; se revierte al anular la Liquidacion
    ReclamoHistorial: 'padre', // cada transición actualiza el Reclamo
    DetalleLiquidacion: 'excepcion', // el PDF de la expensa escribe su clave: se sigue entregando
    MensajeAsistente: 'excepcion', // como ConversacionAsistente: consultar es leer
    NovedadDescartada: 'excepcion', // como marcar leído un aviso, no es operar
    Administradora: 'global',
    BitacoraAuditoria: 'global',
    Consorcio: 'global', // archivar y restaurar escriben acá
    CredencialPagoAdministradora: 'global',
    HabilitacionAdministradora: 'global',
    HabilitacionPlataforma: 'global',
    IntentoInicioSesion: 'global',
    Persona: 'global',
    RefrescoIndicadores: 'global',
    RubroGasto: 'global',
    TrabajoPendiente: 'global',
    Usuario: 'global',
  }

  it('toda tabla sin consorcio_id está clasificada, y las de disparador lo tienen', async () => {
    const tablas = await prismaBase.$queryRaw<{ t: string; candado: boolean }[]>`
      SELECT t.table_name AS t, EXISTS (SELECT 1 FROM information_schema.triggers g
          WHERE g.event_object_schema = 'public' AND g.event_object_table = t.table_name
            AND g.trigger_name = 'consorcio_no_archivado') AS candado
      FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        AND t.table_name <> '_prisma_migrations'
        AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = t.table_name
            AND c.column_name = 'consorcio_id')
      ORDER BY 1`
    expect(tablas.map((f) => f.t)).toEqual(Object.keys(SIN_CONSORCIO_ID).sort())
    expect(tablas.filter((f) => f.candado).map((f) => f.t)).toEqual(
      Object.keys(SIN_CONSORCIO_ID)
        .filter((t) => SIN_CONSORCIO_ID[t] === 'disparador')
        .sort(),
    )
  })

  it('una tabla hija sin consorcio_id rechaza por su padre archivado', async () => {
    const unidad = await prismaBase.unidad.create({
      data: { consorcioId, designacion: '1A', coeficiente: '100.00000000' },
    })
    const persona = await prismaBase.persona.create({ data: { nombre: 'Ana', apellido: 'Paz' } })
    const reclamo = await prismaBase.reclamo.create({
      data: { consorcioId, creadoPor: persona.id, titulo: 'Gotera', descripcion: 'En el 1A' },
    })
    await archivar()
    await expect(
      prismaBase.$executeRaw`INSERT INTO "Ocupacion" (unidad_id, persona_id, tipo, vigencia)
        VALUES (${unidad.id}::uuid, ${persona.id}::uuid, 'propietario', daterange('2026-01-01', NULL))`,
    ).rejects.toThrow(/Este consorcio está archivado/)
    await expect(
      prismaBase.sugerenciaReclamo.create({ data: { reclamoId: reclamo.id } }),
    ).rejects.toThrow(/Este consorcio está archivado/)
    await restaurar()
    await expect(
      prismaBase.sugerenciaReclamo.create({ data: { reclamoId: reclamo.id } }),
    ).resolves.toBeTruthy()
  })

  it('rechaza escribir en un consorcio archivado', async () => {
    await archivar()
    await expect(nuevoProveedor()).rejects.toThrow(/Este consorcio está archivado/)
  })

  it('rechaza borrar en un consorcio archivado', async () => {
    const espacio = await prismaBase.espacioComun.create({ data: { consorcioId, nombre: 'SUM' } })
    await archivar()
    await expect(prismaBase.espacioComun.delete({ where: { id: espacio.id } })).rejects.toThrow(
      /Este consorcio está archivado/,
    )
  })

  it('una excepción sigue escribiendo', async () => {
    const usuario = await crearUsuario()
    await archivar()
    await expect(habilitarEnConsorcio(usuario.id, consorcioId, 'consorcista')).resolves.toBeTruthy()
  })

  it('restaurar vuelve a dejar escribir', async () => {
    await archivar()
    await restaurar()
    await expect(nuevoProveedor()).resolves.toBeTruthy()
  })

  it('audita el espacio y el documento', async () => {
    const espacio = await prismaBase.espacioComun.create({ data: { consorcioId, nombre: 'SUM' } })
    const filas = await prismaBase.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "BitacoraAuditoria"
      WHERE tabla = 'EspacioComun' AND clave = ${espacio.id}`
    expect(Number(filas[0].n)).toBeGreaterThan(0)
  })
})

describe('ConsorcioArchivado en los casos de uso (RN-22, RNF-10)', () => {
  const RELOJ = relojFijo('2026-09-15T12:00:00Z')

  it('una escritura devuelve ConsorcioArchivado y leer sigue funcionando', async () => {
    const admin = await crearUsuario()
    await habilitarEnConsorcio(admin.id, consorcioId, 'administrador')
    await archivar()
    const datos = { usuarioId: admin.id, consorcioId }
    await expect(
      altaEspacio(repositorioHabilitaciones, RELOJ, { ...datos, nombre: 'SUM' }),
    ).rejects.toBeInstanceOf(ConsorcioArchivado)
    await expect(listarEspacios(repositorioHabilitaciones, RELOJ, datos)).resolves.toEqual([])
  })
})
