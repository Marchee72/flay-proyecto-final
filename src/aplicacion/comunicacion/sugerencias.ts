import type { EstadoSugerencia, Prisma, TipoSugerencia } from '@prisma/client'
import { z } from 'zod'

import { importe } from '@/compartido/dinero'
import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import { plural } from '@/compartido/formato'
import { mismoNombre } from '@/compartido/nombres'
import { errorDeInstrucciones } from '@/dominio/consorcios/instrucciones-de-pago'
import {
  ESQUEMA_SUGERENCIA_LEIDA,
  type EspacioSugerido,
  type LectorDeConfiguracion,
  type SugerenciaLeida,
} from '@/dominio/contratos/asistencia'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import {
  escalonadoDesdeTramos,
  validarReglaVencimientos,
  type TramoRegla,
} from '@/dominio/liquidacion/vencimientos'
import { horarioParaMostrar, minutosDesdeHora, type HorarioDeUso } from '@/dominio/reservas/horario'
import {
  ESQUEMA_CONFIGURACION_ASAMBLEAS,
  guardarConfiguracion,
  type ConfiguracionAsambleas,
} from '@/aplicacion/asambleas/configuracion'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { TIPOS_ANALIZABLES } from '@/aplicacion/comunicacion/documentos'
import type { Transaccion } from '@/aplicacion/comunicacion/notificar'
import { guardarInstruccionesDePago } from '@/aplicacion/consorcios/instrucciones-de-pago'
import { guardarReglaVencimientos } from '@/aplicacion/consorcios/regla-vencimientos'
import type { Manejador } from '@/aplicacion/pendientes/drenar'
import {
  altaEspacio,
  contarReservasAfectadas,
  editarEspacio,
  validarEspacio,
  type DatosDeEspacio,
} from '@/aplicacion/reservas/espacios'
import { enConsorcio, sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Sugerencias de configuracion desde la documentacion (`RF-19`, RN-14). Un
 * reglamento, acta o contrato indexado se lee con el `LectorDeConfiguracion` y
 * lo que fija queda como `SugerenciaConfiguracion` pendiente, con su cita. Nada
 * de esto toca la configuracion: se aplica solo con el clic del administrador.
 *
 * Una sugerencia que la pantalla de configuracion rechazaria se descarta en
 * silencio, y una igual a lo vigente no se guarda: no hay nada que aplicar.
 */

export interface EspacioVigente extends Required<DatosDeEspacio> {
  id: string
}

export interface ConfiguracionVigente {
  /** Los activos: los que el lector conoce y los que se pueden editar. */
  espacios: EspacioVigente[]
  /** Nombres de los deshabilitados: un espacio nuevo con uno de ellos no se aplica. */
  deshabilitados: string[]
  /** Convencion de boleta (decision 27). Sin regla cargada, el tramo unico por omision. */
  tramos: TramoRegla[]
  tasaMoraMensual: string
  asambleas: ConfiguracionAsambleas
  instruccionesPago: string | null
}

export interface Cambio {
  campo: string
  actual: string
  propuesto: string
}

type Cliente = Pick<Transaccion, 'consorcio' | 'espacioComun' | 'tramoVencimiento'>

/**
 * La configuracion vigente, para comparar y validar. `cliente` es el aislado,
 * dentro de `enConsorcio(consorcioId, …)`: espacios y tramos los filtra la
 * extension; el consorcio se lee por su propio identificador.
 */
export async function vigenteDelConsorcio(
  cliente: Cliente,
  consorcioId: string,
): Promise<ConfiguracionVigente> {
  const consorcio = await cliente.consorcio.findUniqueOrThrow({
    where: { id: consorcioId },
    select: {
      diaVencimiento: true,
      tasaMoraMensual: true,
      reglaMayoriaAsamblea: true,
      anticipacionConvocatoriaDias: true,
      topeUnidadesPorApoderado: true,
      umbralExpensasSinVoto: true,
      instruccionesPago: true,
    },
  })
  const todos = await cliente.espacioComun.findMany({ orderBy: { nombre: 'asc' } })
  const espacios = todos.filter((e) => e.activo && !e.archivadoEn)
  const tramos = await cliente.tramoVencimiento.findMany({ orderBy: { orden: 'asc' } })

  return {
    espacios: espacios.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      capacidadMaxima: e.capacidadMaxima,
      anticipacionMinimaHoras: e.anticipacionMinimaHoras,
      anticipacionMaximaDias: e.anticipacionMaximaDias,
      duracionMaximaHoras: e.duracionMaximaHoras,
      reservasMaxMesUnidad: e.reservasMaxMesUnidad,
      horario:
        e.aperturaMinutos !== null && e.cierreMinutos !== null
          ? { apertura: e.aperturaMinutos, cierre: e.cierreMinutos }
          : null,
      rechazaConDeuda: e.rechazaConDeuda,
    })),
    deshabilitados: todos.filter((e) => !e.activo || e.archivadoEn).map((e) => e.nombre),
    tramos:
      tramos.length > 0
        ? tramos.map((t) => ({
            orden: t.orden,
            diaDelMes: t.diaDelMes,
            recargoPorcentaje: t.recargoPorcentaje.toFixed(4),
          }))
        : [{ orden: 1, diaDelMes: consorcio.diaVencimiento, recargoPorcentaje: '0.0000' }],
    tasaMoraMensual: consorcio.tasaMoraMensual.toFixed(4),
    asambleas: {
      reglaMayoria: consorcio.reglaMayoriaAsamblea,
      anticipacionDias: consorcio.anticipacionConvocatoriaDias,
      topeApoderado: consorcio.topeUnidadesPorApoderado,
      umbralSinVoto: consorcio.umbralExpensasSinVoto,
    },
    instruccionesPago: consorcio.instruccionesPago,
  }
}

