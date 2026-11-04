import type {
  EstadoActa,
  EstadoAsamblea,
  EstadoPunto,
  MayoriaRequerida,
  ModalidadPunto,
  ReglaMayoria,
  ResultadoPunto,
  RolFirmante,
  TipoAsamblea,
} from '@prisma/client'

import { Decimal } from '@/compartido/dinero'
import { NoEncontrado } from '@/compartido/errores'
import { coeficienteSerializado, DECIMALES_COEFICIENTE } from '@/compartido/formato'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { Rol } from '@/dominio/identidad/rol'
import { estadoDecision, type EstadoDecision } from '@/dominio/asambleas/provisoria'
import { textoIcs } from '@/dominio/asambleas/calendario'
import { segundaConvocatoria } from '@/dominio/asambleas/quorum'
import { conteo, type Conteo, type UnidadPadron, type Voto } from '@/dominio/asambleas/resultado'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import { propietariosVigentesDe } from '@/infraestructura/repositorios/ocupaciones'

import {
  cargarAsamblea,
  enlaceCalendario,
  eventoDe,
  puedeDirigir,
  ROLES_ORGANIZADORES,
  unidadesVigentes,
} from './comun'

const organiza = (roles: readonly Rol[]): boolean =>
  roles.some((r) => ROLES_ORGANIZADORES.includes(r))

/**
 * Lo que dibujan las pantallas de asambleas (FR-023). Una sola lectura por
 * refresco, entrando por la asamblea (research R-01): la vista en vivo la pide
 * cada 3 s. Los coeficientes viajan como cadena (Principio II).
 */

export interface CuentaVista {
  unidades: number
  coeficiente: string
}

export interface ConteoVista {
  porOpcion: Record<string, CuentaVista>
  basePresentes: CuentaVista
  baseTotal: CuentaVista
}

export interface PuntoVista {
  id: string
  orden: number
  titulo: string
  descripcion: string | null
  modalidad: ModalidadPunto
  mayoria: MayoriaRequerida | null
  estado: EstadoPunto
  opciones: { id: string; texto: string }[]
  resultado: ResultadoPunto | null
  opcionGanadora: string | null
  provisorio: boolean
  vencePlazoOposicion: string | null
  estadoDecision: EstadoDecision | null
  conteo: ConteoVista | null
  votos: {
    unidadId: string
    designacion: string
    clave: string
    eleccion: string
    cargaManual: boolean
  }[]
  oposiciones: string[]
  resumen: string | null
}

export interface UnidadVista {
  unidadId: string
  designacion: string
  coeficiente: string
  sinVoto: boolean
  presente: boolean
  representante: string | null
  representacion: 'propietario' | 'apoderado' | null
  /** Usuario que la representa; nulo si se acreditó a alguien sin cuenta. */
  representanteId: string | null
  /** Nombres de los propietarios vigentes de la unidad (para buscar al acreditar). */
  propietarios?: string[]
}

export interface MiUnidad {
  unidadId: string
  designacion: string
  como: 'propietario' | 'apoderado'
  /** La acreditó alguien (yo u otro). */
  acreditada: boolean
  /** La represento yo. */
  laRepresentoYo: boolean
}

export interface VistaAsamblea {
  id: string
  consorcioId: string
  titulo: string
  tipo: TipoAsamblea
  fechaHora: string
  segundaConvocatoria: string
  lugar: string
  estado: EstadoAsamblea
  administracionInvitada: boolean
  motivoCancelacion: string | null
  constituida: boolean
  convocatoriaQueRige: 'primera' | 'segunda' | null
  reglaMayoria: ReglaMayoria | null
  topeApoderado: number | null
  organizador: string
  dirige: { id: string; nombre: string } | null
  presidente: { id: string; nombre: string } | null
  secretario: { id: string; nombre: string } | null
  enlaceGoogleCalendar: string
  puntos: PuntoVista[]
  padron: UnidadVista[]
  quorum: { coeficientePresente: string; unidadesPresentes: number; unidadesTotales: number }
  poderes: {
    id: string
    unidadId: string
    designacion: string
    otorgante: string
    apoderadoId: string
    apoderado: string
    papel: boolean
    revocado: boolean
    /** El otorgante ya no es propietario: el poder no vale (caso borde). */
    sinEfecto: boolean
  }[]
  acta: {
    estado: EstadoActa
    hashContenido: string | null
    documentoId: string | null
    firmantes: {
      id: string
      usuarioId: string
      nombre: string
      rol: RolFirmante
      firmadoEn: string | null
      reemplazo: boolean
    }[]
  } | null
  yo: {
    usuarioId: string
    puedeDirigir: boolean
    dirige: boolean
    esOrganizador: boolean
    esAdministrador: boolean
    esSecretario: boolean
    misUnidades: MiUnidad[]
    /** Unidades donde soy propietario vigente: para otorgar poderes. */
    unidadesPropias: { unidadId: string; designacion: string }[]
    /** Por punto, las unidades que represento y ya votaron. */
    votadas: Record<string, string[]>
    /** Puntos provisorios en plazo a los que puedo oponerme, con la unidad. */
    puedoOponerme: { puntoId: string; unidadId: string; designacion: string }[]
    esFirmantePendiente: boolean
  }
  /** Para cargar papeles (poder, oposición): solo a quien puede dirigir o administra. */
  propietariosSinCuenta: {
    unidadId: string
    designacion: string
    personaId: string
    nombre: string
  }[]
}

