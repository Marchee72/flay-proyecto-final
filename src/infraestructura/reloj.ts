import type { Reloj } from '@/dominio/contratos/reloj'

const ZONA = 'America/Argentina/Buenos_Aires'
const UNA_HORA = 60 * 60 * 1000

/**
 * El dia calendario de Argentina (la zona del consorcio) de un instante, como
 * fecha a medianoche UTC: la forma en que se comparan vencimientos. Con el dia
 * UTC, entre las 21 y las 24 h el tramo de vencimiento saltaba un dia antes.
 */
export function diaArgentino(instante: Date): Date {
  const [anio, mes, dia] = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(instante)
    .split('-')
    .map(Number)
  return new Date(Date.UTC(anio!, mes! - 1, dia!))
}

/** El instante en que termina un dia argentino (Argentina es UTC−3, sin horario de verano). */
export function finDelDiaArgentino(dia: Date): Date {
  return new Date(dia.getTime() + 27 * UNA_HORA)
}

export const relojDelSistema: Reloj = {
  ahora: () => new Date(),
  hoy: () => diaArgentino(new Date()),
}