/** El horario 'HH:MM' del lector, en minutos; `null` si alguna hora no es valida. */
function aEspacio(datos: Partial<EspacioSugerido>): Partial<DatosDeEspacio> | null {
  const { horario, ...resto } = datos
  if (!horario) return horario === null ? { ...resto, horario: null } : resto
  const apertura = minutosDesdeHora(horario.apertura)
  const cierre = minutosDesdeHora(horario.cierre)
  return apertura === null || cierre === null ? null : { ...resto, horario: { apertura, cierre } }
}

const ETIQUETAS_ESPACIO: Record<keyof DatosDeEspacio, string> = {
  nombre: 'Nombre',
  capacidadMaxima: 'Capacidad máxima',
  anticipacionMinimaHoras: 'Anticipación mínima',
  anticipacionMaximaDias: 'Anticipación máxima',
  duracionMaximaHoras: 'Duración máxima',
  reservasMaxMesUnidad: 'Reservas por mes y unidad',
  horario: 'Horario',
  rechazaConDeuda: 'Rechaza a quien tiene deuda',
}

function textoDeEspacio(campo: keyof DatosDeEspacio, valor: unknown): string {
  switch (campo) {
    case 'nombre':
      return String(valor)
    case 'capacidadMaxima':
      return valor == null ? 'Sin límite' : plural(valor as number, 'persona', 'personas')
    case 'anticipacionMinimaHoras':
    case 'duracionMaximaHoras':
      return plural(valor as number, 'hora', 'horas')
    case 'anticipacionMaximaDias':
      return plural(valor as number, 'día', 'días')
    case 'reservasMaxMesUnidad':
      return String(valor)
    case 'horario':
      return valor ? horarioParaMostrar(valor as HorarioDeUso) : 'Sin horario'
    case 'rechazaConDeuda':
      return valor ? 'Sí' : 'No'
  }
}

function cambiosDeEspacio(
  propuesto: Partial<DatosDeEspacio>,
  actual: EspacioVigente | undefined,
  campos = Object.keys(ETIQUETAS_ESPACIO) as (keyof DatosDeEspacio)[],
): Cambio[] {
  return campos
    .filter((campo) => propuesto[campo] !== undefined)
    .map((campo) => ({
      campo: ETIQUETAS_ESPACIO[campo],
      actual: actual ? textoDeEspacio(campo, actual[campo]) : '—',
      propuesto: textoDeEspacio(campo, propuesto[campo]),
    }))
    .filter((c) => c.actual !== c.propuesto)
}

