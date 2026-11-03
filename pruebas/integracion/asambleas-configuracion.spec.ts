import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { guardarConfiguracion, verConfiguracion } from '@/aplicacion/asambleas/configuracion'
import { ConfiguracionInvalida } from '@/aplicacion/asambleas/errores'
import { NoEncontrado, RolInsuficiente } from '@/compartido/errores'
import { prismaBase } from '@/infraestructura/prisma'

import { armarEscenario, asambleaConvocada, HOY, repo, type Escenario } from './asambleas-ayudas'
import { limpiar } from './ayudas'

/** Reglas de asamblea del consorcio (US6, FR-035). */

let e: Escenario
const valores = {
  reglaMayoria: 'totalidad' as const,
  anticipacionDias: 20,
  topeApoderado: 2,
  umbralSinVoto: 3,
}

beforeEach(async () => {
  e = await armarEscenario()
})

afterEach(async () => {
  await limpiar()
})

describe('configuración', () => {
  it('arranca con los valores del reglamento', async () => {
    expect(
      await verConfiguracion(repo, HOY, {
        usuarioId: e.administracion,
        consorcioId: e.consorcioId,
      }),
    ).toEqual({
      reglaMayoria: 'presentes',
      anticipacionDias: 15,
      topeApoderado: 3,
      umbralSinVoto: 2,
    })
  })

  it('guarda valores válidos, queda en la bitácora y rechaza los fuera de rango', async () => {
    await guardarConfiguracion(repo, HOY, {
      ...valores,
      usuarioId: e.administracion,
      consorcioId: e.consorcioId,
    })
    expect(
      await verConfiguracion(repo, HOY, {
        usuarioId: e.administracion,
        consorcioId: e.consorcioId,
      }),
    ).toEqual(valores)
    expect(
      await prismaBase.bitacoraAuditoria.count({
        where: { tabla: 'Consorcio', clave: e.consorcioId },
      }),
    ).toBeGreaterThanOrEqual(1)
    await expect(
      guardarConfiguracion(repo, HOY, {
        ...valores,
        topeApoderado: 11,
        usuarioId: e.administracion,
        consorcioId: e.consorcioId,
      }),
    ).rejects.toBeInstanceOf(ConfiguracionInvalida)
  })

  it('el consejo y los consorcistas no la cambian', async () => {
    for (const usuarioId of [e.consejo, e.ana]) {
      await expect(
        guardarConfiguracion(repo, HOY, { ...valores, usuarioId, consorcioId: e.consorcioId }),
      ).rejects.toBeInstanceOf(RolInsuficiente)
    }
  })

  it('una asamblea ya convocada conserva su copia', async () => {
    const asambleaId = await asambleaConvocada(e)
    await guardarConfiguracion(repo, HOY, {
      ...valores,
      usuarioId: e.administracion,
      consorcioId: e.consorcioId,
    })
    expect(
      await prismaBase.asamblea.findUniqueOrThrow({ where: { id: asambleaId } }),
    ).toMatchObject({
      reglaMayoria: 'presentes',
      topeApoderado: 3,
    })
    const siguiente = await asambleaConvocada(e)
    expect(await prismaBase.asamblea.findUniqueOrThrow({ where: { id: siguiente } })).toMatchObject(
      {
        reglaMayoria: 'totalidad',
        topeApoderado: 2,
        anticipacionDias: 20,
      },
    )
  })

  it('otro consorcio no la ve', async () => {
    await expect(
      verConfiguracion(repo, HOY, { usuarioId: e.ajeno.administrador, consorcioId: e.consorcioId }),
    ).rejects.toBeInstanceOf(NoEncontrado)
  })
})