const cuenta = (c: { unidades: number; coeficiente: Decimal }): CuentaVista => ({
  unidades: c.unidades,
  coeficiente: c.coeficiente.toFixed(DECIMALES_COEFICIENTE),
})

export const conteoVista = (c: Conteo): ConteoVista => ({
  porOpcion: Object.fromEntries(Object.entries(c.porOpcion).map(([k, v]) => [k, cuenta(v)])),
  basePresentes: cuenta(c.basePresentes),
  baseTotal: cuenta(c.baseTotal),
})

const ETIQUETA_SENTIDO: Record<string, string> = {
  positivo: 'Positivo',
  negativo: 'Negativo',
  abstencion: 'Abstención',
}

async function nombresDeUsuarios(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => !!id))]
  if (unicos.length === 0) return new Map()
  // `Usuario` no es aislado: se direcciona por id, que salió de filas aisladas.
  const filas = await prismaBase.usuario.findMany({
    where: { id: { in: unicos } },
    select: { id: true, persona: { select: { nombre: true, apellido: true } } },
  })
  return new Map(filas.map((u) => [u.id, `${u.persona.nombre} ${u.persona.apellido}`.trim()]))
}

async function nombresDePersonas(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return new Map()
  const filas = await prismaBase.persona.findMany({
    where: { id: { in: unicos } },
    select: { id: true, nombre: true, apellido: true },
  })
  return new Map(filas.map((p) => [p.id, `${p.nombre} ${p.apellido}`.trim()]))
}

/** El padrón para el cómputo: el congelado si ya se abrió, el vivo si no. */
export const padronDeDominio = (
  padron: { unidadId: string; coeficiente: Decimal; presente: boolean; sinVoto: boolean }[],
): UnidadPadron[] =>
  padron.map((u) => ({
    unidadId: u.unidadId,
    coeficiente: new Decimal(u.coeficiente.toString()),
    presente: u.presente,
    sinVoto: u.sinVoto,
  }))

export const votosDeDominio = (
  votos: { unidadId: string; sentido: string | null; opcionId: string | null }[],
): Voto[] =>
  votos.map((v) => ({
    unidadId: v.unidadId,
    sentido: (v.sentido ?? undefined) as Voto['sentido'],
    opcionId: v.opcionId ?? undefined,
  }))

