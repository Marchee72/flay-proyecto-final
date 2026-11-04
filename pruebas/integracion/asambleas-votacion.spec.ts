import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  abrir,
  abrirPunto,
  acreditar,
  acreditarme,
  cerrarPunto,
  constituir,
  designarAutoridades,
  finalizar,
} from '@/aplicacion/asambleas/conducir'
import {
  AntesDeHora,
  AutoridadSinUsuario,
  NoConstituida,
  NoPuedeDirigir,
  NoRepresenta,
  PuntosSinCerrar,
  ReglaDeAsamblea,
  SinQuorum,
  UnidadYaAcreditada,
  UnidadYaVoto,
} from '@/aplicacion/asambleas/errores'
import { verAsamblea } from '@/aplicacion/asambleas/ver'
import { cargarVoto, votar } from '@/aplicacion/asambleas/votar'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { registrarPago } from '@/aplicacion/pagos/registrar'
import { periodoPara } from '@/aplicacion/periodos/periodos'
import { NoEncontrado } from '@/compartido/errores'
import { prismaBase } from '@/infraestructura/prisma'

import {
  armarEscenario,
  asambleaConvocada,
  enLaReunion,
  HOY,
  repo,
  type Escenario,
} from './asambleas-ayudas'
import { limpiar } from './ayudas'

/**
 * Conducir la reunión y votar (US2, FR-015 a FR-026, SC-002, SC-003, SC-005).
 * La inmutabilidad se prueba también por SQL directo: la frena la base.
 */

let e: Escenario
let asambleaId: string
let puntoBinario: string
let puntoOpciones: string
const RELOJ = enLaReunion(5)

const de = (usuarioId: string) => ({ usuarioId, consorcioId: e.consorcioId, asambleaId })

beforeEach(async () => {
  e = await armarEscenario()
  asambleaId = await asambleaConvocada(e)
  const puntos = await prismaBase.puntoAsamblea.findMany({
    where: { asambleaId },
    orderBy: { orden: 'asc' },
  })
  puntoBinario = puntos[0].id
  puntoOpciones = puntos[1].id
})

afterEach(async () => {
  await limpiar()
})

/** Abre, acredita a Ana (1A), Bruno (1B) y Carla (2A) —90 %—, designa y constituye. */
async function constituida() {
  await abrir(repo, RELOJ, de(e.consejo))
  for (const u of [e.ana, e.bruno, e.carla]) await acreditarme(repo, RELOJ, de(u))
  await designarAutoridades(repo, RELOJ, {
    ...de(e.consejo),
    presidenteId: e.ana,
    secretarioId: e.bruno,
  })
  await constituir(repo, RELOJ, de(e.consejo))
}

describe('abrir y acreditar', () => {
  it('no se abre antes de la hora', async () => {
    await expect(abrir(repo, enLaReunion(-10), de(e.consejo))).rejects.toBeInstanceOf(AntesDeHora)
  })

  it('abrir congela el padrón: cambiar un coeficiente después no lo mueve', async () => {
    await abrir(repo, RELOJ, de(e.consejo))
    await prismaBase.$executeRaw`UPDATE "Unidad" SET coeficiente = coeficiente WHERE id = ${e.unidades['1A']}::uuid`
    const padron = await prismaBase.unidadEnAsamblea.findMany({ where: { asambleaId } })
    expect(padron).toHaveLength(4)
    expect(padron.find((u) => u.unidadId === e.unidades['1A'])!.coeficiente.toFixed(8)).toBe(
      '40.00000000',
    )
    await expect(
      prismaBase.$executeRaw`UPDATE "UnidadEnAsamblea" SET coeficiente = 1 WHERE asamblea_id = ${asambleaId}::uuid`,
    ).rejects.toThrow(/se congela/)
  })

  it('la primera acreditación gana; la segunda falla', async () => {
    await abrir(repo, RELOJ, de(e.consejo))
    await acreditarme(repo, RELOJ, de(e.ana))
    await expect(acreditarme(repo, RELOJ, de(e.ana))).rejects.toBeInstanceOf(UnidadYaAcreditada)
    await expect(
      acreditar(repo, RELOJ, {
        ...de(e.consejo),
        unidadId: e.unidades['1A'],
        nombre: 'Otra persona',
        representacion: 'propietario',
      }),
    ).rejects.toBeInstanceOf(UnidadYaAcreditada)
  })

  it('un inquilino sin poder no se acredita', async () => {
    await abrir(repo, RELOJ, de(e.consejo))
    await expect(acreditarme(repo, RELOJ, de(e.ivan))).rejects.toBeInstanceOf(NoRepresenta)
  })

  it('quien dirige acredita a una persona sin cuenta', async () => {
    await abrir(repo, RELOJ, de(e.consejo))
    await acreditar(repo, RELOJ, {
      ...de(e.consejo),
      unidadId: e.unidades['2B'],
      nombre: 'Dora Diaz',
      representacion: 'propietario',
    })
    const fila = await prismaBase.unidadEnAsamblea.findFirstOrThrow({
      where: { asambleaId, unidadId: e.unidades['2B'] },
    })
    expect(fila).toMatchObject({
      presente: true,
      representanteNombre: 'Dora Diaz',
      representanteId: null,
    })
  })

  it('presidente y secretario tienen que ser presentes con usuario', async () => {
    await abrir(repo, RELOJ, de(e.consejo))
    await acreditarme(repo, RELOJ, de(e.ana))
    await acreditar(repo, RELOJ, {
      ...de(e.consejo),
      unidadId: e.unidades['2B'],
      nombre: 'Dora Diaz',
      representacion: 'propietario',
    })
    await expect(
      designarAutoridades(repo, RELOJ, { ...de(e.consejo), presidenteId: e.ana, secretarioId: '' }),
    ).rejects.toBeInstanceOf(AutoridadSinUsuario)
  })
})