const porcentaje = (valor: string) => `${importe(valor).toString().replace('.', ',')} %`

/** En la convencion de la pantalla de Vencimientos (decision 27), no en la de boleta. */
function textoDeTramos(tramos: readonly TramoRegla[]): string {
  const { escalones, diaFirme } = escalonadoDesdeTramos(tramos)
  return [
    ...escalones.map((e) => `${porcentaje(e.recargoPorcentaje)} después del día ${e.diaDelMes}`),
    `vence en firme el día ${diaFirme}`,
  ].join('; ')
}

type DatosVencimientos = Extract<SugerenciaLeida, { tipo: 'vencimientos' }>['datos']

/** Lo que el documento no fija se completa con lo vigente. */
function reglaPropuesta(datos: DatosVencimientos, vigente: ConfiguracionVigente) {
  return {
    tramos:
      datos.tramos?.map((t, i) => ({
        orden: i + 1,
        diaDelMes: t.diaDelMes,
        recargoPorcentaje: t.recargoPorcentaje,
      })) ?? vigente.tramos,
    tasaMoraMensual: datos.tasaMoraMensual ?? vigente.tasaMoraMensual,
  }
}

const ETIQUETAS_ASAMBLEA: Record<keyof ConfiguracionAsambleas, string> = {
  reglaMayoria: 'Cómo se cuenta la mayoría',
  anticipacionDias: 'Anticipación mínima de la convocatoria',
  topeApoderado: 'Máximo de unidades por apoderado',
  umbralSinVoto: 'Pierde el voto quien adeuda más de',
}

function textoDeAsamblea(campo: keyof ConfiguracionAsambleas, valor: string | number): string {
  switch (campo) {
    case 'reglaMayoria':
      return valor === 'presentes' ? 'Sobre los presentes' : 'Sobre el total de propietarios'
    case 'anticipacionDias':
      return plural(valor as number, 'día', 'días')
    case 'topeApoderado':
      return plural(valor as number, 'unidad', 'unidades')
    case 'umbralSinVoto':
      return plural(valor as number, 'expensa', 'expensas')
  }
}

/**
 * Que cambiaria al aplicar, campo por campo, ya en texto para mostrar. Vacio:
 * la sugerencia coincide con lo vigente. Supone una sugerencia valida.
 */
export function cambiosDe(sugerencia: SugerenciaLeida, vigente: ConfiguracionVigente): Cambio[] {
  switch (sugerencia.tipo) {
    case 'espacio_nuevo':
      return cambiosDeEspacio(aEspacio(sugerencia.datos) ?? {}, undefined)
    case 'espacio_cambio': {
      const existente = vigente.espacios.find((e) => e.id === sugerencia.espacioId)
      if (!existente) return []
      return cambiosDeEspacio(aEspacio(sugerencia.datos) ?? {}, existente)
    }
    case 'vencimientos': {
      const propuesta = reglaPropuesta(sugerencia.datos, vigente)
      const cambios: Cambio[] = []
      if (sugerencia.datos.tramos) {
        cambios.push({
          campo: 'Vencimientos',
          actual: textoDeTramos(vigente.tramos),
          propuesto: textoDeTramos(propuesta.tramos),
        })
      }
      if (sugerencia.datos.tasaMoraMensual !== undefined) {
        cambios.push({
          campo: 'Tasa de mora mensual',
          actual: porcentaje(vigente.tasaMoraMensual),
          propuesto: porcentaje(propuesta.tasaMoraMensual),
        })
      }
      return cambios.filter((c) => c.actual !== c.propuesto)
    }
    case 'asambleas': {
      const datos = sugerencia.datos
      return (Object.keys(ETIQUETAS_ASAMBLEA) as (keyof ConfiguracionAsambleas)[])
        .filter((campo) => datos[campo] !== undefined)
        .map((campo) => ({
          campo: ETIQUETAS_ASAMBLEA[campo],
          actual: textoDeAsamblea(campo, vigente.asambleas[campo]),
          propuesto: textoDeAsamblea(campo, datos[campo]!),
        }))
        .filter((c) => c.actual !== c.propuesto)
    }
    case 'instrucciones_pago': {
      const actual = vigente.instruccionesPago?.trim() ?? ''
      const propuesto = sugerencia.datos.texto.trim()
      return actual === propuesto
        ? []
        : [{ campo: 'Instrucciones de pago', actual: actual || '—', propuesto }]
    }
  }
}

