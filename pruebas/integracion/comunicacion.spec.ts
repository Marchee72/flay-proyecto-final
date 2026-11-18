import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  cargarDocumento,
  DocumentoDeActa,
  eliminarDocumento,
  listarDocumentos,
  verDocumento,
} from '@/aplicacion/comunicacion/documentos'
import { NoEncontrado, RolInsuficiente } from '@/compartido/errores'
import { manejadorIndexacion } from '@/aplicacion/comunicacion/indexar'
import {
  descartarNovedad,
  listarNovedades,
  publicarNovedad,
  VigenciaDeNovedadInvalida,
} from '@/aplicacion/comunicacion/novedades'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import {
  suscribirNotificaciones,
  type NotificacionEvento,
} from '@/aplicacion/comunicacion/eventos-notificaciones'
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
 * Novedades y documentacion (`RF-18`, `RF-19`, `CU-12`, `CU-15`): la novedad
 * avisa a todos los habilitados del consorcio y a nadie de otro; el documento
 * no visible queda fuera de la lista del consorcista (escenario 4 de US5); el
 * documento nace pendiente con su trabajo de indexacion (FR-030).
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let otroConsorcioId: string
let administrador: string
let vecino: string
let consejo: string
let ajeno: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  otroConsorcioId = (await crearConsorcio(administradora.id, 'San Martin 7890')).id
  administrador = (await crearUsuario('Ada')).id
  vecino = (await crearUsuario('Beto')).id
  consejo = (await crearUsuario('Caro')).id
  ajeno = (await crearUsuario('Dani')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(vecino, consorcioId, 'consorcista')
  await habilitarEnConsorcio(consejo, consorcioId, 'consejo')
  await habilitarEnConsorcio(ajeno, otroConsorcioId, 'consorcista')
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await prismaBase.trabajoPendiente.deleteMany({})
  await limpiar()
})

describe('novedades', () => {
  it('publicar avisa a cada habilitado del consorcio, salvo a quien publica, y a nadie de otro', async () => {
    const { avisados } = await publicarNovedad(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      titulo: 'Corte de agua',
      cuerpo: 'El jueves de 9 a 12 por obras en la calle.',
      fijada: true,
    })
    expect(avisados).toBe(2)
    const avisos = await prismaBase.notificacion.findMany({ where: { tipo: 'novedad' } })
    expect(avisos.map((a) => a.usuarioId).sort()).toEqual([vecino, consejo].sort())
    expect(await prismaBase.trabajoPendiente.count({ where: { tipo: 'notificacion' } })).toBe(2)

    const delVecino = await listarNovedades(repo, RELOJ, { usuarioId: vecino, consorcioId })
    expect(delVecino.map((n) => n.titulo)).toEqual(['Corte de agua'])
    const delAjeno = await listarNovedades(repo, RELOJ, {
      usuarioId: ajeno,
      consorcioId: otroConsorcioId,
    })
    expect(delAjeno).toEqual([])
    await expect(
      publicarNovedad(repo, RELOJ, { usuarioId: vecino, consorcioId, titulo: 'x', cuerpo: 'y' }),
    ).rejects.toThrow('Tu rol no permite')
  })
})

