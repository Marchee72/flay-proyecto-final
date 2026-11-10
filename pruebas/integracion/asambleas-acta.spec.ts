import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  designarFirmantes,
  enviarAFirmar,
  firmar,
  huella,
  redactarResumen,
  reemplazarFirmante,
  verificarHuella,
} from '@/aplicacion/asambleas/acta'
import {
  abrir,
  abrirPunto,
  acreditarme,
  cerrarPunto,
  constituir,
  designarAutoridades,
  finalizar,
} from '@/aplicacion/asambleas/conducir'
import {
  ActaIncompleta,
  ActaNoEnRedaccion,
  ContrasenaIncorrecta,
  FirmanteInvalido,
  FirmanteYaFirmo,
  YaFirmo,
} from '@/aplicacion/asambleas/errores'
import { registrarPoderEnPapel } from '@/aplicacion/asambleas/poderes'
import { recordarFirmasPendientes } from '@/aplicacion/asambleas/recordatorios'
import { NoEncontrado } from '@/compartido/errores'
import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { DerivadorDeContrasenas } from '@/dominio/contratos/derivador-contrasenas'
import type { ActaParaDocumento } from '@/dominio/contratos/documentos'
import { generadorActa } from '@/infraestructura/documentos/acta'
import { prismaBase } from '@/infraestructura/prisma'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  armarEscenario,
  asambleaConvocada,
  enLaReunion,
  HOY,
  repo,
  type Escenario,
} from './asambleas-ayudas'
import { crearUsuario, habilitarEnConsorcio, limpiar } from './ayudas'

/**
 * Acta y firma electrónica (US4, FR-030 a FR-034, SC-007). Presentes: Ana
 * (1A), Bruno (1B), Carla (2A), Iván, apoderado de Dora (2B) en papel, y Elsa
 * (2C). Presidente Iván, secretaria Carla; firman además Ana y Bruno. Elsa
 * queda libre para reemplazar a un firmante.
 */

const RELOJ = enLaReunion(5)
const DESPUES = relojFijo('2026-11-27T12:00:00Z')
const secretoDeFirma = 'clave-de-prueba'

const guardados = new Map<string, Uint8Array>()
const almacen: Pick<AlmacenObjetos, 'guardar' | 'resolverLecturaAutorizada'> = {
  async guardar(clave, bytes) {
    guardados.set(clave, bytes)
  },
  async resolverLecturaAutorizada(clave) {
    return `data:application/pdf;base64,${Buffer.from(guardados.get(clave) ?? new Uint8Array()).toString('base64')}`
  },
}
const generados: ActaParaDocumento[] = []
const generador = {
  async acta(datos: ActaParaDocumento) {
    generados.push(datos)
    return new TextEncoder().encode(JSON.stringify(datos))
  },
}
const derivador: DerivadorDeContrasenas = {
  derivar: async (c) => `hash:${c}`,
  verificar: async (c, d) => d === `hash:${c}`,
}
const deps = { generador, almacen, derivador }

let e: Escenario
let asambleaId: string
const de = (usuarioId: string) => ({ usuarioId, consorcioId: e.consorcioId, asambleaId })

beforeEach(async () => {
  guardados.clear()
  generados.length = 0
  e = await armarEscenario({ conExtra: true })
  await prismaBase.usuario.updateMany({
    where: { id: { in: [e.ana, e.bruno, e.carla, e.ivan] } },
    data: { claveDerivada: `hash:${secretoDeFirma}` },
  })
  await prismaBase.usuario.update({
    where: { id: e.elsa! },
    data: { claveDerivada: `hash:${secretoDeFirma}` },
  })
  asambleaId = await asambleaConvocada(e)
  await registrarPoderEnPapel(repo, HOY, {
    ...de(e.consejo),
    unidadId: e.unidades['2B'],
    otorganteId: e.personaDora,
    apoderadoId: e.ivan,
  })
  await abrir(repo, RELOJ, de(e.consejo))
  for (const u of [e.ana, e.bruno, e.carla, e.ivan, e.elsa!]) await acreditarme(repo, RELOJ, de(u))
  await designarAutoridades(repo, RELOJ, {
    ...de(e.consejo),
    presidenteId: e.ivan,
    secretarioId: e.carla,
  })
  await constituir(repo, RELOJ, de(e.consejo))
  const puntos = await prismaBase.puntoAsamblea.findMany({
    where: { asambleaId },
    orderBy: { orden: 'asc' },
  })
  for (const p of puntos) {
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: p.id })
    await cerrarPunto(repo, RELOJ, { ...de(e.consejo), puntoId: p.id })
  }
  await finalizar(repo, RELOJ, de(e.consejo))
})

