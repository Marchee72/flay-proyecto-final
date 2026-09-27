import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { marcarLeidas, misNotificaciones } from '@/aplicacion/comunicacion/mis-notificaciones'
import { prismaBase } from '@/infraestructura/prisma'

import { relojFijo } from '../dominio/reloj-fijo'
import { crearUsuario, limpiar } from './ayudas'

/** La campana del panel (`RF-14`, rediseño 013): cada uno ve y marca solo lo suyo. */

const RELOJ = relojFijo('2026-09-26T12:00:00Z')

let ana: string
let beto: string

beforeEach(async () => {
  ana = (await crearUsuario('Ana')).id
  beto = (await crearUsuario('Beto')).id
  await prismaBase.notificacion.createMany({
    data: [
      { usuarioId: ana, tipo: 'novedad', titulo: 'Novedad: Asamblea', cuerpo: 'El jueves' },
      {
        usuarioId: ana,
        tipo: 'cambio_estado_reclamo',
        titulo: 'Tu reclamo pasó a En curso',
        cuerpo: 'Luz de la escalera',
      },
      { usuarioId: beto, tipo: 'novedad', titulo: 'Novedad: Corte de agua', cuerpo: 'Mañana' },
    ],
  })
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await limpiar()
})

describe('mis notificaciones', () => {
  it('cada uno ve solo las suyas, con la cuenta de sin leer', async () => {
    const deAna = await misNotificaciones(ana)
    expect(deAna.noLeidas).toBe(2)
    expect(deAna.notificaciones.map((n) => n.titulo).sort()).toEqual([
      'Novedad: Asamblea',
      'Tu reclamo pasó a En curso',
    ])
    expect(deAna.notificaciones.every((n) => !n.leida)).toBe(true)
  })

  it('marcar una, o todas, no toca las de otro', async () => {
    const [primera] = (await misNotificaciones(ana)).notificaciones
    expect(await marcarLeidas(RELOJ, ana, [primera!.id])).toEqual({ marcadas: 1 })
    expect((await misNotificaciones(ana)).noLeidas).toBe(1)

    // Un id ajeno no se marca aunque venga en el pedido.
    const [deBeto] = (await misNotificaciones(beto)).notificaciones
    expect(await marcarLeidas(RELOJ, ana, [deBeto!.id])).toEqual({ marcadas: 0 })
    expect((await misNotificaciones(beto)).noLeidas).toBe(1)

    expect(await marcarLeidas(RELOJ, ana)).toEqual({ marcadas: 1 })
    expect((await misNotificaciones(ana)).noLeidas).toBe(0)
    expect((await misNotificaciones(beto)).noLeidas).toBe(1)
  })
})
