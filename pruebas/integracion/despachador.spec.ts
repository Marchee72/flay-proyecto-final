import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Aviso, Notificador } from '@/dominio/contratos/notificador'
import { manejadorNotificacion } from '@/aplicacion/comunicacion/despachar'
import { notificarAhora } from '@/aplicacion/comunicacion/notificar'
import { drenar } from '@/aplicacion/pendientes/drenar'
import { enConsorcio } from '@/infraestructura/cliente-aislado'
import { prismaBase } from '@/infraestructura/prisma'

import { crearAdministradora, crearConsorcio, crearUsuario, limpiar } from './ayudas'

/**
 * El despachador de avisos (`004-servicios` FR-012 a FR-014, research R-07):
 * los avisos que 003 dejo en `pendiente` salen (SC-007), y un correo caido
 * deja el aviso pendiente sin voltear la operacion que lo creo (SC-008).
 */

let consorcioId: string
let usuarioId: string

const notificadorQue = (fn: (aviso: Aviso) => Promise<void>): Notificador => ({
  enviarInvitacion: async () => {},
  enviarNotificacion: fn,
})

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id)).id
  usuarioId = (await crearUsuario('Ada')).id
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await prismaBase.trabajoPendiente.deleteMany({})
  await limpiar()
})

describe('avisos heredados de 003 (SC-007)', () => {
  it('una notificacion pendiente sin trabajo queda encolada por la migracion de datos y sale al drenar', async () => {
    // Como las creaba 003: la fila sola, sin trabajo.
    const huerfana = await prismaBase.notificacion.create({
      data: { usuarioId, tipo: 'liquidacion_publicada', titulo: 'Expensas', cuerpo: 'Publicada.' },
    })
    // La sentencia de la migracion, tal cual, es idempotente: se puede volver a correr.
    await prismaBase.$executeRaw`
      INSERT INTO "TrabajoPendiente" ("tipo", "carga", "estado")
      SELECT 'notificacion', jsonb_build_object('notificacionId', n.id), 'pendiente'
      FROM "Notificacion" n
      WHERE n."estadoEnvio" = 'pendiente'
        AND NOT EXISTS (
          SELECT 1 FROM "TrabajoPendiente" t
          WHERE t.tipo = 'notificacion' AND t.carga ->> 'notificacionId' = n.id::text
        )
    `

    const enviados: Aviso[] = []
    const resultado = await drenar({
      notificacion: manejadorNotificacion(
        notificadorQue(async (aviso) => void enviados.push(aviso)),
      ),
    })

    expect(resultado).toEqual({ despachados: 1, fallidos: 0 })
    expect(enviados).toHaveLength(1)
    expect(enviados[0].titulo).toBe('Expensas')
    const despues = await prismaBase.notificacion.findUniqueOrThrow({ where: { id: huerfana.id } })
    expect(despues.estadoEnvio).toBe('enviada')
    expect(despues.enviadaEn).not.toBeNull()
  })
})

describe('el correo caido no voltea el negocio (SC-008, RNF-14)', () => {
  it('notificar crea la fila y su trabajo juntos; si el envio falla, queda pendiente con reintento', async () => {
    await enConsorcio(consorcioId, () =>
      notificarAhora([{ usuarioId, tipo: 'novedad', titulo: 'Corte de agua', cuerpo: 'Mañana.' }]),
    )

    const trabajos = await prismaBase.trabajoPendiente.findMany({ where: { tipo: 'notificacion' } })
    expect(trabajos).toHaveLength(1)

    const resultado = await drenar({
      notificacion: manejadorNotificacion(
        notificadorQue(async () => {
          throw new Error('el proveedor de correo no responde')
        }),
      ),
    })

    expect(resultado).toEqual({ despachados: 0, fallidos: 1 })
    const [notificacion] = await prismaBase.notificacion.findMany({ where: { usuarioId } })
    expect(notificacion.estadoEnvio).toBe('fallida')
    const [trabajo] = await prismaBase.trabajoPendiente.findMany({
      where: { tipo: 'notificacion' },
    })
    expect(trabajo.estado).toBe('pendiente')
    expect(trabajo.intentos).toBe(1)
    expect(trabajo.ultimoError).toContain('no responde')

    // Al volver el servicio, sale.
    await prismaBase.trabajoPendiente.update({
      where: { id: trabajo.id },
      data: { proximoIntento: new Date(Date.now() - 1000) },
    })
    const segunda = await drenar({
      notificacion: manejadorNotificacion(notificadorQue(async () => {})),
    })
    expect(segunda).toEqual({ despachados: 1, fallidos: 0 })
    const enviada = await prismaBase.notificacion.findUniqueOrThrow({
      where: { id: notificacion.id },
    })
    expect(enviada.estadoEnvio).toBe('enviada')
  })
})
