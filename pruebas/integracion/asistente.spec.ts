import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { confirmarPropuesta, descartarPropuesta } from '@/aplicacion/asistente/confirmar'
import { conversar, type EventoAsistente } from '@/aplicacion/asistente/conversar'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { altaEspacio } from '@/aplicacion/reservas/espacios'
import { NoEncontrado } from '@/compartido/errores'
import type { Asistencia } from '@/dominio/contratos/asistencia'
import {
  asistenciaDeterminista,
  NEGATIVA_FUERA_DE_DOMINIO,
} from '@/infraestructura/asistencia/determinista'
import { asistenciaNula } from '@/infraestructura/asistencia/nula'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import { almacenEnMemoria } from './asistencia-ayudas'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

/**
 * El asistente conversacional contra la base (RF-27, CU-16), con la
 * implementacion determinista: ruteo, alcance, paridad con la UI, escrituras
 * con confirmacion idempotente, varios consorcios y degradacion.
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones
const HORA = 3_600_000
const en = (h: number) => new Date(RELOJ.ahora().getTime() + h * HORA).toISOString()
const { almacen } = almacenEnMemoria({})

let consorcioId: string
let otroConsorcioId: string
let administrador: string
let vecino: { id: string; personaId: string }
let ajeno: string
let unidadA: string
let espacioId: string

/** Lo que el agente ve: espia sobre `agente.conversar` para afirmar que llega al modelo. */
const vistos: string[] = []
const espiada: Asistencia = {
  ...asistenciaDeterminista,
  agente: {
    async conversar(contexto, historial, herramientas, emitir) {
      vistos.push(JSON.stringify(historial))
      return asistenciaDeterminista.agente.conversar(contexto, historial, herramientas, emitir)
    },
    sugerir: asistenciaDeterminista.agente.sugerir,
  },
}

const pedir = (usuarioId: string, texto: string, cid = consorcioId, conversacionId?: string) =>
  conversar(espiada, repo, RELOJ, almacen, { usuarioId, consorcioId: cid, texto, conversacionId })

const confirmar = (usuarioId: string, propuestaId: string, cid = consorcioId) =>
  confirmarPropuesta(espiada, repo, RELOJ, almacen, { usuarioId, consorcioId: cid, propuestaId })

