import { z } from 'zod'

import { conAutorizacion } from '@/aplicacion/autorizacion'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { ErrorDeAplicacion } from '@/compartido/errores'
import { publicarNovedad } from '@/aplicacion/comunicacion/novedades'
import { asignar, posiblesResponsables } from '@/aplicacion/reclamos/asignar'
import { verReclamo } from '@/aplicacion/reclamos/consultar'
import { registrarReclamo } from '@/aplicacion/reclamos/registrar'
import { listarEspacios } from '@/aplicacion/reservas/espacios'
import { reservar, unidadesParaReservar } from '@/aplicacion/reservas/reservar'
import { aFecha, type ContextoHerramienta, type Herramienta } from '@/aplicacion/asistente/base'

/**
 * Escrituras del asistente (RF-27). Ninguna se ejecuta al pedirla: `resumir` arma
 * la tarjeta desde la base y `confirmar` corre el caso de uso real tras el clic.
 */

const CrearReserva = z.object({
  espacioId: z.string(),
  unidadId: z.string(),
  desde: z.string(),
  hasta: z.string(),
  cantidadPersonas: z.number().int().positive().optional(),
  observaciones: z.string().optional(),
})

const CrearReclamo = z.object({
  titulo: z.string().min(1).max(140),
  descripcion: z.string().min(10),
  unidadId: z.string().optional(),
  urgencia: z.enum(['baja', 'media', 'alta', 'critica']).optional(),
})

const AsignarReclamo = z.object({
  reclamoId: z.string(),
  responsableId: z.string(),
  proveedorId: z.string().optional(),
  rubroId: z.string().optional(),
})

const PublicarNovedad = z.object({
  titulo: z.string().min(1).max(140),
  cuerpo: z.string().min(1),
  severidad: z.enum(['baja', 'media', 'alta', 'critica']).optional(),
  alcance: z.enum(['general', 'unidad', 'division', 'piso']).optional(),
  unidadId: z.string().optional(),
  division: z.string().optional(),
  piso: z.string().optional(),
  vigenteHasta: z.string().optional(),
})

/** Los consorcios donde la persona es administradora: es el alcance real de un aviso de cartera. */
async function consorciosAdministrados(ctx: ContextoHerramienta) {
  const alcance = await misConsorcios(ctx.repositorio, ctx.reloj, ctx.usuarioId)
  const hoy = ctx.reloj.hoy()
  const accesos = await Promise.all(
    alcance.map((c) => ctx.repositorio.accesoVigente(ctx.usuarioId, c.id, hoy)),
  )
  return alcance.filter((_, i) => accesos[i]?.roles.includes('administrador'))
}

const PublicarNovedadCartera = z.object({
  titulo: z.string().min(1).max(140),
  cuerpo: z.string().min(1),
  severidad: z.enum(['baja', 'media', 'alta', 'critica']).optional(),
})

