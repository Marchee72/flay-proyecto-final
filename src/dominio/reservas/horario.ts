/** Horario de uso de un espacio común (RF-15), siempre en hora argentina. */
export interface HorarioDeUso {
  /** Minutos desde las 00:00, 0..1439. */
  apertura: number
  /** Minutos desde las 00:00. `cierre <= apertura` significa que cruza la medianoche. */
  cierre: number
}

const FORMATO = /^([01]\d|2[0-3]):([0-5]\d)$/

export function minutosDesdeHora(hora: string): number | null {
  const m = FORMATO.exec(hora)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function horaDesdeMinutos(minutos: number): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(minutos / 60))}:${p(minutos % 60)}`
}

export function errorDeHorario(apertura: string, cierre: string): string | null {
  if (apertura === '' && cierre === '') return null
  if (apertura === '' || cierre === '')
    return 'Completá la apertura y el cierre, o dejá los dos vacíos.'
  const a = minutosDesdeHora(apertura)
  const c = minutosDesdeHora(cierre)
  if (a === null || c === null) return 'Usá horas del día, de 00:00 a 23:59.'
  if (a === c) return 'La apertura y el cierre no pueden ser la misma hora.'
  return null
}

const FORMATEADOR = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function minutoArgentino(fecha: Date): number {
  const partes = FORMATEADOR.formatToParts(fecha)
  const dato = (t: string) => Number(partes.find((p) => p.type === t)?.value)
  return dato('hour') * 60 + dato('minute')
}

export function dentroDelHorario(desde: Date, hasta: Date, horario: HorarioDeUso | null): boolean {
  if (!horario) return true
  const largo = (horario.cierre - horario.apertura + 1440) % 1440
  const desdeApertura = (minutoArgentino(desde) - horario.apertura + 1440) % 1440
  const duracion = (hasta.getTime() - desde.getTime()) / 60_000
  return desdeApertura + duracion <= largo
}

export function horarioParaMostrar(horario: HorarioDeUso): string {
  return `de ${horaDesdeMinutos(horario.apertura)} a ${horaDesdeMinutos(horario.cierre)}`
}