describe('novedades con destinatario, vigencia y descarte', () => {
  let delB: string
  let unidad2A: string

  beforeEach(async () => {
    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidades: [
        { designacion: '1A', coeficiente: '30.00000000' },
        { designacion: '2A', coeficiente: '30.00000000' },
        { designacion: '1B', coeficiente: '40.00000000' },
      ],
    })
    const unidades = await prismaBase.unidad.findMany({ where: { consorcioId } })
    const id = (d: string) => unidades.find((u) => u.designacion === d)!.id
    unidad2A = id('2A')
    const usuarioB = await crearUsuario('Eli')
    delB = usuarioB.id
    const vecinoPersona = (await prismaBase.usuario.findUniqueOrThrow({ where: { id: vecino } }))
      .personaId
    for (const [unidadId, personaId] of [
      [unidad2A, vecinoPersona],
      [id('1B'), usuarioB.personaId],
    ]) {
      await registrarOcupacion(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        unidadId,
        personaId,
        tipo: 'propietario',
        desde: new Date('2026-01-01'),
      })
    }
  })

  const publicar = (datos: Partial<Parameters<typeof publicarNovedad>[2]>) =>
    publicarNovedad(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      titulo: 'Aviso',
      cuerpo: 'Texto',
      ...datos,
    })
  const titulos = async (usuarioId: string, reloj = RELOJ) =>
    (await listarNovedades(repo, reloj, { usuarioId, consorcioId })).map((n) => n.titulo)
  const avisadosDe = async (titulo: string) =>
    (await prismaBase.notificacion.findMany({ where: { titulo: `Novedad: ${titulo}` } })).map(
      (a) => a.usuarioId,
    )

  it('a una unidad: la ve y la recibe solo quien la ocupa', async () => {
    await publicar({ titulo: 'Filtracion en el 2A', alcance: 'unidad', unidadId: unidad2A })
    expect(await titulos(vecino)).toEqual(['Filtracion en el 2A'])
    expect(await titulos(delB)).toEqual([])
    expect(await avisadosDe('Filtracion en el 2A')).toEqual([vecino])
  })

  it('a una division: la ven los de esa letra en todos los pisos, y nadie mas', async () => {
    await publicar({ titulo: 'Corte en la columna A', alcance: 'division', division: 'a' })
    expect(await titulos(vecino)).toEqual(['Corte en la columna A'])
    expect(await titulos(delB)).toEqual([])
    expect(await avisadosDe('Corte en la columna A')).toEqual([vecino])

    await expect(publicar({ alcance: 'division', division: 'Z' })).rejects.toThrow(
      'división que exista',
    )
  })

  it('a un piso: la ven los de esa planta, y nadie mas', async () => {
    // vecino ocupa 2A; delB ocupa 1B. El piso 1 alcanza a 1A y 1B.
    await publicar({ titulo: 'Pintura en el piso 1', alcance: 'piso', piso: '1' })
    expect(await titulos(delB)).toEqual(['Pintura en el piso 1'])
    expect(await titulos(vecino)).toEqual([])
    expect(await avisadosDe('Pintura en el piso 1')).toEqual([delB])

    await expect(publicar({ alcance: 'piso', piso: '9' })).rejects.toThrow('piso que exista')
  })

  it('la general la ven todos; la programada y la vencida no le llegan al consorcista', async () => {
    await publicar({ titulo: 'General' })
    await publicar({
      titulo: 'Programada',
      vigenteDesde: new Date('2026-09-20'),
      vigenteHasta: new Date('2026-09-30'),
    })
    await publicar({
      titulo: 'Corta',
      vigenteDesde: new Date('2026-09-10'),
      vigenteHasta: new Date('2026-09-16'),
    })
    expect((await titulos(delB)).sort()).toEqual(['Corta', 'General'])

    // Diez dias despues, «Corta» vencio y «Programada» ya rige.
    const despues = relojFijo('2026-09-25T12:00:00Z')
    expect((await titulos(vecino, despues)).sort()).toEqual(['General', 'Programada'])

    // El administrador las ve todas en la seccion, con su estado.
    const gestion = await listarNovedades(repo, despues, {
      usuarioId: administrador,
      consorcioId,
    })
    expect(Object.fromEntries(gestion.map((n) => [n.titulo, n.estado]))).toEqual({
      General: 'vigente',
      Programada: 'vigente',
      Corta: 'vencida',
    })

    await expect(
      publicar({ vigenteDesde: new Date('2026-09-10'), vigenteHasta: new Date('2026-09-14') }),
    ).rejects.toBeInstanceOf(VigenciaDeNovedadInvalida)
  })

  it('descartar la saca del inicio pero queda en la seccion; una de otro consorcio no se encuentra', async () => {
    const { novedadId } = await publicar({ titulo: 'Asamblea' })
    await descartarNovedad(repo, RELOJ, { usuarioId: vecino, consorcioId, novedadId })
    await descartarNovedad(repo, RELOJ, { usuarioId: vecino, consorcioId, novedadId })
    // En el inicio (soloVigentes) ya no la ve; en la seccion Novedades sigue.
    const inicioVecino = await listarNovedades(repo, RELOJ, {
      usuarioId: vecino,
      consorcioId,
      soloVigentes: true,
    })
    expect(inicioVecino.map((n) => n.titulo)).toEqual([])
    expect(await titulos(vecino)).toEqual(['Asamblea'])
    // Quien no la descarto la ve en los dos lados.
    expect(await titulos(delB)).toEqual(['Asamblea'])

    await expect(
      descartarNovedad(repo, RELOJ, { usuarioId: ajeno, consorcioId: otroConsorcioId, novedadId }),
    ).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('soporta vigencia hasta opcional (indefinida) y emite notificacion en tiempo real a los destinatarios', async () => {
    const eventosVecino: NotificacionEvento[] = []
    const eventosAdmin: NotificacionEvento[] = []
    const desuscribirVecino = suscribirNotificaciones(vecino, (e) => eventosVecino.push(e))
    const desuscribirAdmin = suscribirNotificaciones(administrador, (e) => eventosAdmin.push(e))

    try {
      const { novedadId } = await publicar({
        titulo: 'Reglamento de convivencia permanente',
        cuerpo: 'Horarios de descanso a partir de las 22hs.',
        vigenteDesde: new Date('2026-09-15'),
        vigenteHasta: null,
      })

      const novedadEnBd = await prismaBase.novedad.findUniqueOrThrow({
        where: { id: novedadId },
      })
      expect(novedadEnBd.vigenteHasta).toBeNull()

      const novedadesVecino = await listarNovedades(repo, RELOJ, {
        usuarioId: vecino,
        consorcioId,
      })
      const nov = novedadesVecino.find((n) => n.id === novedadId)
      expect(nov).toBeDefined()
      expect(nov?.estado).toBe('vigente')
      expect(nov?.vigenteHasta).toBeNull()

      // Comprobar tiempo real: el vecino (destinatario) recibe el evento, el administrador no
      expect(eventosVecino).toHaveLength(1)
      expect(eventosVecino[0]).toMatchObject({
        usuarioId: vecino,
        notificacion: {
          titulo: 'Novedad: Reglamento de convivencia permanente',
          tipo: 'novedad',
          consorcio: 'Mitre 456',
        },
      })
      expect(eventosAdmin).toHaveLength(0)
    } finally {
      desuscribirVecino()
      desuscribirAdmin()
    }
  })
})