/** Pasaria la pantalla de configuracion? Los mismos validadores que el caso de uso. */
function esValida(sugerencia: SugerenciaLeida, vigente: ConfiguracionVigente): boolean {
  try {
    switch (sugerencia.tipo) {
      case 'espacio_nuevo': {
        const datos = aEspacio(sugerencia.datos)
        if (!datos) return false
        validarEspacio({ ...datos, nombre: sugerencia.datos.nombre })
        return true
      }
      case 'espacio_cambio': {
        // Solo un espacio de este consorcio: el lector no inventa ni cruza.
        const existente = vigente.espacios.find((e) => e.id === sugerencia.espacioId)
        const datos = aEspacio(sugerencia.datos)
        if (!existente || !datos) return false
        validarEspacio({ ...datos, nombre: datos.nombre ?? existente.nombre })
        return true
      }
      case 'vencimientos': {
        const { tramos, tasaMoraMensual } = reglaPropuesta(sugerencia.datos, vigente)
        validarReglaVencimientos(tramos, tasaMoraMensual)
        return true
      }
      case 'asambleas':
        return ESQUEMA_CONFIGURACION_ASAMBLEAS.safeParse({
          ...vigente.asambleas,
          ...sugerencia.datos,
        }).success
      case 'instrucciones_pago':
        return sugerencia.datos.texto.trim() !== '' && !errorDeInstrucciones(sugerencia.datos.texto)
    }
  } catch {
    return false
  }
}

/**
 * Un `espacio_nuevo` con el nombre (sin tildes ni mayusculas) de un espacio
 * activo es un cambio sobre ese espacio, que conserva su nombre: darlo de alta
 * lo rechazaria por repetido o, con otra grafia, lo duplicaria.
 */
function comoCambioSiExiste(s: SugerenciaLeida, vigente: ConfiguracionVigente): SugerenciaLeida {
  if (s.tipo !== 'espacio_nuevo') return s
  const existente = vigente.espacios.find((e) => mismoNombre(e.nombre, s.datos.nombre))
  if (!existente) return s
  const datos: Partial<EspacioSugerido> = { ...s.datos }
  delete datos.nombre
  return { tipo: 'espacio_cambio', espacioId: existente.id, cita: s.cita, datos }
}

/** Un `espacio_nuevo` con el nombre de uno deshabilitado: se rehabilita a mano, no se duplica. */
const chocaConDeshabilitado = (s: SugerenciaLeida, vigente: ConfiguracionVigente) =>
  s.tipo === 'espacio_nuevo' && vigente.deshabilitados.some((n) => mismoNombre(n, s.datos.nombre))

/** Una clave en `undefined` pisaria lo vigente al mezclar y no viaja en el JSONB. */
function sinIndefinidos(sugerencia: SugerenciaLeida): SugerenciaLeida {
  const datos = Object.fromEntries(
    Object.entries(sugerencia.datos).filter(([, valor]) => valor !== undefined),
  )
  return { ...sugerencia, datos } as SugerenciaLeida
}

const CARGA = z.object({ documentoId: z.string().uuid() })

/**
 * El trabajo `sugerir_configuracion`. Corre en la cola, sin consorcio activo:
 * el documento se lee por `prismaBase` y lo demas dentro de `enConsorcio` con el
 * consorcio del documento (Principio I). Arma el texto desde los fragmentos ya
 * guardados, no vuelve a bajar el archivo. Sin lector disponible no escribe
 * nada y no es un error (RNF-14).
 */
