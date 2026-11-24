/**
 * El evento de la asamblea para los calendarios (FR-007, research R-08): un
 * enlace de plantilla de Google Calendar, que viaja entero en la URL y no pide
 * sesión, y un `.ics` (RFC 5545) para Apple y Outlook. Texto puro, sin
 * dependencia: quince líneas no justifican una.
 */

export interface EventoAsamblea {
  id: string
  titulo: string
  inicio: Date
  /** Sin fin, dura `DURACION_MS`. */
  fin?: Date
  lugar: string
  descripcion: string
  /** La asamblea en Flay; va al final del detalle. */
  enlace?: string
}

const DURACION_MS = 2 * 60 * 60 * 1000

const fin = (e: EventoAsamblea): Date => e.fin ?? new Date(e.inicio.getTime() + DURACION_MS)

/** `20261120T220000Z`: UTC, sin separadores ni milisegundos. */
const utc = (fecha: Date): string =>
  fecha
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '')

const detalle = (e: EventoAsamblea): string =>
  e.enlace ? `${e.descripcion}\n\n${e.enlace}` : e.descripcion

export function enlaceGoogleCalendar(e: EventoAsamblea): string {
  const parametros = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.titulo,
    dates: `${utc(e.inicio)}/${utc(fin(e))}`,
    location: e.lugar,
    details: detalle(e),
  })
  return `https://calendar.google.com/calendar/render?${parametros.toString()}`
}

/** Outlook en la web: `outlook.live.com` (personal) y `outlook.office.com` (Microsoft 365), mismo formato. */
const enlaceOutlookEn = (origen: string, e: EventoAsamblea): string => {
  const parametros = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.titulo,
    startdt: e.inicio.toISOString(),
    enddt: fin(e).toISOString(),
    location: e.lugar,
    body: detalle(e),
  })
  return `${origen}/calendar/0/deeplink/compose?${parametros.toString()}`
}

export function enlaceYahooCalendar(e: EventoAsamblea): string {
  const parametros = new URLSearchParams({
    v: '60',
    title: e.titulo,
    st: utc(e.inicio),
    et: utc(fin(e)),
    in_loc: e.lugar,
    desc: detalle(e),
  })
  return `https://calendar.yahoo.com/?${parametros.toString()}`
}

/** Los calendarios con enlace de plantilla; Apple y el resto salen del `.ics`. */
export function enlacesCalendario(e: EventoAsamblea) {
  return {
    google: enlaceGoogleCalendar(e),
    outlook: enlaceOutlookEn('https://outlook.live.com', e),
    microsoft365: enlaceOutlookEn('https://outlook.office.com', e),
    yahoo: enlaceYahooCalendar(e),
  }
}

/** Escape de texto de RFC 5545 § 3.3.11. */
const escapar = (texto: string): string =>
  texto.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const codificador = new TextEncoder()

/** Plegado de RFC 5545 § 3.1: ninguna línea pasa de 75 octetos; la continuación empieza con un espacio. */
function plegar(linea: string): string {
  const partes: string[] = []
  let actual = ''
  let octetos = 0
  for (const caracter of linea) {
    const largo = codificador.encode(caracter).length
    const limite = partes.length === 0 ? 75 : 74 // la continuación lleva el espacio
    if (octetos + largo > limite) {
      partes.push(actual)
      actual = ''
      octetos = 0
    }
    actual += caracter
    octetos += largo
  }
  partes.push(actual)
  return partes.join('\r\n ')
}

export function textoIcs(e: EventoAsamblea, generado: Date): string {
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flay//Asambleas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@flay`,
    `DTSTAMP:${utc(generado)}`,
    `DTSTART:${utc(e.inicio)}`,
    `DTEND:${utc(fin(e))}`,
    `SUMMARY:${escapar(e.titulo)}`,
    `LOCATION:${escapar(e.lugar)}`,
    `DESCRIPTION:${escapar(e.descripcion)}`,
    ...(e.enlace ? [`URL:${e.enlace}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lineas.map(plegar).join('\r\n') + '\r\n'
}
