import { PrismaClient } from '@prisma/client'

/**
 * Lo que `004-servicios` agrega al juego de § 13.4: los usuarios ficticios de
 * `usuarios.csv` (sin contraseña salvo que la semilla reciba una derivada:
 * entonces entran todos, con la misma, para la demostracion), dos espacios comunes por consorcio, los reclamos de
 * `reclamos.csv` con su historial, y el reglamento ficticio como documento del
 * consorcio de 12 unidades, en `pendiente` con su trabajo de indexacion.
 *
 * Deterministica e idempotente como el resto: dos corridas dejan lo mismo.
 * Sin alias de rutas: la importan las pruebas y el guion de semilla.
 */

const HOY = new Date('2026-01-01')

const USUARIOS = [
  {
    clave: 'admin1',
    nombre: 'Adriana',
    apellido: 'Delta',
    correo: 'admin1@flay.demo',
    roles: [
      ['C-A', 'administrador'],
      ['C-B', 'administrador'],
    ],
  },
  {
    clave: 'consejo1',
    nombre: 'Carlos',
    apellido: 'Consejo',
    correo: 'consejo1@flay.demo',
    roles: [
      ['C-A', 'consejo'],
      ['C-A', 'consorcista'],
    ],
    unidad: ['C-A', '2A'],
  },
  {
    clave: 'vecino1a',
    nombre: 'Valeria',
    apellido: 'Vecina',
    correo: 'vecino1a@flay.demo',
    roles: [['C-A', 'consorcista']],
    unidad: ['C-A', '1A'],
  },
  {
    clave: 'moroso3b',
    nombre: 'Martin',
    apellido: 'Moroso',
    correo: 'moroso3b@flay.demo',
    roles: [['C-A', 'consorcista']],
    unidad: ['C-A', '3B'],
  },
  {
    clave: 'inquilino1c',
    nombre: 'Ines',
    apellido: 'Inquilina',
    correo: 'inquilino1c@flay.demo',
    roles: [['C-A', 'consorcista']],
    unidad: ['C-A', '1C'],
    inquilina: true,
  },
  {
    clave: 'operador1',
    nombre: 'Oscar',
    apellido: 'Operador',
    correo: 'operador1@flay.demo',
    roles: [['C-B', 'administrador']],
  },
  {
    clave: 'vecinob010',
    nombre: 'Beatriz',
    apellido: 'Vecina',
    correo: 'vecinob010@flay.demo',
    roles: [['C-B', 'consorcista']],
    unidad: ['C-B', '2B'],
  },
] as const

const ESPACIOS = [
  { nombre: 'Salon de usos multiples', capacidadMaxima: 40 },
  { nombre: 'Quincho', capacidadMaxima: 25 },
] as const

/** Los codigos de `rubros-semilla.csv` contra los nombres del catalogo global. */
const RUBRO_POR_CODIGO: Record<string, string> = {
  R02: 'Limpieza',
  R04: 'Energia electrica',
  R07: 'Mantenimiento de ascensores',
  R10: 'Reparaciones menores',
}

type EstadoReclamo = 'abierto' | 'asignado' | 'en_curso' | 'resuelto' | 'cerrado'