export function manejadorSugerencias(lector: LectorDeConfiguracion): Manejador {
  return async (carga) => {
    const { documentoId } = CARGA.parse(carga)
    const documento = await prismaBase.documentoConsorcio.findUnique({
      where: { id: documentoId },
      select: { consorcioId: true, tipo: true, archivadoEn: true },
    })
    if (!documento || documento.archivadoEn || !TIPOS_ANALIZABLES.includes(documento.tipo)) return

    const fragmentos = await prismaBase.fragmentoDocumento.findMany({
      where: { documentoId },
      orderBy: { numeroFragmento: 'asc' },
      select: { contenido: true },
    })
    const texto = fragmentos.map((f) => f.contenido).join('\n\n')
    if (!texto.trim()) return

    await enConsorcio(documento.consorcioId, async () => {
      const vigente = await vigenteDelConsorcio(prisma, documento.consorcioId)
      const resultado = await lector.leer(texto, {
        espaciosExistentes: vigente.espacios.map(({ id, nombre }) => ({ id, nombre })),
      })
      if (!resultado.disponible) {
        // Proveedor saturado o caido: lanzar deja el trabajo en la cola, que
        // reintenta con espera creciente. La nula termina sin error (RNF-14).
        if (resultado.reintentable) throw new Error(resultado.motivo)
        return
      }

      const nuevas = resultado.valor
        .map(sinIndefinidos)
        .map((s) => comoCambioSiExiste(s, vigente))
        .filter((s) => esValida(s, vigente) && cambiosDe(s, vigente).length > 0)

      await prisma.$transaction(async (tx) => {
        // Serializa dos analisis del mismo documento (indexar y «Buscar
        // configuración»), y corta si lo borraron mientras se leia.
        const sigue = await tx.$queryRaw<unknown[]>`
          SELECT 1 FROM "DocumentoConsorcio" WHERE id = ${documentoId}::uuid FOR UPDATE`
        if (sigue.length === 0) return
        // Las aplicadas y descartadas son historia: solo se reemplazan las pendientes.
        await tx.sugerenciaConfiguracion.deleteMany({ where: { documentoId, estado: 'pendiente' } })
        await tx.sugerenciaConfiguracion.createMany({
          data: nuevas.map((s) =>
            sinConsorcio({
              documentoId,
              tipo: s.tipo,
              cita: s.cita,
              datos: (s.tipo === 'espacio_cambio'
                ? { espacioId: s.espacioId, ...s.datos }
                : s.datos) as Prisma.InputJsonValue,
            }),
          ),
        })
      })
    })
  }
}

/** Una tarjeta de sugerencia: que cambia, ya en texto, calculado al mirar y no al generar. */
export interface SugerenciaVisible {
  id: string
  documentoId: string
  /** El titulo del documento del que sale. */
  documento: string
  tipo: TipoSugerencia
  titulo: string
  cita: string
  estado: EstadoSugerencia
  cambios: Cambio[]
  /**
   * Falso si el `espacio_cambio` apunta a un espacio que ya no existe o esta
   * deshabilitado, o si el `espacio_nuevo` lleva el nombre de uno deshabilitado.
   */
  aplicable: boolean
  /** Las reservas confirmadas que un cambio de horario cancelaria al aplicarlo. */
  reservasAfectadas: number
  /** ISO; `null` mientras esta pendiente. */
  resueltaEn: string | null
}

export class SugerenciaYaResuelta extends ErrorDeAplicacion {
  constructor() {
    super('Esta sugerencia ya se aplicó o se descartó.', 'RN-14')
  }
}

const SOLO_ADMINISTRADOR = {
  rolesPermitidos: ['administrador'],
  accion: 'revisar las sugerencias de configuración',
} as const

/** La fila de vuelta a la forma del lector (`espacioId` viaja en `datos`); `null` si no valida. */
function leida(fila: { tipo: TipoSugerencia; cita: string; datos: Prisma.JsonValue }) {
  const { espacioId, ...datos } = fila.datos as Record<string, unknown>
  const r = ESQUEMA_SUGERENCIA_LEIDA.safeParse({
    tipo: fila.tipo,
    cita: fila.cita,
    espacioId,
    datos,
  })
  return r.success ? (r.data as SugerenciaLeida) : null
}

