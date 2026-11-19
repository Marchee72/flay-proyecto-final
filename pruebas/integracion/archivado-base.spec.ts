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
afterEach(async () => {
  await prismaBase.$executeRaw`UPDATE "Consorcio" SET archivado_en = NULL`
  await limpiar()
})

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