afterEach(async () => {
  await limpiar()
})

async function lista() {
  const puntos = await prismaBase.puntoAsamblea.findMany({ where: { asambleaId } })
  for (const p of puntos) {
    await redactarResumen(repo, DESPUES, {
      ...de(e.carla),
      puntoId: p.id,
      resumen: `Se debatió ${p.titulo}.`,
    })
  }
  await designarFirmantes(repo, DESPUES, { ...de(e.consejo), propietarios: [e.ana, e.bruno] })
}

describe('redacción', () => {
  it('la secretaria redacta; los firmantes son presidente, secretaria y dos propietarios presentes', async () => {
    await lista()
    const acta = await prismaBase.actaAsamblea.findFirstOrThrow({
      where: { asambleaId },
      include: { firmantes: true },
    })
    expect(acta.firmantes.map((f) => f.rolEnActa).sort()).toEqual([
      'presidente',
      'propietario',
      'propietario',
      'secretario',
    ])
    await expect(
      designarFirmantes(repo, DESPUES, { ...de(e.consejo), propietarios: [e.ana, e.ivan] }),
    ).rejects.toBeInstanceOf(FirmanteInvalido)
  })

  it('no se envía a firmar con resúmenes o firmantes incompletos', async () => {
    await expect(enviarAFirmar(repo, DESPUES, deps, de(e.consejo))).rejects.toBeInstanceOf(
      ActaIncompleta,
    )
    await designarFirmantes(repo, DESPUES, { ...de(e.consejo), propietarios: [e.ana, e.bruno] })
    await expect(enviarAFirmar(repo, DESPUES, deps, de(e.consejo))).rejects.toThrow(/resúmenes/)
  })

  it('enviada a firmar, guarda el PDF y su huella, avisa, y el texto ya no cambia', async () => {
    await lista()
    const { hashContenido } = await enviarAFirmar(repo, DESPUES, deps, de(e.consejo))
    const acta = await prismaBase.actaAsamblea.findFirstOrThrow({ where: { asambleaId } })
    expect(acta.estado).toBe('a_firmar')
    expect(huella(guardados.get(acta.claveContenido!)!)).toBe(hashContenido)
    expect(
      await prismaBase.notificacion.count({
        where: { tipo: 'acta_a_firmar', entidadId: asambleaId },
      }),
    ).toBe(4)
    expect(generados[0].asistencia.find((a) => a.designacion === '2B')!.representante).toMatch(
      /apoderado/,
    )

    // La plantilla real rinde un PDF con esos datos, con hoja de firmas incluida.
    const pdf = await generadorActa.acta({
      ...generados[0],
      hojaDeFirmas: {
        huellaContenido: hashContenido,
        firmas: [{ nombre: 'Iván', rol: 'Presidente', momento: '27/11/2026 09:00' }],
      },
    })
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')

    const punto = await prismaBase.puntoAsamblea.findFirstOrThrow({ where: { asambleaId } })
    await expect(
      redactarResumen(repo, DESPUES, { ...de(e.carla), puntoId: punto.id, resumen: 'Otro texto' }),
    ).rejects.toBeInstanceOf(ActaNoEnRedaccion)
    await expect(
      prismaBase.$executeRaw`UPDATE "PuntoAsamblea" SET resumen = 'Otro' WHERE id = ${punto.id}::uuid`,
    ).rejects.toThrow(/ya no cambia/)
  })
})