const espacioDe = (s: SugerenciaLeida, vigente: ConfiguracionVigente) =>
  s.tipo === 'espacio_cambio' ? vigente.espacios.find((e) => e.id === s.espacioId) : undefined

function tituloDe(s: SugerenciaLeida, vigente: ConfiguracionVigente): string {
  switch (s.tipo) {
    case 'espacio_nuevo':
      return `Nuevo espacio: ${s.datos.nombre}`
    case 'espacio_cambio': {
      const espacio = espacioDe(s, vigente)
      return espacio ? `Cambios en ${espacio.nombre}` : 'Cambios en un espacio que ya no está'
    }
    case 'vencimientos':
      return 'Vencimientos y mora'
    case 'asambleas':
      return 'Reglas de asamblea'
    case 'instrucciones_pago':
      return 'Instrucciones de pago'
  }
}

/**
 * Las sugerencias de un documento, o de todo el consorcio si no se da `documentoId`:
 * pendientes primero, despues la historia (RN-14).
 */
export async function listarSugerencias(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; documentoId?: string },
): Promise<SugerenciaVisible[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, ...SOLO_ADMINISTRADOR },
    async () => {
      const filas = await prisma.sugerenciaConfiguracion.findMany({
        where: {
          ...(datos.documentoId ? { documentoId: datos.documentoId } : {}),
          // La pendiente de un documento archivado ya no se ofrece (RN-22); la resuelta es historia.
          OR: [{ estado: { not: 'pendiente' } }, { documento: { archivadoEn: null } }],
        },
        include: { documento: { select: { titulo: true } } },
        orderBy: [
          { resueltaEn: { sort: 'desc', nulls: 'first' } },
          { documento: { titulo: 'asc' } },
          { creadoEn: 'asc' },
        ],
      })
      const vigente = await vigenteDelConsorcio(prisma, datos.consorcioId)
      const visibles: SugerenciaVisible[] = []
      for (const fila of filas) {
        const original = leida(fila)
        if (!original) continue
        // Solo la pendiente se mira contra hoy; la resuelta dice lo que fue.
        const s = fila.estado === 'pendiente' ? comoCambioSiExiste(original, vigente) : original
        const cambios = cambiosDe(s, vigente)
        const espacio = espacioDe(s, vigente)
        const cambiaHorario =
          fila.estado === 'pendiente' &&
          espacio !== undefined &&
          cambios.some((c) => c.campo === ETIQUETAS_ESPACIO.horario)
        visibles.push({
          id: fila.id,
          documentoId: fila.documentoId,
          documento: fila.documento.titulo,
          tipo: s.tipo,
          titulo: tituloDe(s, vigente),
          cita: fila.cita,
          estado: fila.estado,
          cambios,
          aplicable:
            (s.tipo !== 'espacio_cambio' || espacio !== undefined) &&
            !chocaConDeshabilitado(s, vigente),
          reservasAfectadas:
            cambiaHorario && s.tipo === 'espacio_cambio'
              ? await contarReservasAfectadas(repositorio, reloj, {
                  usuarioId: datos.usuarioId,
                  consorcioId: datos.consorcioId,
                  espacioId: s.espacioId,
                  horario: aEspacio(s.datos)?.horario ?? null,
                })
              : 0,
          resueltaEn: fila.resueltaEn?.toISOString() ?? null,
        })
      }
      return visibles
    },
  )
}

async function pendiente(sugerenciaId: string) {
  // Aislada: la de otro consorcio no existe (RN-12).
  const fila = await prisma.sugerenciaConfiguracion.findFirst({
    where: { id: sugerenciaId, documento: { archivadoEn: null } },
  })
  if (!fila) throw new NoEncontrado()
  if (fila.estado !== 'pendiente') throw new SugerenciaYaResuelta()
  return fila
}