describe('documentos', () => {
  const cargar = (titulo: string, visibleConsorcistas: boolean) =>
    cargarDocumento(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      clave: `documentos/${consorcioId}/${crypto.randomUUID()}/${titulo}.pdf`,
      tipoContenido: 'application/pdf',
      tipo: visibleConsorcistas ? 'reglamento_copropiedad' : 'contrato',
      titulo,
      visibleConsorcistas,
    })

  it('el no visible queda fuera de la lista del consorcista y dentro de la del administrador y el consejo', async () => {
    await cargar('Reglamento', true)
    await cargar('Contrato de limpieza', false)

    const titulos = async (usuarioId: string) =>
      (await listarDocumentos(repo, RELOJ, { usuarioId, consorcioId })).map((d) => d.titulo).sort()
    expect(await titulos(vecino)).toEqual(['Reglamento'])
    expect(await titulos(consejo)).toEqual(['Contrato de limpieza', 'Reglamento'])
    expect(await titulos(administrador)).toEqual(['Contrato de limpieza', 'Reglamento'])

    // Si esta procesado para las consultas solo le interesa al administrador.
    const estados = async (usuarioId: string) =>
      (await listarDocumentos(repo, RELOJ, { usuarioId, consorcioId })).map(
        (d) => d.estadoIndexacion,
      )
    expect(await estados(vecino)).toEqual([null])
    expect(await estados(consejo)).toEqual([null, null])
    expect(await estados(administrador)).toEqual(['pendiente', 'pendiente'])
  })

  it('la vista se pide en línea y la descarga como adjunto (RF-19)', async () => {
    const pedidos: { clave: string; enLinea?: boolean }[] = []
    const almacen = {
      async resolverLecturaAutorizada(
        clave: string,
        _segundos: number,
        opciones?: { enLinea?: boolean },
      ) {
        pedidos.push({ clave, enLinea: opciones?.enLinea })
        return `https://almacen.test/${clave}?${opciones?.enLinea ? 'inline' : 'attachment'}`
      },
    }
    const { documentoId } = await cargar('Reglamento', true)
    const doc = await verDocumento(almacen as never, repo, RELOJ, {
      usuarioId: vecino,
      consorcioId,
      documentoId,
    })
    expect(doc.vista).toMatch(/inline$/)
    expect(doc.descarga).toMatch(/attachment$/)
    expect(pedidos.map((p) => p.enLinea)).toEqual([true, undefined])
  })

  describe('eliminar', () => {
    const quien = (usuarioId: string) => ({ usuarioId, consorcioId })
    const almacenSinFallas = (borrados: string[] = []) => ({
      async eliminar(clave: string) {
        borrados.push(clave)
      },
    })

    it('el administrador elimina: se van la fila, los fragmentos y el objeto (RF-19)', async () => {
      const borrados: string[] = []
      const { documentoId } = await cargar('Reglamento', true)
      await prismaBase.fragmentoDocumento.create({
        data: { documentoId, numeroFragmento: 1, contenido: 'Art. 1' },
      })
      await eliminarDocumento(almacenSinFallas(borrados), repo, RELOJ, {
        ...quien(administrador),
        documentoId,
      })
      expect(await prismaBase.documentoConsorcio.count({ where: { id: documentoId } })).toBe(0)
      expect(await prismaBase.fragmentoDocumento.count({ where: { documentoId } })).toBe(0)
      expect(borrados).toHaveLength(1)
    })

    it('consorcista y consejo no eliminan', async () => {
      const { documentoId } = await cargar('Reglamento', true)
      for (const usuarioId of [vecino, consejo]) {
        await expect(
          eliminarDocumento(almacenSinFallas(), repo, RELOJ, { ...quien(usuarioId), documentoId }),
        ).rejects.toBeInstanceOf(RolInsuficiente)
      }
      expect(await prismaBase.documentoConsorcio.count({ where: { id: documentoId } })).toBe(1)
    })

    it('el acta firmada no se elimina', async () => {
      const { documentoId } = await cargar('Acta 2026', true)
      const asamblea = await prismaBase.asamblea.create({
        data: {
          consorcioId,
          tipo: 'ordinaria',
          titulo: 'Asamblea',
          fechaHora: new Date('2026-11-25T22:00:00Z'),
          lugar: 'SUM',
          organizadorId: administrador,
        },
      })
      for (const datos of [
        { estado: 'convocada' as const },
        { estado: 'en_curso' as const, constituidaEn: new Date() },
        { estado: 'finalizada' as const },
      ]) {
        await prismaBase.asamblea.update({ where: { id: asamblea.id }, data: datos })
      }
      await prismaBase.actaAsamblea.create({
        data: { consorcioId, asambleaId: asamblea.id, documentoId },
      })
      await expect(
        eliminarDocumento(almacenSinFallas(), repo, RELOJ, { ...quien(administrador), documentoId }),
      ).rejects.toBeInstanceOf(DocumentoDeActa)
      expect(await prismaBase.documentoConsorcio.count({ where: { id: documentoId } })).toBe(1)
    })

    it('si el almacén falla, la fila igual se borra', async () => {
      const { documentoId } = await cargar('Reglamento', true)
      const roto = {
        async eliminar() {
          throw new Error('almacén caído')
        },
      }
      await eliminarDocumento(roto, repo, RELOJ, { ...quien(administrador), documentoId })
      expect(await prismaBase.documentoConsorcio.count({ where: { id: documentoId } })).toBe(0)
    })

    it('eliminar dos veces: la segunda es no encontrado', async () => {
      const { documentoId } = await cargar('Reglamento', true)
      const datos = { ...quien(administrador), documentoId }
      await eliminarDocumento(almacenSinFallas(), repo, RELOJ, datos)
      await expect(eliminarDocumento(almacenSinFallas(), repo, RELOJ, datos)).rejects.toBeInstanceOf(
        NoEncontrado,
      )
    })

    it('el trabajo de indexación de un documento borrado termina sin lanzar', async () => {
      const { documentoId } = await cargar('Reglamento', true)
      await eliminarDocumento(almacenSinFallas(), repo, RELOJ, {
        ...quien(administrador),
        documentoId,
      })
      const manejador = manejadorIndexacion(
        almacenSinFallas() as never,
        {} as never,
        async () => [],
      )
      await expect(manejador({ documentoId })).resolves.toBeUndefined()
    })
  })

  it('nace pendiente con su trabajo de indexacion, y una clave ajena no se confirma', async () => {
    const { documentoId } = await cargar('Acta 2026', true)
    const documento = await prismaBase.documentoConsorcio.findUniqueOrThrow({
      where: { id: documentoId },
    })
    expect(documento.estadoIndexacion).toBe('pendiente')
    const trabajos = await prismaBase.trabajoPendiente.findMany({
      where: { tipo: 'indexar_documento' },
    })
    expect(trabajos).toHaveLength(1)
    expect(trabajos[0].carga).toEqual({ documentoId })

    await expect(
      cargarDocumento(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        clave: `documentos/${otroConsorcioId}/x/y.pdf`,
        tipoContenido: 'application/pdf',
        tipo: 'acta',
        titulo: 'Ajena',
        visibleConsorcistas: true,
      }),
    ).rejects.toThrow('No encontramos lo que buscabas.')
  })
})
