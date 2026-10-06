import { z } from 'zod'

import { descartarNovedad, listarNovedades } from '@/aplicacion/comunicacion/novedades'
import { listarDocumentos, reindexarDocumento } from '@/aplicacion/comunicacion/documentos'
import { marcarLeidas } from '@/aplicacion/comunicacion/mis-notificaciones'
import { altaProveedor } from '@/aplicacion/proveedores/proveedores'
import { vincularGasto } from '@/aplicacion/reclamos/asignar'
import { verReclamo } from '@/aplicacion/reclamos/consultar'
import { aplicarSugerencia, descartarSugerencia } from '@/aplicacion/reclamos/sugerencia'
import { transicionar } from '@/aplicacion/reclamos/transicionar'
import {
  altaEspacio,
  deshabilitarEspacio,
  editarEspacio,
  habilitarEspacio,
  listarEspacios,
} from '@/aplicacion/reservas/espacios'
import { cancelarReserva, listarReservas } from '@/aplicacion/reservas/reservar'
import {
  DIA,
  aFecha,
  type ContextoHerramienta,
  type Herramienta,
} from '@/aplicacion/asistente/base'

/**
 * Escrituras de gestion NO economica del asistente (RF-27). Como todas, se
 * proponen con tarjeta y solo se ejecutan al confirmar. Quedan fuera pagos,
 * gastos, liquidaciones, padron y todo lo que sube un archivo.
 */

const T = { type: 'string' }
const N = { type: 'integer' }
const ID = z.string().min(1)
const ESTADOS = ['abierto', 'asignado', 'en_curso', 'resuelto', 'cerrado', 'rechazado'] as const

const base = (ctx: ContextoHerramienta) => ({
  usuarioId: ctx.usuarioId,
  consorcioId: ctx.consorcioId,
})

function esc(
  nombre: string,
  descripcion: string,
  props: Record<string, unknown>,
  requeridos: string[],
  validar: z.ZodTypeAny,
  roles: Herramienta['roles'],
  resumir: Herramienta['resumir'],
  confirmar: Herramienta['confirmar'],
): Herramienta {
  return {
    nombre,
    descripcion,
    parametros: { type: 'object', properties: props, required: requeridos },
    validar,
    roles,
    escritura: true,
    resumir,
    confirmar,
  }
}

const reclamoDe = (args: unknown, ctx: ContextoHerramienta) =>
  verReclamo(ctx.repositorio, ctx.reloj, {
    ...base(ctx),
    reclamoId: (args as { reclamoId: string }).reclamoId,
  })

const espaciosDe = (ctx: ContextoHerramienta) =>
  listarEspacios(ctx.repositorio, ctx.reloj, { ...base(ctx), incluirInactivos: true })

const DatosEspacio = z.object({
  espacioId: z.string().optional(),
  nombre: z.string().min(1).max(80),
  capacidadMaxima: z.number().int().nonnegative().optional(),
  anticipacionMinimaHoras: z.number().int().nonnegative().optional(),
  anticipacionMaximaDias: z.number().int().nonnegative().optional(),
  duracionMaximaHoras: z.number().int().nonnegative().optional(),
  reservasMaxMesUnidad: z.number().int().nonnegative().optional(),
})
type DatosEspacio = z.infer<typeof DatosEspacio>

const propsEspacio = {
  nombre: T,
  capacidadMaxima: N,
  anticipacionMinimaHoras: N,
  anticipacionMaximaDias: N,
  duracionMaximaHoras: N,
  reservasMaxMesUnidad: N,
}