const resolver = (
  sugerenciaId: string,
  estado: 'aplicada' | 'descartada',
  usuarioId: string,
  reloj: Reloj,
) =>
  prisma.sugerenciaConfiguracion.updateMany({
    where: { id: sugerenciaId, estado: 'pendiente' },
    data: { estado, resueltaPor: usuarioId, resueltaEn: reloj.ahora() },
  })

/** Llama al caso de uso de esa configuracion, mezclando la sugerencia con lo vigente. */
async function aplicarPorSuCasoDeUso(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  quien: { usuarioId: string; consorcioId: string },
  guardada: SugerenciaLeida | null,
  vigente: ConfiguracionVigente,
): Promise<{ canceladas: number }> {
  // Una fila guardada antes de que el analisis la convirtiera, o un espacio cargado despues.
  const s = guardada && comoCambioSiExiste(guardada, vigente)
  switch (s?.tipo) {
    case 'espacio_nuevo':
      if (chocaConDeshabilitado(s, vigente)) {
        throw new ErrorDeAplicacion(
          'Ya hay un espacio deshabilitado con ese nombre: solo se puede descartar.',
          'RF-15',
        )
      }
      await altaEspacio(repositorio, reloj, {
        ...quien,
        ...aEspacio(s.datos),
        nombre: s.datos.nombre,
      })
      return { canceladas: 0 }
    case 'espacio_cambio': {
      const existente = espacioDe(s, vigente)
      const cambios = aEspacio(s.datos)
      if (!existente || !cambios) {
        throw new ErrorDeAplicacion(
          'El espacio de esta sugerencia ya no existe o está deshabilitado: solo se puede descartar.',
          'RF-15',
        )
      }
      const { id, ...actual } = existente
      return editarEspacio(repositorio, reloj, { ...quien, espacioId: id, ...actual, ...cambios })
    }
    case 'vencimientos':
      await guardarReglaVencimientos(repositorio, reloj, {
        ...quien,
        ...reglaPropuesta(s.datos, vigente),
      })
      return { canceladas: 0 }
    case 'asambleas':
      await guardarConfiguracion(repositorio, reloj, { ...quien, ...vigente.asambleas, ...s.datos })
      return { canceladas: 0 }
    case 'instrucciones_pago':
      await guardarInstruccionesDePago(repositorio, reloj, {
        ...quien,
        texto: s.datos.texto.trim(),
      })
      return { canceladas: 0 }
    default:
      throw new ErrorDeAplicacion('Esta sugerencia no se puede aplicar: descartala.', 'RN-14')
  }
}

/**
 * El clic de «Aplicar» (RN-14): la sugerencia pasa por el caso de uso de esa
 * configuracion, con sus validaciones y su autorizacion. Si rechaza, el error
 * es el suyo y la sugerencia sigue pendiente.
 */
export async function aplicarSugerencia(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; sugerenciaId: string },
): Promise<{ canceladas: number }> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, ...SOLO_ADMINISTRADOR },
    async () => {
      const fila = await pendiente(datos.sugerenciaId)
      const vigente = await vigenteDelConsorcio(prisma, datos.consorcioId)
      const resultado = await aplicarPorSuCasoDeUso(
        repositorio,
        reloj,
        { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId },
        leida(fila),
        vigente,
      )
      // ponytail: la configuracion y la marca no son una sola transaccion, porque
      // cada caso de uso abre la suya. El doble aplicar lo frenan el estado
      // `pendiente` de esta condicion y la unicidad del caso de uso (nombre de
      // espacio); si otro pedido marco primero (`count === 0`), se devuelve igual.
      await resolver(fila.id, 'aplicada', datos.usuarioId, reloj)
      return resultado
    },
  )
}

/** «Descartar»: queda como historia y no toca la configuracion. */
export async function descartarSugerencia(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; sugerenciaId: string },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, ...SOLO_ADMINISTRADOR },
    async () => {
      const fila = await pendiente(datos.sugerenciaId)
      const { count } = await resolver(fila.id, 'descartada', datos.usuarioId, reloj)
      if (count === 0) throw new SugerenciaYaResuelta()
    },
  )
}