export async function verAsamblea(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; asambleaId: string },
): Promise<VistaAsamblea> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver asambleas' },
    async (acceso) => {
      const base = await cargarAsamblea(datos.asambleaId)
      // Un borrador todavía no se publicó: para el resto del consorcio no existe.
      if (base.estado === 'borrador' && !organiza(acceso.roles)) throw new NoEncontrado('RF-29')
      const asamblea = await prisma.asamblea.findFirstOrThrow({
        where: { id: base.id },
        include: {
          consorcio: { select: { nombre: true } },
          puntos: {
            orderBy: { orden: 'asc' },
            include: {
              opciones: { orderBy: { orden: 'asc' } },
              votos: { orderBy: { emitidoEn: 'asc' } },
              oposiciones: { select: { unidadId: true } },
            },
          },
          padron: true,
          poderes: { orderBy: { creadoEn: 'asc' } },
          acta: { include: { firmantes: { orderBy: { creadoEn: 'asc' } } } },
        },
      })

      const ahora = reloj.ahora()
      const hoy = reloj.hoy()
      const abierta = asamblea.padron.length > 0

      // Antes de abrir no hay padrón congelado: se muestra el vigente, nadie presente.
      const vigentes = abierta ? [] : await unidadesVigentes()
      const padron = abierta
        ? asamblea.padron
        : vigentes.map((u) => ({
            unidadId: u.id,
            designacion: u.designacion,
            coeficiente: u.coeficiente,
            sinVoto: false,
            presente: false,
            representanteId: null,
            representanteNombre: null,
            representacion: null,
          }))
      const designacion = new Map(padron.map((u) => [u.unidadId, u.designacion]))
      const padronDom = padronDeDominio(padron)

      const unidadIds = padron.map((u) => u.unidadId)
      const propietarios = await propietariosVigentesDe(unidadIds, hoy)
      const propietariosPorUnidad = new Map<string, Set<string>>()
      const nombresPropietariosPorUnidad = new Map<string, string[]>()
      const usuarioPropietarioPorUnidad = new Map<string, string>()
      for (const p of propietarios) {
        const s = propietariosPorUnidad.get(p.unidadId) ?? new Set<string>()
        s.add(p.personaId)
        propietariosPorUnidad.set(p.unidadId, s)
        const lista = nombresPropietariosPorUnidad.get(p.unidadId) ?? []
        if (!lista.includes(p.nombre)) lista.push(p.nombre)
        nombresPropietariosPorUnidad.set(p.unidadId, lista)
        if (p.usuarioId && !usuarioPropietarioPorUnidad.has(p.unidadId)) {
          usuarioPropietarioPorUnidad.set(p.unidadId, p.usuarioId)
        }
      }

      const usuarios = await nombresDeUsuarios([
        asamblea.organizadorId,
        asamblea.dirigeId,
        asamblea.presidenteId,
        asamblea.secretarioId,
        ...asamblea.poderes.map((p) => p.apoderadoId),
        ...(asamblea.acta?.firmantes.map((f) => f.usuarioId) ?? []),
      ])
      const personas = await nombresDePersonas(asamblea.poderes.map((p) => p.otorganteId))

      const conNombre = (id: string | null) =>
        id ? { id, nombre: usuarios.get(id) ?? 'Usuario' } : null

      const puntos: PuntoVista[] = asamblea.puntos.map((p) => {
        const opciones = p.opciones.map((o) => ({ id: o.id, texto: o.texto }))
        const textoOpcion = new Map(opciones.map((o) => [o.id, o.texto]))
        const votosDom = votosDeDominio(p.votos)
        const claves =
          p.modalidad === 'binaria'
            ? ['positivo', 'negativo', 'abstencion']
            : opciones.map((o) => o.id)
        const enVivo = p.estado !== 'pendiente' && abierta
        return {
          id: p.id,
          orden: p.orden,
          titulo: p.titulo,
          descripcion: p.descripcion,
          modalidad: p.modalidad,
          mayoria: p.mayoria,
          estado: p.estado,
          opciones,
          resultado: p.resultado,
          opcionGanadora: p.opcionGanadoraId ? (textoOpcion.get(p.opcionGanadoraId) ?? null) : null,
          provisorio: p.provisorio,
          vencePlazoOposicion: p.vencePlazoOposicion?.toISOString() ?? null,
          estadoDecision:
            p.estado === 'cerrado' && p.resultado === 'aprobado' && p.mayoria
              ? estadoDecision({
                  provisorio: p.provisorio,
                  vence: p.vencePlazoOposicion,
                  ahora,
                  padron: padronDom,
                  votos: votosDom,
                  oposiciones: p.oposiciones.map((o) => o.unidadId),
                  mayoria: p.mayoria,
                })
              : p.estado === 'cerrado' && p.resultado === 'aprobado'
                ? 'firme'
                : null,
          conteo: enVivo ? conteoVista(conteo(padronDom, votosDom, claves)) : null,
          votos: p.votos.map((v) => ({
            unidadId: v.unidadId,
            designacion: designacion.get(v.unidadId) ?? '',
            clave: v.sentido ?? v.opcionId ?? '',
            eleccion: v.sentido
              ? ETIQUETA_SENTIDO[v.sentido]
              : (textoOpcion.get(v.opcionId ?? '') ?? ''),
            cargaManual: v.origen === 'carga_manual',
          })),
          oposiciones: p.oposiciones.map((o) => o.unidadId),
          resumen: p.resumen,
        }
      })

      let coefPresente = new Decimal(0)
      let presentes = 0
      for (const u of padronDom) {
        if (u.presente) {
          coefPresente = coefPresente.plus(u.coeficiente)
          presentes += 1
        }
      }

      // Mis unidades: propietario vigente, o apoderado con poder que vale.
      const yo = datos.usuarioId
      const propias = propietarios.filter((p) => p.usuarioId === yo)
      const propiaIds = new Set(propias.map((p) => p.unidadId))
      const representadas = new Map(padron.map((u) => [u.unidadId, u]))
      const misUnidades: MiUnidad[] = []
      for (const unidadId of propiaIds) {
        const u = representadas.get(unidadId)
        const repId =
          u?.representanteId ??
          (u?.presente && u?.representacion === 'propietario'
            ? (usuarioPropietarioPorUnidad.get(unidadId) ?? null)
            : null)
        misUnidades.push({
          unidadId,
          designacion: designacion.get(unidadId) ?? '',
          como: 'propietario',
          acreditada: !!u?.presente,
          laRepresentoYo: repId === yo,
        })
      }
      const poderes = asamblea.poderes.map((p) => ({
        id: p.id,
        unidadId: p.unidadId,
        designacion: designacion.get(p.unidadId) ?? '',
        otorgante: personas.get(p.otorganteId) ?? '',
        apoderadoId: p.apoderadoId,
        apoderado: usuarios.get(p.apoderadoId) ?? '',
        papel: p.origen === 'papel',
        revocado: p.revocadoEn !== null,
        sinEfecto: !propietariosPorUnidad.get(p.unidadId)?.has(p.otorganteId),
      }))
      for (const p of poderes) {
        if (p.revocado || p.sinEfecto || p.apoderadoId !== yo || propiaIds.has(p.unidadId)) continue
        const u = representadas.get(p.unidadId)
        misUnidades.push({
          unidadId: p.unidadId,
          designacion: p.designacion,
          como: 'apoderado',
          acreditada: !!u?.presente,
          laRepresentoYo: u?.representanteId === yo,
        })
      }

      const votadas: Record<string, string[]> = {}
      for (const p of asamblea.puntos) {
        votadas[p.id] = p.votos
          .filter((v) => misUnidades.some((m) => m.unidadId === v.unidadId))
          .map((v) => v.unidadId)
      }

      const puedoOponerme = puntos.flatMap((p) =>
        p.estadoDecision === 'provisoria'
          ? propias
              .filter((m) => {
                const u = representadas.get(m.unidadId)
                return u && !u.presente && !u.sinVoto && !p.oposiciones.includes(m.unidadId)
              })
              .map((m) => ({
                puntoId: p.id,
                unidadId: m.unidadId,
                designacion: designacion.get(m.unidadId) ?? '',
              }))
          : [],
      )

      const evento = eventoDe(asamblea, asamblea.puntos, asamblea.consorcio.nombre)

      return {
        id: asamblea.id,
        consorcioId: asamblea.consorcioId,
        titulo: asamblea.titulo,
        tipo: asamblea.tipo,
        fechaHora: asamblea.fechaHora.toISOString(),
        segundaConvocatoria: segundaConvocatoria(asamblea.fechaHora).toISOString(),
        lugar: asamblea.lugar,
        estado: asamblea.estado,
        administracionInvitada: asamblea.administracionInvitada,
        motivoCancelacion: asamblea.motivoCancelacion,
        constituida: asamblea.constituidaEn !== null,
        convocatoriaQueRige: asamblea.convocatoriaQueRige,
        reglaMayoria: asamblea.reglaMayoria,
        topeApoderado: asamblea.topeApoderado,
        organizador: usuarios.get(asamblea.organizadorId) ?? '',
        dirige: conNombre(asamblea.dirigeId),
        presidente: conNombre(asamblea.presidenteId),
        secretario: conNombre(asamblea.secretarioId),
        enlaceGoogleCalendar: enlaceCalendario(evento),
        puntos,
        padron: padron.map((u) => ({
          unidadId: u.unidadId,
          designacion: u.designacion,
          coeficiente: coeficienteSerializado(u.coeficiente),
          sinVoto: u.sinVoto,
          presente: u.presente,
          representante: u.representanteNombre,
          representacion: u.representacion,
          representanteId:
            u.representanteId ??
            (u.presente && u.representacion === 'propietario'
              ? (usuarioPropietarioPorUnidad.get(u.unidadId) ?? null)
              : null),
          propietarios: nombresPropietariosPorUnidad.get(u.unidadId) ?? [],
        })),
        quorum: {
          coeficientePresente: coefPresente.toFixed(DECIMALES_COEFICIENTE),
          unidadesPresentes: presentes,
          unidadesTotales: padron.length,
        },
        poderes,
        acta: asamblea.acta
          ? {
              estado: asamblea.acta.estado,
              hashContenido: asamblea.acta.hashContenido,
              documentoId: asamblea.acta.documentoId,
              firmantes: asamblea.acta.firmantes.map((f) => ({
                id: f.id,
                usuarioId: f.usuarioId,
                nombre: usuarios.get(f.usuarioId) ?? '',
                rol: f.rolEnActa,
                firmadoEn: f.firmadoEn?.toISOString() ?? null,
                reemplazo: f.reemplazaA !== null,
              })),
            }
          : null,
        yo: {
          usuarioId: yo,
          puedeDirigir: puedeDirigir(acceso, asamblea),
          dirige: asamblea.dirigeId === yo,
          esOrganizador: asamblea.organizadorId === yo,
          esAdministrador: acceso.roles.includes('administrador'),
          esSecretario: asamblea.secretarioId === yo,
          misUnidades,
          unidadesPropias: [...propiaIds].map((unidadId) => ({
            unidadId,
            designacion: designacion.get(unidadId) ?? '',
          })),
          votadas,
          puedoOponerme,
          esFirmantePendiente:
            asamblea.acta?.estado === 'a_firmar' &&
            asamblea.acta.firmantes.some((f) => f.usuarioId === yo && !f.firmadoEn),
        },
        propietariosSinCuenta:
          puedeDirigir(acceso, asamblea) || acceso.roles.includes('administrador')
            ? propietarios
                .filter((p) => !p.usuarioId)
                .map((p) => ({
                  unidadId: p.unidadId,
                  designacion: designacion.get(p.unidadId) ?? '',
                  personaId: p.personaId,
                  nombre: p.nombre,
                }))
            : [],
      }
    },
  )
}