describe('firma', () => {
  beforeEach(async () => {
    await lista()
    await enviarAFirmar(repo, DESPUES, deps, de(e.consejo))
  })

  it('con contraseña incorrecta no firma; un no firmante no puede; dos veces tampoco', async () => {
    await expect(
      firmar(repo, DESPUES, deps, { ...de(e.ana), contrasena: 'otra' }),
    ).rejects.toBeInstanceOf(ContrasenaIncorrecta)
    await expect(
      firmar(repo, DESPUES, deps, { ...de(e.elsa!), contrasena: secretoDeFirma }),
    ).rejects.toBeInstanceOf(NoEncontrado)
    await firmar(repo, DESPUES, deps, { ...de(e.ana), contrasena: secretoDeFirma })
    await expect(
      firmar(repo, DESPUES, deps, { ...de(e.ana), contrasena: secretoDeFirma }),
    ).rejects.toBeInstanceOf(YaFirmo)
  })

  it('la cuarta firma publica el acta como documento del consorcio, indexado', async () => {
    for (const u of [e.ana, e.bruno, e.carla]) {
      expect(await firmar(repo, DESPUES, deps, { ...de(u), contrasena: secretoDeFirma })).toEqual({
        completa: false,
      })
    }
    expect(
      await firmar(repo, DESPUES, deps, { ...de(e.ivan), contrasena: secretoDeFirma }),
    ).toEqual({ completa: true })

    const acta = await prismaBase.actaAsamblea.findFirstOrThrow({
      where: { asambleaId },
      include: { firmantes: true },
    })
    expect(acta.estado).toBe('firmada')
    expect(acta.firmantes.every((f) => f.hashFirmado === acta.hashContenido)).toBe(true)
    const doc = await prismaBase.documentoConsorcio.findUniqueOrThrow({
      where: { id: acta.documentoId! },
    })
    expect(doc).toMatchObject({ tipo: 'acta', visibleConsorcistas: true })
    expect(doc.hashSha256).toBe(huella(guardados.get(doc.claveAlmacenamiento)!))
    expect(await prismaBase.trabajoPendiente.count({ where: { tipo: 'indexar_documento' } })).toBe(
      1,
    )
    expect(
      (await prismaBase.asamblea.findUniqueOrThrow({ where: { id: asambleaId } })).estado,
    ).toBe('acta_firmada')
    expect(generados.at(-1)!.hojaDeFirmas!.firmas).toHaveLength(4)
    expect(
      await prismaBase.notificacion.count({
        where: { tipo: 'acta_firmada', entidadId: asambleaId },
      }),
    ).toBeGreaterThan(0)
  })

  it('un firmante pendiente se reemplaza; uno que ya firmó, no', async () => {
    const ausente = (await crearUsuario('Otro', 'Ausente')).id
    await habilitarEnConsorcio(ausente, e.consorcioId, 'consorcista')
    await firmar(repo, DESPUES, deps, { ...de(e.ana), contrasena: secretoDeFirma })
    const firmantes = await prismaBase.firmanteActa.findMany({})
    const deAna = firmantes.find((f) => f.usuarioId === e.ana)!
    const deBruno = firmantes.find((f) => f.usuarioId === e.bruno)!

    await expect(
      reemplazarFirmante(repo, DESPUES, {
        ...de(e.consejo),
        firmanteId: deAna.id,
        nuevoUsuarioId: e.elsa!,
      }),
    ).rejects.toBeInstanceOf(FirmanteYaFirmo)
    await expect(
      reemplazarFirmante(repo, DESPUES, {
        ...de(e.consejo),
        firmanteId: deBruno.id,
        nuevoUsuarioId: ausente,
      }),
    ).rejects.toBeInstanceOf(FirmanteInvalido) // no estuvo presente
    await expect(
      reemplazarFirmante(repo, DESPUES, {
        ...de(e.consejo),
        firmanteId: deBruno.id,
        nuevoUsuarioId: e.ivan,
      }),
    ).rejects.toBeInstanceOf(FirmanteInvalido) // ya firma como presidente
    await expect(
      prismaBase.$executeRaw`UPDATE "FirmanteActa" SET usuario_id = ${e.elsa!}::uuid, reemplaza_a = ${e.ana}::uuid WHERE id = ${deAna.id}::uuid`,
    ).rejects.toThrow(/ya está registrada/)

    await reemplazarFirmante(repo, DESPUES, {
      ...de(e.consejo),
      firmanteId: deBruno.id,
      nuevoUsuarioId: e.elsa!,
    })
    const reemplazado = await prismaBase.firmanteActa.findUniqueOrThrow({
      where: { id: deBruno.id },
    })
    expect(reemplazado).toMatchObject({
      usuarioId: e.elsa,
      reemplazaA: e.bruno,
      rolEnActa: 'propietario',
    })
    expect(
      (await prismaBase.firmanteActa.findUniqueOrThrow({ where: { id: deAna.id } })).firmadoEn,
    ).not.toBeNull()
    await expect(
      firmar(repo, DESPUES, deps, { ...de(e.bruno), contrasena: secretoDeFirma }),
    ).rejects.toBeInstanceOf(NoEncontrado)
    for (const u of [e.elsa!, e.carla, e.ivan]) {
      await firmar(repo, DESPUES, deps, { ...de(u), contrasena: secretoDeFirma })
    }
    expect((await prismaBase.actaAsamblea.findFirstOrThrow({ where: { asambleaId } })).estado).toBe(
      'firmada',
    )
  })

  it('la huella detecta un PDF alterado (SC-007)', async () => {
    for (const u of [e.ana, e.bruno, e.carla, e.ivan]) {
      await firmar(repo, DESPUES, deps, { ...de(u), contrasena: secretoDeFirma })
    }
    expect(await verificarHuella(repo, DESPUES, almacen, de(e.ana))).toEqual({
      contenido: true,
      final: true,
    })
    const acta = await prismaBase.actaAsamblea.findFirstOrThrow({ where: { asambleaId } })
    guardados.set(acta.claveContenido!, new TextEncoder().encode('adulterado'))
    expect(await verificarHuella(repo, DESPUES, almacen, de(e.ana))).toEqual({
      contenido: false,
      final: true,
    })
  })

  it('a los 10 días sin todas las firmas avisa una sola vez', async () => {
    await firmar(repo, DESPUES, deps, { ...de(e.ana), contrasena: secretoDeFirma })
    const antes = await prismaBase.notificacion.count({
      where: { tipo: 'acta_a_firmar', entidadId: asambleaId },
    })
    expect(await recordarFirmasPendientes(relojFijo('2026-12-01T12:00:00Z'))).toEqual({
      avisadas: 0,
    })
    expect(await recordarFirmasPendientes(relojFijo('2026-12-10T12:00:00Z'))).toEqual({
      avisadas: 1,
    })
    expect(await recordarFirmasPendientes(relojFijo('2026-12-11T12:00:00Z'))).toEqual({
      avisadas: 0,
    })
    // Bruno, Carla, Iván pendientes + Carla (consejo) dirigió: tres personas distintas.
    expect(
      (await prismaBase.notificacion.count({
        where: { tipo: 'acta_a_firmar', entidadId: asambleaId },
      })) - antes,
    ).toBe(3)
  })

  it('otro consorcio no firma ni verifica', async () => {
    await expect(
      firmar(repo, DESPUES, deps, {
        usuarioId: e.ajeno.administrador,
        consorcioId: e.ajeno.consorcioId,
        asambleaId,
        contrasena: secretoDeFirma,
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
    await expect(
      verificarHuella(repo, DESPUES, almacen, {
        usuarioId: e.ajeno.administrador,
        consorcioId: e.ajeno.consorcioId,
        asambleaId,
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
  })
})