export const escritura: Herramienta[] = [
  {
    nombre: 'crear_reserva',
    descripcion:
      'Reserva un espacio común para una unidad en un horario (ISO). Requiere espacioId, unidadId, desde y hasta.',
    parametros: {
      type: 'object',
      properties: {
        espacioId: { type: 'string' },
        unidadId: { type: 'string' },
        desde: { type: 'string', description: 'Inicio ISO' },
        hasta: { type: 'string', description: 'Fin ISO' },
        cantidadPersonas: { type: 'integer' },
        observaciones: { type: 'string' },
      },
      required: ['espacioId', 'unidadId', 'desde', 'hasta'],
    },
    validar: CrearReserva,
    roles: 'todos',
    escritura: true,
    async resumir(args, ctx) {
      const a = args as z.infer<typeof CrearReserva>
      const [espacios, unidades] = await Promise.all([
        listarEspacios(ctx.repositorio, ctx.reloj, {
          usuarioId: ctx.usuarioId,
          consorcioId: ctx.consorcioId,
          incluirInactivos: true,
        }),
        unidadesParaReservar(ctx.repositorio, ctx.reloj, {
          usuarioId: ctx.usuarioId,
          consorcioId: ctx.consorcioId,
        }),
      ])
      const espacio = espacios.find((e) => e.id === a.espacioId)?.nombre ?? 'espacio'
      const unidad = unidades.find((u) => u.id === a.unidadId)?.designacion ?? 'unidad'
      const desde = aFecha(a.desde)
      const hasta = aFecha(a.hasta)
      return `Reservar ${espacio} para la unidad ${unidad}, desde ${desde.toLocaleString('es-AR')} hasta ${hasta.toLocaleString('es-AR')}.`
    },
    async confirmar(args, ctx) {
      const a = args as z.infer<typeof CrearReserva>
      return reservar(ctx.repositorio, ctx.reloj, {
        usuarioId: ctx.usuarioId,
        consorcioId: ctx.consorcioId,
        espacioId: a.espacioId,
        unidadId: a.unidadId,
        desde: aFecha(a.desde),
        hasta: aFecha(a.hasta),
        cantidadPersonas: a.cantidadPersonas ?? null,
        observaciones: a.observaciones ?? null,
      })
    },
  },
  {
    nombre: 'crear_reclamo',
    descripcion: 'Registra un reclamo. Requiere título y descripción (mínimo 10 caracteres).',
    parametros: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        descripcion: { type: 'string' },
        unidadId: { type: 'string' },
        urgencia: { type: 'string', enum: ['baja', 'media', 'alta', 'critica'] },
      },
      required: ['titulo', 'descripcion'],
    },
    validar: CrearReclamo,
    roles: 'todos',
    escritura: true,
    async resumir(args) {
      const a = args as z.infer<typeof CrearReclamo>
      return `Registrar el reclamo "${a.titulo}"${a.urgencia ? ` (urgencia ${a.urgencia})` : ''}.`
    },
    async confirmar(args, ctx) {
      const a = args as z.infer<typeof CrearReclamo>
      return registrarReclamo(ctx.repositorio, ctx.reloj, {
        usuarioId: ctx.usuarioId,
        consorcioId: ctx.consorcioId,
        titulo: a.titulo,
        descripcion: a.descripcion,
        unidadId: a.unidadId ?? null,
        urgencia: a.urgencia,
      })
    },
  },
  {
    nombre: 'asignar_reclamo',
    descripcion: 'Asigna un reclamo a un responsable. Requiere reclamoId y responsableId.',
    parametros: {
      type: 'object',
      properties: {
        reclamoId: { type: 'string' },
        responsableId: { type: 'string' },
        proveedorId: { type: 'string' },
        rubroId: { type: 'string' },
      },
      required: ['reclamoId', 'responsableId'],
    },
    validar: AsignarReclamo,
    roles: ['administrador'],
    escritura: true,
    async resumir(args, ctx) {
      const a = args as z.infer<typeof AsignarReclamo>
      const [reclamo, responsables] = await Promise.all([
        verReclamo(ctx.repositorio, ctx.reloj, {
          usuarioId: ctx.usuarioId,
          consorcioId: ctx.consorcioId,
          reclamoId: a.reclamoId,
        }),
        conAutorizacion(
          ctx.repositorio,
          ctx.reloj,
          {
            usuarioId: ctx.usuarioId,
            consorcioId: ctx.consorcioId,
            rolesPermitidos: ['administrador'],
            accion: 'ver responsables',
          },
          async () => posiblesResponsables(ctx.consorcioId),
        ),
      ])
      const responsable =
        responsables.find((r) => r.id === a.responsableId)?.nombre ?? 'el responsable'
      return `Asignar el reclamo "${reclamo.titulo}" a ${responsable}.`
    },
    async confirmar(args, ctx) {
      const a = args as z.infer<typeof AsignarReclamo>
      return asignar(ctx.repositorio, ctx.reloj, {
        usuarioId: ctx.usuarioId,
        consorcioId: ctx.consorcioId,
        reclamoId: a.reclamoId,
        responsableId: a.responsableId,
        proveedorId: a.proveedorId ?? null,
        rubroId: a.rubroId ?? null,
      })
    },
  },
  {
    nombre: 'publicar_novedad',
    descripcion:
      'Publica una novedad del consorcio (notifica a los destinatarios). Requiere título y cuerpo.',
    parametros: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        cuerpo: { type: 'string' },
        severidad: { type: 'string', enum: ['baja', 'media', 'alta', 'critica'] },
        alcance: { type: 'string', enum: ['general', 'unidad', 'division', 'piso'] },
        unidadId: { type: 'string' },
        division: { type: 'string' },
        piso: { type: 'string' },
        vigenteHasta: { type: 'string', description: 'Fecha ISO de fin de vigencia' },
      },
      required: ['titulo', 'cuerpo'],
    },
    validar: PublicarNovedad,
    roles: ['administrador'],
    escritura: true,
    async resumir(args) {
      const a = args as z.infer<typeof PublicarNovedad>
      const destino =
        !a.alcance || a.alcance === 'general'
          ? 'todo el consorcio'
          : a.alcance === 'unidad'
            ? 'una unidad'
            : a.alcance === 'division'
              ? `la división ${a.division ?? ''}`
              : `el piso ${a.piso ?? ''}`
      return `Publicar la novedad "${a.titulo}" para ${destino}.`
    },
    async confirmar(args, ctx) {
      const a = args as z.infer<typeof PublicarNovedad>
      return publicarNovedad(ctx.repositorio, ctx.reloj, {
        usuarioId: ctx.usuarioId,
        consorcioId: ctx.consorcioId,
        titulo: a.titulo,
        cuerpo: a.cuerpo,
        severidad: a.severidad,
        alcance: a.alcance,
        unidadId: a.unidadId ?? null,
        division: a.division ?? null,
        piso: a.piso ?? null,
        vigenteHasta: a.vigenteHasta ? aFecha(a.vigenteHasta) : null,
      })
    },
  },
  {
    nombre: 'publicar_novedad_cartera',
    descripcion:
      'Publica una novedad general en TODOS los consorcios que el usuario administra, con una sola confirmación. Requiere título y cuerpo.',
    parametros: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        cuerpo: { type: 'string' },
        severidad: { type: 'string', enum: ['baja', 'media', 'alta', 'critica'] },
      },
      required: ['titulo', 'cuerpo'],
    },
    validar: PublicarNovedadCartera,
    roles: ['administrador'],
    escritura: true,
    sinConsorcio: true,
    cartera: true,
    async resumir(args, ctx) {
      const a = args as z.infer<typeof PublicarNovedadCartera>
      const propios = await consorciosAdministrados(ctx)
      return `Publicar la novedad "${a.titulo}" en los ${propios.length} consorcios que administrás: ${propios.map((c) => c.nombre).join(', ')}.`
    },
    // Sin transaccion que cruce consorcios: cada uno abre su propio contexto
    // aislado (`publicarNovedad` autoriza y aisla por su cuenta). Es de mejor
    // esfuerzo y reporta lo que fallo; solo si fallan todos se lanza, para que
    // la propuesta vuelva a `pendiente` sin duplicar lo ya publicado.
    async confirmar(args, ctx) {
      const a = args as z.infer<typeof PublicarNovedadCartera>
      const propios = await consorciosAdministrados(ctx)
      const fallidas: { consorcio: string; motivo: string }[] = []
      let publicadas = 0
      let primero: unknown
      for (const c of propios) {
        try {
          await publicarNovedad(ctx.repositorio, ctx.reloj, {
            usuarioId: ctx.usuarioId,
            consorcioId: c.id,
            titulo: a.titulo,
            cuerpo: a.cuerpo,
            severidad: a.severidad,
          })
          publicadas++
        } catch (error) {
          if (!(error instanceof ErrorDeAplicacion)) throw error
          primero ??= error
          fallidas.push({ consorcio: c.nombre, motivo: error.mensajeParaUsuario })
        }
      }
      if (publicadas === 0 && primero) throw primero
      const texto = fallidas.length
        ? `Publicada en ${publicadas} de ${propios.length}. No se pudo en ${fallidas.map((f) => `${f.consorcio} (${f.motivo})`).join('; ')}.`
        : `Publicada en los ${publicadas} consorcios.`
      return { texto }
    },
  },
]
