import type { Prisma } from '@prisma/client'
import { z } from 'zod'

import { importe } from '@/compartido/dinero'
import { plural } from '@/compartido/formato'
import { mismoNombre } from '@/compartido/nombres'
import { errorDeInstrucciones } from '@/dominio/consorcios/instrucciones-de-pago'
import type {
  EspacioSugerido,
  LectorDeConfiguracion,
  SugerenciaLeida,
} from '@/dominio/contratos/asistencia'
import {
  escalonadoDesdeTramos,
  validarReglaVencimientos,
  type TramoRegla,
} from '@/dominio/liquidacion/vencimientos'
import { horarioParaMostrar, minutosDesdeHora, type HorarioDeUso } from '@/dominio/reservas/horario'
import {
  ESQUEMA_CONFIGURACION_ASAMBLEAS,
  type ConfiguracionAsambleas,
} from '@/aplicacion/asambleas/configuracion'
import { TIPOS_ANALIZABLES } from '@/aplicacion/comunicacion/documentos'
import type { Transaccion } from '@/aplicacion/comunicacion/notificar'
import type { Manejador } from '@/aplicacion/pendientes/drenar'
import { validarEspacio, type DatosDeEspacio } from '@/aplicacion/reservas/espacios'
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
  const espacios = await cliente.espacioComun.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  })
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
    case 'espacio_nuevo': {
      const propuesto = aEspacio(sugerencia.datos) ?? {}
      const existente = vigente.espacios.find((e) => mismoNombre(e.nombre, sugerencia.datos.nombre))
      // Uno con el mismo nombre ya cargado: solo cuenta lo que difiere de el.
      if (!existente) return cambiosDeEspacio(propuesto, undefined)
      return cambiosDeEspacio(
        propuesto,
        existente,
        (Object.keys(ETIQUETAS_ESPACIO) as (keyof DatosDeEspacio)[]).filter((c) => c !== 'nombre'),
      )
    }
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
      select: { consorcioId: true, tipo: true },
    })
    if (!documento || !TIPOS_ANALIZABLES.includes(documento.tipo)) return

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
      if (!resultado.disponible) return

      const nuevas = resultado.valor
        .map(sinIndefinidos)
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