beforeEach(async () => {
  vistos.length = 0
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  otroConsorcioId = (await crearConsorcio(administradora.id, 'San Martin 7890')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(administrador, otroConsorcioId, 'administrador')
  const usuario = await crearUsuario('Beto')
  vecino = { id: usuario.id, personaId: usuario.personaId }
  await habilitarEnConsorcio(vecino.id, consorcioId, 'consorcista')
  ajeno = (await crearUsuario('Cora')).id
  await habilitarEnConsorcio(ajeno, otroConsorcioId, 'consorcista')

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
  await altaEspacio(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId: otroConsorcioId,
    nombre: 'Quincho',
    capacidadMaxima: 25,
  })
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await prismaBase.trabajoPendiente.deleteMany({})
  await prismaBase.$executeRaw`DELETE FROM "Reserva"`
  await prismaBase.$executeRaw`DELETE FROM "Ocupacion"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

describe('alcance (RN-12, Principio I)', () => {
  it('sin habilitacion sobre el consorcio, el asistente no existe: no encontrado', async () => {
    await expect(pedir(ajeno, 'ver_espacios')).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('un consorcio fuera del alcance se declara no encontrado, sin datos', async () => {
    const r = await pedir(vecino.id, `ver_espacios consorcioId=${otroConsorcioId}`)
    expect(r.modo).toBe('respuesta')
    if (r.modo === 'respuesta') {
      expect(r.texto).toMatch(/No encontré ese consorcio/)
      expect(r.enlaces).toEqual([])
    }
  })

  it('el administrador consulta otro consorcio de su alcance', async () => {
    const r = await pedir(administrador, `ver_espacios consorcioId=${otroConsorcioId}`)
    expect(r.modo).toBe('respuesta')
    if (r.modo === 'respuesta') {
      expect(r.texto).toContain('Quincho')
      expect(r.enlaces[0].consorcioId).toBe(otroConsorcioId)
    }
  })
})

describe('paridad con la interfaz', () => {
  it('el consorcista recibe la morosidad agregada; el administrador, la nominada', async () => {
    const c = await pedir(vecino.id, 'ver_morosidad')
    const a = await pedir(administrador, 'ver_morosidad')
    expect(c.modo === 'respuesta' && c.texto).not.toContain('deudores')
    expect(a.modo === 'respuesta' && a.texto).toContain('"nominada":true')
  })

  it('lo que llega al modelo es lo que devuelve el caso de uso, y ninguna URL', async () => {
    await pedir(vecino.id, 'ver_espacios')
    const turnos = vistos.join('\n')
    expect(turnos).toContain('SUM')
    expect(turnos).not.toMatch(/https?:\/\//)
  })

  it('un pedido ajeno al dominio recibe la negativa fija', async () => {
    const r = await pedir(vecino.id, 'escribime un poema')
    expect(r.modo === 'respuesta' && r.texto).toBe(NEGATIVA_FUERA_DE_DOMINIO)
  })

  it('una escritura economica no se ofrece: negativa', async () => {
    const r = await pedir(administrador, 'registrar_pago unidadId=x importe=1')
    expect(r.modo).not.toBe('propuesta')
    expect(await prismaBase.pago.count()).toBe(0)
  })
})

describe('escrituras con confirmacion (Principio IV, FR-008)', () => {
  const reservaPedida = () =>
    `crear_reserva espacioId=${espacioId} unidadId=${unidadA} desde=${en(72)} hasta=${en(75)}`
  const reservas = () => prismaBase.reserva.count({ where: { consorcioId } })

  it('pedir no crea nada; confirmar crea una vez; un segundo confirmar no duplica', async () => {
    const p = await pedir(vecino.id, reservaPedida())
    expect(p.modo).toBe('propuesta')
    if (p.modo !== 'propuesta') return
    expect(p.resumen).toMatch(/SUM/)
    expect(await reservas()).toBe(0)

    const primera = await confirmar(vecino.id, p.propuestaId)
    expect(primera.ejecutada).toBe(true)
    expect(await reservas()).toBe(1)

    const segunda = await confirmar(vecino.id, p.propuestaId)
    expect(segunda.ejecutada).toBe(false)
    expect(segunda.yaResuelta).toBe('confirmada')
    expect(await reservas()).toBe(1)
  })

  it('dos confirmaciones en paralelo crean una sola reserva', async () => {
    const p = await pedir(vecino.id, reservaPedida())
    if (p.modo !== 'propuesta') throw new Error('se esperaba una propuesta')
    const [x, y] = await Promise.allSettled([
      confirmar(vecino.id, p.propuestaId),
      confirmar(vecino.id, p.propuestaId),
    ])
    expect([x, y].filter((r) => r.status === 'fulfilled' && r.value.ejecutada)).toHaveLength(1)
    expect(await reservas()).toBe(1)
  })

  it('otro usuario no puede confirmar la propuesta ajena', async () => {
    const p = await pedir(vecino.id, reservaPedida())
    if (p.modo !== 'propuesta') throw new Error('se esperaba una propuesta')
    await expect(confirmar(administrador, p.propuestaId)).rejects.toBeInstanceOf(NoEncontrado)
    expect(await reservas()).toBe(0)
  })

  it('descartar no ejecuta y deja la propuesta resuelta', async () => {
    const p = await pedir(vecino.id, reservaPedida())
    if (p.modo !== 'propuesta') throw new Error('se esperaba una propuesta')
    await descartarPropuesta(repo, RELOJ, {
      usuarioId: vecino.id,
      consorcioId,
      propuestaId: p.propuestaId,
    })
    const r = await confirmar(vecino.id, p.propuestaId)
    expect(r).toMatchObject({ ejecutada: false, yaResuelta: 'descartada' })
    expect(await reservas()).toBe(0)
  })

  it('si el caso de uso rechaza, la propuesta vuelve a pendiente y nada se crea', async () => {
    const p = await pedir(
      vecino.id,
      `crear_reserva espacioId=${espacioId} unidadId=${unidadA} desde=${en(1)} hasta=${en(3)}`,
    )
    if (p.modo !== 'propuesta') throw new Error('se esperaba una propuesta')
    await expect(confirmar(vecino.id, p.propuestaId)).rejects.toThrow() // 48 h de anticipacion
    const fila = await prismaBase.mensajeAsistente.findUnique({ where: { id: p.propuestaId } })
    expect(fila?.estadoPropuesta).toBe('pendiente')
    expect(await reservas()).toBe(0)
  })

  it('gestion no economica: deshabilitar un espacio exige confirmar y solo lo hace el administrador', async () => {
    const pedido = `deshabilitar_espacio espacioId=${espacioId} motivo=pintura`
    const comun = await pedir(vecino.id, pedido)
    expect(comun.modo).not.toBe('propuesta') // no se le ofrece

    const p = await pedir(administrador, pedido)
    if (p.modo !== 'propuesta') throw new Error('se esperaba una propuesta')
    expect((await prismaBase.espacioComun.findUnique({ where: { id: espacioId } }))?.activo).toBe(
      true,
    )
    await confirmar(administrador, p.propuestaId)
    expect((await prismaBase.espacioComun.findUnique({ where: { id: espacioId } }))?.activo).toBe(
      false,
    )
  })

  it('una escritura sobre otro consorcio propio se confirma sobre ese consorcio', async () => {
    const otro = await prismaBase.espacioComun.findFirstOrThrow({
      where: { consorcioId: otroConsorcioId },
    })
    const p = await pedir(
      administrador,
      `deshabilitar_espacio espacioId=${otro.id} motivo=reforma consorcioId=${otroConsorcioId}`,
    )
    if (p.modo !== 'propuesta') throw new Error('se esperaba una propuesta')
    await confirmar(administrador, p.propuestaId)
    expect((await prismaBase.espacioComun.findUnique({ where: { id: otro.id } }))?.activo).toBe(
      false,
    )
  })
})

describe('hilo y degradacion', () => {
  it('una repregunta reutiliza el hilo del usuario', async () => {
    const a = await pedir(vecino.id, 'ver_espacios')
    const b = await pedir(vecino.id, 'ver_mis_unidades', consorcioId, a.conversacionId)
    expect(b.conversacionId).toBe(a.conversacionId)
    const hilo = await prismaBase.conversacionAsistente.findFirst({
      where: { id: a.conversacionId, usuarioId: vecino.id },
      include: { mensajes: true },
    })
    expect(hilo!.mensajes.length).toBeGreaterThanOrEqual(4)
  })

  it('con la asistencia nula responde degradado, sin lanzar', async () => {
    const r = await conversar(asistenciaNula, repo, RELOJ, almacen, {
      usuarioId: vecino.id,
      consorcioId,
      texto: 'hola',
    })
    expect(r.modo).toBe('degradado')
    if (r.modo === 'degradado') expect(r.motivo).toMatch(/no está configurado/)
  })
})

describe('historial largo', () => {
  it('el modelo ve los ultimos turnos del hilo y no los primeros', async () => {
    const a = await pedir(vecino.id, 'ver_espacios')
    const base = Date.parse('2026-01-01T00:00:00Z')
    await prismaBase.mensajeAsistente.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        conversacionId: a.conversacionId,
        rol: 'usuario' as const,
        contenido: i === 0 ? 'TURNO-ANTIGUO' : i === 24 ? 'TURNO-RECIENTE' : `relleno ${i}`,
        creadoEn: new Date(base + i * 1000),
      })),
    })
    vistos.length = 0
    await pedir(vecino.id, 'ver_mis_unidades', consorcioId, a.conversacionId)
    expect(vistos[0]).toContain('TURNO-RECIENTE')
    expect(vistos[0]).not.toContain('TURNO-ANTIGUO')
  })
})

describe('eventos de progreso (FR-015)', () => {
  it('una lectura emite pensando, la herramienta, el texto en partes y el fin; despues las sugerencias', async () => {
    const eventos: EventoAsistente[] = []
    await conversar(
      espiada,
      repo,
      RELOJ,
      almacen,
      { usuarioId: vecino.id, consorcioId, texto: 'ver_espacios' },
      (e) => eventos.push(e),
    )
    const tipos = eventos.map((e) => e.t)
    expect(tipos[0]).toBe('pensando')
    expect(eventos).toContainEqual({ t: 'herramienta', nombre: 'ver_espacios' })
    const fin = eventos.find((e) => e.t === 'fin')
    const texto = eventos.flatMap((e) => (e.t === 'texto' ? [e.fragmento] : []))
    expect(texto.length).toBeGreaterThan(1)
    expect(fin?.t === 'fin' && fin.respuesta.modo === 'respuesta' && fin.respuesta.texto).toBe(
      texto.join(''),
    )
    // Las sugerencias nunca van antes de la respuesta.
    expect(tipos.indexOf('sugerencias')).toBeGreaterThan(tipos.indexOf('fin'))
  })

  it('con la asistencia nula el fin llega degradado, sin texto ni sugerencias', async () => {
    const eventos: EventoAsistente[] = []
    await conversar(
      asistenciaNula,
      repo,
      RELOJ,
      almacen,
      { usuarioId: vecino.id, consorcioId, texto: 'hola' },
      (e) => eventos.push(e),
    )
    expect(eventos.map((e) => e.t)).toEqual(['pensando', 'fin'])
  })

  it('una propuesta no trae sugerencias: la tarjeta ya es el proximo paso', async () => {
    const eventos: EventoAsistente[] = []
    await conversar(
      espiada,
      repo,
      RELOJ,
      almacen,
      {
        usuarioId: administrador,
        consorcioId,
        texto: `deshabilitar_espacio espacioId=${espacioId} motivo=pintura`,
      },
      (e) => eventos.push(e),
    )
    expect(eventos.some((e) => e.t === 'sugerencias')).toBe(false)
    expect(eventos.find((e) => e.t === 'fin')).toMatchObject({
      respuesta: { modo: 'propuesta' },
    })
  })
})

describe('modo cartera (FR-017, FR-018, RT-04)', () => {
  const pedirCartera = (usuarioId: string, texto: string) =>
    conversar(espiada, repo, RELOJ, almacen, { usuarioId, consorcioId, texto, cartera: true })
  const novedades = () => prismaBase.novedad.groupBy({ by: ['consorcioId'], _count: true })
  const aviso = 'publicar_novedad_cartera titulo="Corte de agua" cuerpo="El martes no hay agua"'

  it.each([
    `deshabilitar_espacio espacioId=ESPACIO motivo=pintura`,
    `habilitar_espacio espacioId=ESPACIO`,
    `crear_reclamo titulo=Gotera descripcion="Hay una gotera en el techo"`,
    `crear_proveedor nombre=Pepe`,
  ])('en cartera, sin nombrar el consorcio, pregunta cual y no escribe: %s', async (pedido) => {
    const r = await pedirCartera(administrador, pedido.replace('ESPACIO', espacioId))
    expect(r.modo).not.toBe('propuesta')
    expect((await prismaBase.espacioComun.findUnique({ where: { id: espacioId } }))?.activo).toBe(
      true,
    )
    expect(await prismaBase.reclamo.count()).toBe(0)
  })

  it('en cartera, una escritura que nombra el consorcio se propone y se confirma sobre ese consorcio', async () => {
    const otro = await prismaBase.espacioComun.findFirstOrThrow({
      where: { consorcioId: otroConsorcioId },
    })
    const p = await pedirCartera(
      administrador,
      `deshabilitar_espacio espacioId=${otro.id} motivo=reforma consorcioId=${otroConsorcioId}`,
    )
    if (p.modo !== 'propuesta') throw new Error('se esperaba una propuesta')
    expect(p.resumen).toMatch(/^En .+: Deshabilitar /)
    await confirmar(administrador, p.propuestaId)
    expect((await prismaBase.espacioComun.findUnique({ where: { id: otro.id } }))?.activo).toBe(
      false,
    )
    // El del ancla no se toca.
    expect((await prismaBase.espacioComun.findUnique({ where: { id: espacioId } }))?.activo).toBe(
      true,
    )
  })

  it('una lectura sin decir consorcio se abre en abanico: una corrida por consorcio, cada una con lo suyo', async () => {
    const r = await pedirCartera(administrador, 'ver_espacios')
    if (r.modo !== 'respuesta') throw new Error('se esperaba una respuesta')
    expect(r.enlaces.map((e) => e.consorcioId).sort()).toEqual(
      [consorcioId, otroConsorcioId].sort(),
    )
    // El resultado fundido trae un bloque por consorcio; el Quincho es solo del otro.
    const bloques = JSON.parse(r.texto) as { consorcio: string; datos: { nombre: string }[] }[]
    expect(bloques).toHaveLength(2)
    const conQuincho = bloques.filter((b) => b.datos.some((e) => e.nombre === 'Quincho'))
    expect(conQuincho).toHaveLength(1)
    // Nombrando uno, sigue siendo una sola corrida.
    const otro = await pedirCartera(administrador, `ver_espacios consorcioId=${otroConsorcioId}`)
    expect(otro.modo === 'respuesta' && otro.enlaces).toHaveLength(1)
  })

  it('en el abanico se saltea el consorcio donde el rol no alcanza para esa herramienta', async () => {
    await prismaBase.habilitacion.updateMany({
      where: { usuarioId: administrador, consorcioId: otroConsorcioId },
      data: { rol: 'consorcista' },
    })
    const r = await pedirCartera(administrador, 'ver_usuarios')
    if (r.modo !== 'respuesta') throw new Error('se esperaba una respuesta')
    expect(r.enlaces.map((e) => e.consorcioId)).toEqual([consorcioId])
  })

  it('el aviso a la cartera se confirma una vez y escribe en cada consorcio administrado y en ninguno mas', async () => {
    const ajenoAdmin = await crearAdministradora()
    const ajeno3 = await crearConsorcio(ajenoAdmin.id, 'Ajeno 1')
    const p = await pedirCartera(administrador, aviso)
    if (p.modo !== 'propuesta') throw new Error('se esperaba una propuesta')
    expect(p.resumen).toMatch(/2 consorcios/)
    expect(await prismaBase.novedad.count()).toBe(0)

    const r = await confirmar(administrador, p.propuestaId)
    expect(r.ejecutada).toBe(true)
    expect(r.resultado).toMatchObject({ texto: expect.stringMatching(/2 consorcios/) })
    const filas = await novedades()
    expect(filas.map((f) => f.consorcioId).sort()).toEqual([consorcioId, otroConsorcioId].sort())
    expect(filas.every((f) => f._count === 1)).toBe(true)
    expect(filas.some((f) => f.consorcioId === ajeno3.id)).toBe(false)

    // Un segundo clic no vuelve a publicar.
    expect(await confirmar(administrador, p.propuestaId)).toMatchObject({ ejecutada: false })
    expect(await prismaBase.novedad.count()).toBe(2)
  })

  it('solo se publica donde la persona sigue siendo administradora al confirmar', async () => {
    const p = await pedirCartera(administrador, aviso)
    if (p.modo !== 'propuesta') throw new Error('se esperaba una propuesta')
    await prismaBase.habilitacion.deleteMany({
      where: { usuarioId: administrador, consorcioId: otroConsorcioId },
    })
    await confirmar(administrador, p.propuestaId)
    expect((await novedades()).map((f) => f.consorcioId)).toEqual([consorcioId])
  })

  it('el consorcista no recibe el aviso a la cartera', async () => {
    const r = await pedirCartera(vecino.id, aviso)
    expect(r.modo).not.toBe('propuesta')
    expect(await prismaBase.novedad.count()).toBe(0)
  })
})
