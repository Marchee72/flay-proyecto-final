import type { TramoDeshabilitado } from '@/aplicacion/reservas/espacios'
import type { ReservaDelHistorial } from '@/aplicacion/reservas/reservar'

/**
 * Arma la grilla mensual del calendario de uso (RF-15): por cada día, las
 * reservas que empiezan ese día y si cayó dentro de un tramo deshabilitado.
 * Puro y sin base: la lógica de fechas se prueba sola (pruebas/dominio).
 *
 * Todo se resuelve en hora del consorcio (Argentina, UTC-3, sin horario de
 * verano), igual que el resto de reservas.
 */

const AR = 3 * 3_600_000

/** La fecha 'YYYY-MM-DD' de un instante ISO en hora del consorcio. */
export function diaEnAr(iso: string): string {
  return new Date(new Date(iso).getTime() - AR).toISOString().slice(0, 10)
}

/** La hora 'HH:MM' de un instante ISO en hora del consorcio. */
export function horaEnAr(iso: string): string {
  return new Date(new Date(iso).getTime() - AR).toISOString().slice(11, 16)
}

export interface EventoReserva {
  id: string
  espacio: string
  unidad: string
  estado: string
  cumplida: boolean
  hora: string
}

export interface DiaCalendario {
  /** 'YYYY-MM-DD', o null en las celdas de relleno fuera del mes. */
  fecha: string | null
  dia: number
  hoy: boolean
  /** Nombre de cada espacio deshabilitado que solapa el dia; vacio si ninguno. */
  deshabilitados: string[]
  reservas: EventoReserva[]
}

export interface Calendario {
  semanas: DiaCalendario[][]
}

/** El tramo [desde, hasta) solapa el día [inicio, fin) del calendario. */
function tramoSolapaDia(tramo: TramoDeshabilitado, inicioDia: number, finDia: number): boolean {
  const desde = new Date(tramo.desde).getTime()
  const hasta = tramo.hasta ? new Date(tramo.hasta).getTime() : Infinity
  return desde < finDia && hasta > inicioDia
}

export function construirCalendario(
  mes: string,
  reservas: ReservaDelHistorial[],
  tramos: TramoDeshabilitado[],
  hoyIso: string,
): Calendario {
  const [anio, numero] = mes.split('-').map(Number)
  const diasEnMes = new Date(Date.UTC(anio!, numero!, 0)).getUTCDate()
  // Lunes = 0 … domingo = 6, para arrancar la semana en lunes.
  const primerDiaUtc = new Date(`${mes}-01T00:00:00-03:00`).getUTCDay()
  const relleno = (primerDiaUtc + 6) % 7
  const hoy = diaEnAr(hoyIso)

  // Reservas agrupadas por el día en que empiezan.
  const porDia = new Map<string, EventoReserva[]>()
  for (const r of reservas) {
    const fecha = diaEnAr(r.desde)
    const evento: EventoReserva = {
      id: r.id,
      espacio: r.espacio,
      unidad: r.unidad,
      estado: r.estado,
      cumplida: r.cumplida,
      hora: horaEnAr(r.desde),
    }
    const lista = porDia.get(fecha)
    if (lista) lista.push(evento)
    else porDia.set(fecha, [evento])
  }

  const dias: DiaCalendario[] = []
  for (let i = 0; i < relleno; i++) {
    dias.push({ fecha: null, dia: 0, hoy: false, deshabilitados: [], reservas: [] })
  }
  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = `${mes}-${String(d).padStart(2, '0')}`
    const inicioDia = new Date(`${fecha}T00:00:00-03:00`).getTime()
    const finDia = inicioDia + 86_400_000
    const delDia = tramos.filter((t) => tramoSolapaDia(t, inicioDia, finDia))
    dias.push({
      fecha,
      dia: d,
      hoy: fecha === hoy,
      // Solo los espacios suspendidos ese dia se muestran deshabilitados, no el dia entero.
      deshabilitados: [...new Set(delDia.map((t) => t.espacio))],
      reservas: porDia.get(fecha) ?? [],
    })
  }
  while (dias.length % 7 !== 0) {
    dias.push({ fecha: null, dia: 0, hoy: false, deshabilitados: [], reservas: [] })
  }

  const semanas: DiaCalendario[][] = []
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7))
  return { semanas }
}