/** `reclamos.csv`, con el recorrido de estados que cada uno ya hizo. Horas desde la apertura. */
const RECLAMOS: {
  consorcio: 'C-A' | 'C-B'
  autor: string
  rubro: string
  titulo: string
  urgencia: 'media' | 'alta'
  recorrido: [EstadoReclamo, number][]
  responsable?: string
}[] = [
  {
    consorcio: 'C-A',
    autor: 'vecino1a',
    rubro: 'R10',
    titulo: 'Filtracion en la cocina',
    urgencia: 'media',
    responsable: 'admin1',
    recorrido: [
      ['abierto', 0],
      ['asignado', 4],
      ['en_curso', 30],
      ['resuelto', 96],
      ['cerrado', 120],
    ],
  },
  {
    consorcio: 'C-A',
    autor: 'inquilino1c',
    rubro: 'R07',
    titulo: 'Ascensor ruidoso',
    urgencia: 'alta',
    responsable: 'admin1',
    recorrido: [
      ['abierto', 0],
      ['asignado', 2],
      ['en_curso', 6],
    ],
  },
  {
    consorcio: 'C-A',
    autor: 'moroso3b',
    rubro: 'R04',
    titulo: 'Luz del palier quemada',
    urgencia: 'media',
    recorrido: [['abierto', 0]],
  },
  {
    consorcio: 'C-B',
    autor: 'vecinob010',
    rubro: 'R02',
    titulo: 'Luz del pasillo del piso 3',
    urgencia: 'media',
    responsable: 'operador1',
    recorrido: [
      ['abierto', 0],
      ['asignado', 8],
      ['en_curso', 24],
      ['resuelto', 40],
      ['cerrado', 48],
    ],
  },
  {
    consorcio: 'C-B',
    autor: 'vecinob010',
    rubro: 'R10',
    titulo: 'Perdida de agua en el patio',
    urgencia: 'alta',
    responsable: 'operador1',
    recorrido: [
      ['abierto', 0],
      ['asignado', 1],
      ['en_curso', 3],
    ],
  },
]

const APERTURA = new Date('2026-06-02T12:00:00Z')

export interface ConsorciosSembrados {
  'C-A': string
  'C-B': string
}

export interface ServiciosSembrados {
  usuarios: Record<string, string>
  espacios: number
  reclamos: number
  documentoId: string | null
}

/**
 * `guardar` es opcional: sin almacen, el documento queda registrado igual y la
 * indexacion lo reporta como error legible cuando lo intente.
 */