export interface AsambleaEnLista {
  id: string
  titulo: string
  tipo: TipoAsamblea
  fechaHora: string
  lugar: string
  estado: EstadoAsamblea
}

export async function listarAsambleas(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<{ asambleas: AsambleaEnLista[]; puedeCrear: boolean; esAdministrador: boolean }> {
  return conAutorizacion(
    repositorio,
    reloj,
    { ...datos, accion: 'ver asambleas' },
    async (acceso) => {
      const filas = await prisma.asamblea.findMany({
        where: organiza(acceso.roles) ? {} : { estado: { not: 'borrador' } },
        orderBy: { fechaHora: 'desc' },
        select: { id: true, titulo: true, tipo: true, fechaHora: true, lugar: true, estado: true },
      })
      return {
        asambleas: filas.map((a) => ({ ...a, fechaHora: a.fechaHora.toISOString() })),
        puedeCrear: organiza(acceso.roles),
        esAdministrador: acceso.roles.includes('administrador'),
      }
    },
  )
}

/** El `.ics` de una asamblea (FR-007), armado a la hora que se pide. */
export async function icsDeAsamblea(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; asambleaId: string },
) {
  return conAutorizacion(
    repositorio,
    reloj,
    { ...datos, accion: 'ver asambleas' },
    async (acceso) => {
      const asamblea = await prisma.asamblea.findFirst({
        where: { id: datos.asambleaId },
        include: {
          consorcio: { select: { nombre: true } },
          puntos: { select: { orden: true, titulo: true } },
        },
      })
      if (!asamblea || (asamblea.estado === 'borrador' && !organiza(acceso.roles))) {
        throw new NoEncontrado('RF-29')
      }
      return textoIcs(eventoDe(asamblea, asamblea.puntos, asamblea.consorcio.nombre), reloj.ahora())
    },
  )
}