describe('quórum', () => {
  it('sin quórum en primera falla; en segunda constituye con los presentes', async () => {
    await abrir(repo, RELOJ, de(e.consejo))
    await acreditarme(repo, RELOJ, de(e.bruno)) // 30 %
    await acreditarme(repo, RELOJ, de(e.carla)) // 20 %
    await designarAutoridades(repo, RELOJ, {
      ...de(e.consejo),
      presidenteId: e.bruno,
      secretarioId: e.carla,
    })
    await expect(constituir(repo, RELOJ, de(e.consejo))).rejects.toBeInstanceOf(SinQuorum)
    expect(await constituir(repo, enLaReunion(31), de(e.consejo))).toEqual({ rige: 'segunda' })
  })

  it('no se abre un punto sin constituir', async () => {
    await abrir(repo, RELOJ, de(e.consejo))
    await expect(
      abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntoBinario }),
    ).rejects.toBeInstanceOf(NoConstituida)
  })
})

describe('votación', () => {
  it('un voto por unidad: se cambia con el punto abierto y queda firme al cerrarlo', async () => {
    await constituida()
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntoBinario })
    const voto = { puntoId: puntoBinario, unidadId: e.unidades['1A'] }
    await votar(repo, RELOJ, { ...de(e.ana), ...voto, eleccion: { sentido: 'positivo' } })
    await votar(repo, RELOJ, { ...de(e.ana), ...voto, eleccion: { sentido: 'negativo' } })

    const vista = await verAsamblea(repo, RELOJ, de(e.consejo))
    const votos = vista.puntos.find((p) => p.id === puntoBinario)?.votos
    expect(votos).toHaveLength(1)
    expect(votos?.[0]?.clave).toBe('negativo')
    const { id } = await prismaBase.votoAsamblea.findFirstOrThrow({
      where: { puntoId: puntoBinario },
    })
    expect(
      await prismaBase.bitacoraAuditoria.count({
        where: { tabla: 'VotoAsamblea', clave: id, operacion: 'MODIFICA' },
      }),
    ).toBe(1)

    await expect(
      prismaBase.$executeRaw`UPDATE "VotoAsamblea" SET unidad_id = ${e.unidades['1B']}::uuid WHERE punto_id = ${puntoBinario}::uuid`,
    ).rejects.toThrow(/no se puede modificar/)
    await expect(
      prismaBase.$executeRaw`DELETE FROM "VotoAsamblea" WHERE punto_id = ${puntoBinario}::uuid`,
    ).rejects.toThrow(/no se puede borrar/)

    await cerrarPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntoBinario })
    await expect(
      votar(repo, RELOJ, { ...de(e.ana), ...voto, eleccion: { sentido: 'positivo' } }),
    ).rejects.toThrow(/no está en votación/)
    await expect(
      prismaBase.$executeRaw`UPDATE "VotoAsamblea" SET sentido = 'positivo' WHERE punto_id = ${puntoBinario}::uuid`,
    ).rejects.toThrow(/no se puede modificar/)
  })

  it('quien dirige no pisa el voto que una unidad emitió por sí misma (FR-022)', async () => {
    await constituida()
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntoBinario })
    const unidadId = e.unidades['1A']
    await votar(repo, RELOJ, {
      ...de(e.ana),
      puntoId: puntoBinario,
      unidadId,
      eleccion: { sentido: 'positivo' },
    })
    await expect(
      cargarVoto(repo, RELOJ, {
        ...de(e.consejo),
        puntoId: puntoBinario,
        unidadId,
        eleccion: { sentido: 'negativo' },
      }),
    ).rejects.toBeInstanceOf(UnidadYaVoto)
    const vista = await verAsamblea(repo, RELOJ, de(e.consejo))
    expect(vista.puntos.find((p) => p.id === puntoBinario)?.votos[0]?.clave).toBe('positivo')
  })

  it('nadie vota por una unidad que no representa ni un punto que no está abierto', async () => {
    await constituida()
    await expect(
      votar(repo, RELOJ, {
        ...de(e.ana),
        puntoId: puntoBinario,
        unidadId: e.unidades['1A'],
        eleccion: { sentido: 'positivo' },
      }),
    ).rejects.toBeInstanceOf(ReglaDeAsamblea)
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntoBinario })
    await expect(
      votar(repo, RELOJ, {
        ...de(e.ana),
        puntoId: puntoBinario,
        unidadId: e.unidades['1B'],
        eleccion: { sentido: 'positivo' },
      }),
    ).rejects.toBeInstanceOf(NoRepresenta)
  })

  it('caso testigo: cierra con el resultado y el conteo exactos', async () => {
    await constituida()
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntoBinario })
    await votar(repo, RELOJ, {
      ...de(e.ana),
      puntoId: puntoBinario,
      unidadId: e.unidades['1A'],
      eleccion: { sentido: 'positivo' },
    })
    await votar(repo, RELOJ, {
      ...de(e.bruno),
      puntoId: puntoBinario,
      unidadId: e.unidades['1B'],
      eleccion: { sentido: 'negativo' },
    })
    await cargarVoto(repo, RELOJ, {
      ...de(e.consejo),
      puntoId: puntoBinario,
      unidadId: e.unidades['2A'],
      eleccion: { sentido: 'abstencion' },
    })

    const enVivo = await verAsamblea(repo, RELOJ, de(e.ivan))
    expect(enVivo.puntos[0].conteo!.porOpcion.positivo).toEqual({
      unidades: 1,
      coeficiente: '40.00000000',
    })
    expect(enVivo.puntos[0].votos.find((v) => v.designacion === '2A')).toMatchObject({
      cargaManual: true,
    })

    await cerrarPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntoBinario })
    const punto = await prismaBase.puntoAsamblea.findUniqueOrThrow({ where: { id: puntoBinario } })
    expect(punto).toMatchObject({ estado: 'cerrado', resultado: 'rechazado', provisorio: false })

    await expect(
      votar(repo, RELOJ, {
        ...de(e.carla),
        puntoId: puntoBinario,
        unidadId: e.unidades['2A'],
        eleccion: { sentido: 'positivo' },
      }),
    ).rejects.toThrow()
    await expect(
      prismaBase.$executeRaw`UPDATE "PuntoAsamblea" SET resultado = 'aprobado' WHERE id = ${puntoBinario}::uuid`,
    ).rejects.toThrow(/se fija al cerrarlo/)
  })

  it('opción múltiple: gana la más votada en los dos cómputos', async () => {
    await constituida()
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntoBinario })
    await cerrarPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntoBinario })
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntoOpciones })
    const opciones = await prismaBase.opcionPunto.findMany({
      where: { puntoId: puntoOpciones },
      orderBy: { orden: 'asc' },
    })
    await votar(repo, RELOJ, {
      ...de(e.ana),
      puntoId: puntoOpciones,
      unidadId: e.unidades['1A'],
      eleccion: { opcionId: opciones[1].id },
    })
    await votar(repo, RELOJ, {
      ...de(e.bruno),
      puntoId: puntoOpciones,
      unidadId: e.unidades['1B'],
      eleccion: { opcionId: opciones[1].id },
    })
    await votar(repo, RELOJ, {
      ...de(e.carla),
      puntoId: puntoOpciones,
      unidadId: e.unidades['2A'],
      eleccion: { opcionId: opciones[0].id },
    })
    await cerrarPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntoOpciones })
    const punto = await prismaBase.puntoAsamblea.findUniqueOrThrow({ where: { id: puntoOpciones } })
    expect(punto).toMatchObject({ resultado: 'aprobado', opcionGanadoraId: opciones[1].id })
  })
})