export const gestion: Herramienta[] = [
  esc(
    'cancelar_reserva',
    'Cancela una reserva (la propia; el administrador, cualquiera). Requiere reservaId.',
    { reservaId: T },
    ['reservaId'],
    z.object({ reservaId: ID }),
    'todos',
    async (args, ctx) => {
      const ahora = ctx.reloj.ahora().getTime()
      const r = (
        await listarReservas(ctx.repositorio, ctx.reloj, {
          ...base(ctx),
          desde: new Date(ahora - 365 * DIA),
          hasta: new Date(ahora + 365 * DIA),
        })
      ).find((x) => x.id === (args as { reservaId: string }).reservaId)
      return r
        ? `Cancelar la reserva de ${r.espacio} (unidad ${r.unidad}) del ${new Date(r.desde).toLocaleString('es-AR')}.`
        : 'Cancelar la reserva indicada.'
    },
    async (args, ctx) =>
      cancelarReserva(ctx.repositorio, ctx.reloj, {
        ...base(ctx),
        reservaId: (args as { reservaId: string }).reservaId,
      }),
  ),

  esc(
    'transicionar_reclamo',
    'Cambia el estado de un reclamo (abierto, asignado, en_curso, resuelto, cerrado, rechazado). Requiere reclamoId y hacia.',
    { reclamoId: T, hacia: { type: 'string', enum: [...ESTADOS] }, comentario: T },
    ['reclamoId', 'hacia'],
    z.object({ reclamoId: ID, hacia: z.enum(ESTADOS), comentario: z.string().optional() }),
    'todos',
    async (args, ctx) => {
      const r = await reclamoDe(args, ctx)
      return `Pasar el reclamo "${r.titulo}" de ${r.estado} a ${(args as { hacia: string }).hacia}.`
    },
    async (args, ctx) => {
      const a = args as { reclamoId: string; hacia: (typeof ESTADOS)[number]; comentario?: string }
      return transicionar(ctx.repositorio, ctx.reloj, {
        ...base(ctx),
        reclamoId: a.reclamoId,
        hacia: a.hacia,
        comentario: a.comentario ?? null,
      })
    },
  ),

  esc(
    'vincular_gasto_reclamo',
    'Vincula (o quita, con gastoId vacío) un gasto de un reclamo. Requiere reclamoId.',
    { reclamoId: T, gastoId: T },
    ['reclamoId'],
    z.object({ reclamoId: ID, gastoId: z.string().optional() }),
    ['administrador'],
    async (args, ctx) => {
      const r = await reclamoDe(args, ctx)
      return (args as { gastoId?: string }).gastoId
        ? `Vincular un gasto al reclamo "${r.titulo}".`
        : `Quitar el gasto vinculado al reclamo "${r.titulo}".`
    },
    async (args, ctx) => {
      const a = args as { reclamoId: string; gastoId?: string }
      return vincularGasto(ctx.repositorio, ctx.reloj, {
        ...base(ctx),
        reclamoId: a.reclamoId,
        gastoId: a.gastoId || null,
      })
    },
  ),

  ...(['aplicar', 'descartar'] as const).map((verbo) =>
    esc(
      `${verbo}_sugerencia`,
      `${verbo === 'aplicar' ? 'Aplica' : 'Descarta'} la sugerencia automática de un reclamo. Requiere reclamoId.`,
      { reclamoId: T },
      ['reclamoId'],
      z.object({ reclamoId: ID }),
      ['administrador'],
      async (args, ctx) =>
        `${verbo === 'aplicar' ? 'Aplicar' : 'Descartar'} la sugerencia del reclamo "${(await reclamoDe(args, ctx)).titulo}".`,
      async (args, ctx) =>
        (verbo === 'aplicar' ? aplicarSugerencia : descartarSugerencia)(
          ctx.repositorio,
          ctx.reloj,
          { ...base(ctx), reclamoId: (args as { reclamoId: string }).reclamoId },
        ),
    ),
  ),

  esc(
    'crear_espacio',
    'Crea un espacio común y sus reglas de reserva. Requiere nombre.',
    propsEspacio,
    ['nombre'],
    DatosEspacio,
    ['administrador'],
    async (args) => {
      const a = args as DatosEspacio
      return `Crear el espacio "${a.nombre}"${a.capacidadMaxima ? ` (capacidad ${a.capacidadMaxima})` : ''}.`
    },
    async (args, ctx) =>
      altaEspacio(ctx.repositorio, ctx.reloj, { ...base(ctx), ...(args as DatosEspacio) }),
  ),

  esc(
    'editar_espacio',
    'Edita un espacio común y sus reglas de reserva. Requiere espacioId y nombre.',
    { espacioId: T, ...propsEspacio },
    ['espacioId', 'nombre'],
    DatosEspacio.required({ espacioId: true }),
    ['administrador'],
    async (args) => `Editar el espacio "${(args as DatosEspacio).nombre}".`,
    async (args, ctx) => {
      const a = args as DatosEspacio & { espacioId: string }
      return editarEspacio(ctx.repositorio, ctx.reloj, { ...base(ctx), ...a })
    },
  ),

  esc(
    'deshabilitar_espacio',
    'Deshabilita un espacio común (cancela y avisa las reservas afectadas). Requiere espacioId y motivo; hasta (ISO) es opcional.',
    { espacioId: T, motivo: T, hasta: { type: 'string', description: 'Fin planificado, ISO' } },
    ['espacioId', 'motivo'],
    z.object({ espacioId: ID, motivo: z.string().min(1), hasta: z.string().optional() }),
    ['administrador'],
    async (args, ctx) => {
      const a = args as { espacioId: string; motivo: string; hasta?: string }
      const e = (await espaciosDe(ctx)).find((x) => x.id === a.espacioId)
      return `Deshabilitar ${e?.nombre ?? 'el espacio'} por "${a.motivo}"${a.hasta ? ` hasta el ${aFecha(a.hasta).toLocaleDateString('es-AR')}` : ''}. Se cancelan y avisan las reservas afectadas.`
    },
    async (args, ctx) => {
      const a = args as { espacioId: string; motivo: string; hasta?: string }
      return deshabilitarEspacio(ctx.repositorio, ctx.reloj, {
        ...base(ctx),
        espacioId: a.espacioId,
        motivo: a.motivo,
        hasta: a.hasta ? aFecha(a.hasta) : null,
      })
    },
  ),

  esc(
    'habilitar_espacio',
    'Vuelve a habilitar un espacio común. Requiere espacioId.',
    { espacioId: T },
    ['espacioId'],
    z.object({ espacioId: ID }),
    ['administrador'],
    async (args, ctx) =>
      `Habilitar ${(await espaciosDe(ctx)).find((x) => x.id === (args as { espacioId: string }).espacioId)?.nombre ?? 'el espacio'}.`,
    async (args, ctx) =>
      habilitarEspacio(ctx.repositorio, ctx.reloj, {
        ...base(ctx),
        espacioId: (args as { espacioId: string }).espacioId,
      }),
  ),

  esc(
    'descartar_novedad',
    'Oculta una novedad del inicio del usuario. Requiere novedadId.',
    { novedadId: T },
    ['novedadId'],
    z.object({ novedadId: ID }),
    'todos',
    async (args, ctx) => {
      const n = (await listarNovedades(ctx.repositorio, ctx.reloj, base(ctx))).find(
        (x) => x.id === (args as { novedadId: string }).novedadId,
      )
      return `Ocultar la novedad "${n?.titulo ?? ''}" de tu inicio.`
    },
    async (args, ctx) =>
      descartarNovedad(ctx.repositorio, ctx.reloj, {
        ...base(ctx),
        novedadId: (args as { novedadId: string }).novedadId,
      }),
  ),

  esc(
    'reindexar_documento',
    'Vuelve a procesar un documento para las consultas. Requiere documentoId.',
    { documentoId: T },
    ['documentoId'],
    z.object({ documentoId: ID }),
    ['administrador'],
    async (args, ctx) => {
      const d = (await listarDocumentos(ctx.repositorio, ctx.reloj, base(ctx))).find(
        (x) => x.id === (args as { documentoId: string }).documentoId,
      )
      return `Volver a procesar el documento "${d?.titulo ?? ''}".`
    },
    async (args, ctx) =>
      reindexarDocumento(ctx.repositorio, ctx.reloj, {
        ...base(ctx),
        documentoId: (args as { documentoId: string }).documentoId,
      }),
  ),

  esc(
    'crear_proveedor',
    'Da de alta un proveedor. Requiere razonSocial y cuit.',
    { razonSocial: T, cuit: T, rubroHabitualId: T, telefono: T, correo: T },
    ['razonSocial', 'cuit'],
    z.object({
      razonSocial: z.string().min(1),
      cuit: z.string().min(1),
      rubroHabitualId: z.string().optional(),
      telefono: z.string().optional(),
      correo: z.string().optional(),
    }),
    ['administrador'],
    async (args) => {
      const a = args as { razonSocial: string; cuit: string }
      return `Dar de alta al proveedor "${a.razonSocial}" (CUIT ${a.cuit}).`
    },
    async (args, ctx) => {
      const a = args as {
        razonSocial: string
        cuit: string
        rubroHabitualId?: string
        telefono?: string
        correo?: string
      }
      return altaProveedor(ctx.repositorio, ctx.reloj, {
        ...base(ctx),
        razonSocial: a.razonSocial,
        cuit: a.cuit,
        rubroHabitualId: a.rubroHabitualId ?? null,
        telefono: a.telefono ?? null,
        correo: a.correo ?? null,
      })
    },
  ),

  {
    ...esc(
      'marcar_notificaciones_leidas',
      'Marca como leídas todas las notificaciones del usuario.',
      {},
      [],
      z.object({}).passthrough(),
      'todos',
      async () => 'Marcar todas tus notificaciones como leídas.',
      async (_args, ctx) => marcarLeidas(ctx.reloj, ctx.usuarioId),
    ),
    sinConsorcio: true,
  },
]