export async function sembrarServicios(
  cliente: PrismaClient,
  consorcios: ConsorciosSembrados,
  opciones: {
    reglamento?: { titulo: string; contenido: Buffer; tipoContenido: string }
    guardar?: (clave: string, bytes: Buffer, tipoContenido: string) => Promise<void>
    /** Con clave derivada, los usuarios nacen activos: es lo que permite entrar como cada rol en la demostracion. */
    claveDerivada?: string
  } = {},
): Promise<ServiciosSembrados> {
  const usuarios: Record<string, string> = {}

  for (const definicion of USUARIOS) {
    const existente = await cliente.usuario.findUnique({ where: { correo: definicion.correo } })
    let usuarioId = existente?.id
    if (!usuarioId) {
      const persona = await cliente.persona.create({
        data: {
          nombre: definicion.nombre,
          apellido: definicion.apellido,
          correo: definicion.correo,
        },
      })
      usuarioId = (
        await cliente.usuario.create({
          data: opciones.claveDerivada
            ? {
                personaId: persona.id,
                correo: definicion.correo,
                estado: 'activo',
                claveDerivada: opciones.claveDerivada,
              }
            : { personaId: persona.id, correo: definicion.correo, estado: 'invitado' },
        })
      ).id
      for (const [consorcio, rol] of definicion.roles) {
        await cliente.habilitacion.create({
          data: { usuarioId, consorcioId: consorcios[consorcio], rol, vigenciaDesde: HOY },
        })
      }
      if ('unidad' in definicion) {
        const [consorcio, designacion] = definicion.unidad
        const unidad = await cliente.unidad.findUniqueOrThrow({
          where: { consorcioId_designacion: { consorcioId: consorcios[consorcio], designacion } },
        })
        const tipo = 'inquilina' in definicion ? 'inquilino' : 'propietario'
        await cliente.$executeRaw`
          INSERT INTO "Ocupacion" (unidad_id, persona_id, tipo, vigencia)
          VALUES (${unidad.id}::uuid, ${persona.id}::uuid, ${tipo}::"TipoOcupacion", daterange(${HOY}::date, NULL))
        `
      }
    }
    usuarios[definicion.clave] = usuarioId
  }

  let espacios = 0
  for (const consorcioId of Object.values(consorcios)) {
    for (const espacio of ESPACIOS) {
      await cliente.espacioComun.upsert({
        where: { consorcioId_nombre: { consorcioId, nombre: espacio.nombre } },
        update: {},
        create: { consorcioId, ...espacio },
      })
      espacios++
    }
  }

  let reclamos = 0
  for (const definicion of RECLAMOS) {
    const consorcioId = consorcios[definicion.consorcio]
    const yaEsta = await cliente.reclamo.findFirst({
      where: { consorcioId, titulo: definicion.titulo },
    })
    if (yaEsta) continue

    const rubro = await cliente.rubroGasto.findUnique({
      where: { nombre: RUBRO_POR_CODIGO[definicion.rubro] },
    })
    const autorClave = definicion.autor
    const autor = USUARIOS.find((u) => u.clave === autorClave)
    const unidad =
      autor && 'unidad' in autor
        ? await cliente.unidad.findUnique({
            where: {
              consorcioId_designacion: { consorcioId, designacion: autor.unidad[1] },
            },
          })
        : null
    const [ultimoEstado, ultimasHoras] = definicion.recorrido[definicion.recorrido.length - 1]
    const enHoras = (h: number) => new Date(APERTURA.getTime() + h * 3_600_000)
    const resuelto = definicion.recorrido.find(([estado]) => estado === 'resuelto')

    const reclamo = await cliente.reclamo.create({
      data: {
        consorcioId,
        unidadId: unidad?.id ?? null,
        creadoPor: usuarios[definicion.autor],
        titulo: definicion.titulo,
        descripcion: `${definicion.titulo}. Reclamo del juego ficticio de § 13.4.`,
        rubroId: rubro?.id ?? null,
        urgencia: definicion.urgencia,
        estado: ultimoEstado,
        responsableId: definicion.responsable ? usuarios[definicion.responsable] : null,
        fechaApertura: APERTURA,
        fechaResolucion: resuelto ? enHoras(resuelto[1]) : null,
        actualizadoEn: enHoras(ultimasHoras),
      },
    })
    let anterior: EstadoReclamo | null = null
    for (const [estado, horas] of definicion.recorrido) {
      await cliente.reclamoHistorial.create({
        data: {
          reclamoId: reclamo.id,
          estadoAnterior: anterior,
          estadoNuevo: estado,
          usuarioId:
            anterior === null || !definicion.responsable
              ? usuarios[definicion.autor]
              : usuarios[definicion.responsable],
          ocurridoEn: enHoras(horas),
        },
      })
      anterior = estado
    }
    reclamos++
  }

  let documentoId: string | null = null
  if (opciones.reglamento) {
    const consorcioId = consorcios['C-A']
    const existente = await cliente.documentoConsorcio.findFirst({
      where: { consorcioId, titulo: opciones.reglamento.titulo },
    })
    if (existente) {
      documentoId = existente.id
    } else {
      const id = crypto.randomUUID()
      const clave = `documentos/${consorcioId}/${id}`
      if (opciones.guardar) {
        await opciones.guardar(
          clave,
          opciones.reglamento.contenido,
          opciones.reglamento.tipoContenido,
        )
      }
      await cliente.documentoConsorcio.create({
        data: {
          id,
          consorcioId,
          tipo: 'reglamento_copropiedad',
          titulo: opciones.reglamento.titulo,
          claveAlmacenamiento: clave,
          tipoContenido: opciones.reglamento.tipoContenido,
          fechaDocumento: new Date('2024-03-15'),
          visibleConsorcistas: true,
          cargadoPor: usuarios.admin1,
        },
      })
      await cliente.$executeRaw`
        INSERT INTO "TrabajoPendiente" (tipo, carga)
        VALUES ('indexar_documento'::"TipoTrabajo", jsonb_build_object('documentoId', ${id}::text))
      `
      documentoId = id
    }
  }

  return { usuarios, espacios, reclamos, documentoId }
}