describe('finalizar', () => {
  it('con puntos sin cerrar falla; finalizada, nada cambia', async () => {
    await constituida()
    await expect(finalizar(repo, RELOJ, de(e.consejo))).rejects.toBeInstanceOf(PuntosSinCerrar)
    for (const puntoId of [puntoBinario, puntoOpciones]) {
      await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId })
      await cerrarPunto(repo, RELOJ, { ...de(e.consejo), puntoId })
    }
    await finalizar(repo, RELOJ, de(e.consejo))
    expect(await prismaBase.actaAsamblea.count({ where: { asambleaId } })).toBe(1)
    await expect(
      prismaBase.$executeRaw`UPDATE "UnidadEnAsamblea" SET presente = false WHERE asamblea_id = ${asambleaId}::uuid`,
    ).rejects.toThrow(/en curso/)
    await expect(
      prismaBase.$executeRaw`UPDATE "Asamblea" SET estado = 'en_curso' WHERE id = ${asambleaId}::uuid`,
    ).rejects.toThrow(/no puede pasar/)
  })
})

describe('mora sin voto (FR-018)', () => {
  it('la unidad con más de dos expensas impagas cuenta para el quórum pero no vota', async () => {
    const rubroId = (
      await prismaBase.rubroGasto.upsert({
        where: { nombre: 'Rubro de prueba' },
        update: {},
        create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
      })
    ).id
    const admin = { usuarioId: e.administracion, consorcioId: e.consorcioId }
    for (const mes of [1, 2, 3]) {
      const { periodoId } = await periodoPara(repo, HOY, { ...admin, anio: 2026, mes })
      await registrarGasto(repo, HOY, {
        ...admin,
        periodoId,
        rubroId,
        importe: '1000.00',
        fecha: new Date(`2026-0${mes}-05`),
        descripcion: 'Gasto',
      })
      await cerrarPeriodo(repo, HOY, { ...admin, periodoId })
      await liquidarPeriodo(repo, HOY, { ...admin, periodoId })
    }
    for (const unidad of ['1A', '1B', '2A'] as const) {
      await registrarPago(repo, HOY, {
        ...admin,
        unidadId: e.unidades[unidad],
        importe: '100000.00',
        fechaPago: new Date('2026-11-01'),
        medio: 'transferencia',
      })
    }

    await abrir(repo, RELOJ, de(e.consejo))
    const padron = await prismaBase.unidadEnAsamblea.findMany({ where: { asambleaId } })
    expect(padron.filter((u) => u.sinVoto).map((u) => u.designacion)).toEqual(['2B'])

    await acreditar(repo, RELOJ, {
      ...de(e.consejo),
      unidadId: e.unidades['2B'],
      nombre: 'Dora Diaz',
      representacion: 'propietario',
    })
    await acreditarme(repo, RELOJ, de(e.ana))
    // 40 + 10 = 50 %: la morosa presente suma al quórum.
    expect((await verAsamblea(repo, RELOJ, de(e.consejo))).quorum.coeficientePresente).toBe(
      '50.00000000',
    )
    await expect(
      designarAutoridades(repo, RELOJ, {
        ...de(e.consejo),
        presidenteId: e.ana,
        secretarioId: e.ana,
      }),
    ).rejects.toThrow(/distintas/)
    await acreditarme(repo, RELOJ, de(e.carla))
    await designarAutoridades(repo, RELOJ, {
      ...de(e.consejo),
      presidenteId: e.ana,
      secretarioId: e.carla,
    })
    await constituir(repo, RELOJ, de(e.consejo))
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntoBinario })
    await expect(
      cargarVoto(repo, RELOJ, {
        ...de(e.consejo),
        puntoId: puntoBinario,
        unidadId: e.unidades['2B'],
        eleccion: { sentido: 'positivo' },
      }),
    ).rejects.toThrow(/no tiene voto/)
  })
})

