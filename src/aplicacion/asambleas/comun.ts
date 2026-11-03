import type { Asamblea, TipoNotificacion } from '@prisma/client'

import { NoEncontrado } from '@/compartido/errores'
import { momentoParaMostrar } from '@/compartido/formato'
import type { AccesoVigente } from '@/dominio/contratos/repositorios'
import type { Rol } from '@/dominio/identidad/rol'
import { enlaceGoogleCalendar, type EventoAsamblea } from '@/dominio/asambleas/calendario'
import { notificar, type Transaccion } from '@/aplicacion/comunicacion/notificar'
import { prisma } from '@/infraestructura/prisma'
import {
  propietariosVigentesDe,
  type PropietarioVigente,
} from '@/infraestructura/repositorios/ocupaciones'

import { NoDirige, NoPuedeDirigir } from './errores'

/** Crear y convocar: consejo o administración (FR-001). */
export const ROLES_ORGANIZADORES: readonly Rol[] = ['administrador', 'consejo']

/**
 * Dirigir, cargar votos y registrar papeles (research R-14): el consejo
 * siempre; la administración solo si está invitada (FR-036).
 */
export const puedeDirigir = (
  acceso: AccesoVigente,
  asamblea: Pick<Asamblea, 'administracionInvitada'>,
): boolean =>
  acceso.roles.includes('consejo') ||
  (acceso.roles.includes('administrador') && asamblea.administracionInvitada)

export function exigirPuedeDirigir(
  acceso: AccesoVigente,
  asamblea: Pick<Asamblea, 'administracionInvitada'>,
): void {
  if (!puedeDirigir(acceso, asamblea)) throw new NoPuedeDirigir()
}

export function exigirDirige(acceso: AccesoVigente, asamblea: Asamblea): void {
  exigirPuedeDirigir(acceso, asamblea)
  if (asamblea.dirigeId !== acceso.usuarioId) throw new NoDirige()
}

/** Dentro de `conAutorizacion`: el cliente aislado ya filtra por consorcio. */
export async function cargarAsamblea(
  asambleaId: string,
  cliente: Transaccion | typeof prisma = prisma,
) {
  const asamblea = await cliente.asamblea.findFirst({ where: { id: asambleaId } })
  if (!asamblea) throw new NoEncontrado('RF-29')
  return asamblea
}

const ZONA = 'America/Argentina/Buenos_Aires'

/** El día calendario de Argentina de un instante, como fecha UTC a medianoche (igual que `Reloj.hoy`). */
export function diaEnArgentina(instante: Date): Date {
  const [anio, mes, dia] = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(instante)
    .split('-')
    .map(Number)
  return new Date(Date.UTC(anio, mes - 1, dia))
}

export const DIA_MS = 86_400_000

export const horaParaMostrar = (instante: Date): string =>
  momentoParaMostrar(instante.toISOString())

export function urlPublica(): string {
  return (process.env.URL_PUBLICA || 'http://localhost:3000').replace(/\/$/, '')
}

export const rutaAsamblea = (consorcioId: string, asambleaId: string) =>
  `/consorcios/${consorcioId}/asambleas/${asambleaId}`

export function eventoDe(
  asamblea: Pick<Asamblea, 'id' | 'titulo' | 'fechaHora' | 'lugar' | 'consorcioId'>,
  puntos: { orden: number; titulo: string }[],
  consorcio: string,
): EventoAsamblea {
  const orden = puntos
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((p) => `${p.orden}. ${p.titulo}`)
    .join('\n')
  return {
    id: asamblea.id,
    titulo: `${asamblea.titulo} — ${consorcio}`,
    inicio: asamblea.fechaHora,
    lugar: asamblea.lugar,
    descripcion: `Orden del día:\n${orden}`,
    enlace: `${urlPublica()}${rutaAsamblea(asamblea.consorcioId, asamblea.id)}`,
  }
}

export const enlaceCalendario = (evento: EventoAsamblea) => enlaceGoogleCalendar(evento)

/** Las unidades vigentes del consorcio activo (nota 23: sin las dadas de baja). */
export async function unidadesVigentes(cliente: Transaccion | typeof prisma = prisma) {
  return cliente.unidad.findMany({
    where: { bajaDesde: null },
    select: { id: true, designacion: true, coeficiente: true },
  })
}

export interface Destinatarios {
  conUsuario: string[]
  /** Propietarios sin cuenta, con correo: van por `correo_directo` (research R-07). */
  porCorreo: { destino: string; nombre: string }[]
  /** Sin cuenta ni correo: se informan para convocarlos por otro medio (FR-009). */
  sinContacto: { unidad: string; nombre: string }[]
}

export function repartirPropietarios(
  propietarios: PropietarioVigente[],
  designaciones: Map<string, string>,
): Destinatarios {
  const conUsuario = new Set<string>()
  const porCorreo = new Map<string, { destino: string; nombre: string }>()
  const sinContacto: { unidad: string; nombre: string }[] = []
  for (const p of propietarios) {
    if (p.usuarioId) conUsuario.add(p.usuarioId)
    else if (p.correo) porCorreo.set(p.correo, { destino: p.correo, nombre: p.nombre })
    else sinContacto.push({ unidad: designaciones.get(p.unidadId) ?? '', nombre: p.nombre })
  }
  return { conUsuario: [...conUsuario], porCorreo: [...porCorreo.values()], sinContacto }
}

/** Los propietarios vigentes de unas unidades, repartidos por canal. */
export async function propietariosPorCanal(
  unidades: { id: string; designacion: string }[],
  fecha: Date,
): Promise<Destinatarios> {
  const propietarios = await propietariosVigentesDe(
    unidades.map((u) => u.id),
    fecha,
  )
  return repartirPropietarios(propietarios, new Map(unidades.map((u) => [u.id, u.designacion])))
}

/** Los administradores habilitados sobre el consorcio activo. */
export async function administradoresDelConsorcio(tx: Transaccion): Promise<string[]> {
  const filas = await tx.habilitacion.findMany({
    where: { rol: 'administrador', vigenciaHasta: null },
    select: { usuarioId: true },
    distinct: ['usuarioId'],
  })
  return filas.map((f) => f.usuarioId)
}

/**
 * Avisa por los dos canales (FR-006): en Flay a quien tiene usuario, por correo
 * directo a quien no. Todo en la transacción del caso de uso.
 */
export async function avisarPorLosDosCanales(
  tx: Transaccion,
  aviso: {
    tipo: TipoNotificacion
    titulo: string
    cuerpo: string
    asambleaId: string
    usuarios: string[]
    porCorreo: { destino: string }[]
  },
): Promise<void> {
  await notificar(
    tx,
    [...new Set(aviso.usuarios)].map((usuarioId) => ({
      usuarioId,
      tipo: aviso.tipo,
      titulo: aviso.titulo,
      cuerpo: aviso.cuerpo,
      entidadTipo: 'asamblea',
      entidadId: aviso.asambleaId,
    })),
  )
  for (const { destino } of aviso.porCorreo) {
    // Como `encolar`, en SQL: `proximo_intento` lo pone el reloj de la base (nota 9).
    await tx.$executeRaw`
      INSERT INTO "TrabajoPendiente" (tipo, carga)
      VALUES ('correo_directo'::"TipoTrabajo",
              ${JSON.stringify({ destino, titulo: aviso.titulo, cuerpo: aviso.cuerpo })}::jsonb)`
  }
}