describe('autorización y aislamiento', () => {
  it('la administración no invitada no abre ni carga votos', async () => {
    const otra = await asambleaConvocada(e, { administracionInvitada: false })
    await expect(
      abrir(repo, RELOJ, {
        usuarioId: e.administracion,
        consorcioId: e.consorcioId,
        asambleaId: otra,
      }),
    ).rejects.toBeInstanceOf(NoPuedeDirigir)
  })

  it('un usuario de otro consorcio no vota ni ve', async () => {
    await constituida()
    await expect(
      votar(repo, RELOJ, {
        usuarioId: e.ajeno.administrador,
        consorcioId: e.consorcioId,
        asambleaId,
        puntoId: puntoBinario,
        unidadId: e.unidades['1A'],
        eleccion: { sentido: 'positivo' },
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
    await expect(
      verAsamblea(repo, RELOJ, {
        usuarioId: e.ajeno.administrador,
        consorcioId: e.ajeno.consorcioId,
        asambleaId,
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('las operaciones quedan en la bitácora', async () => {
    await constituida()
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntoBinario })
    await votar(repo, RELOJ, {
      ...de(e.ana),
      puntoId: puntoBinario,
      unidadId: e.unidades['1A'],
      eleccion: { sentido: 'positivo' },
    })
    const voto = await prismaBase.votoAsamblea.findFirstOrThrow({
      where: { puntoId: puntoBinario },
    })
    expect(
      await prismaBase.bitacoraAuditoria.count({
        where: { tabla: 'VotoAsamblea', clave: voto.id },
      }),
    ).toBe(1)
    expect(
      await prismaBase.bitacoraAuditoria.count({ where: { tabla: 'Asamblea', clave: asambleaId } }),
    ).toBeGreaterThanOrEqual(3)
  })
})
