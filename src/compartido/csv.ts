/**
 * CSV abierto (FR-032b, research R-13): UTF-8 con BOM para que la planilla
 * del cliente lo abra bien, separador `;` (regional es-AR), comillas dobladas.
 * Los importes llegan ya como cadena con punto decimal: aca no se formatea
 * dinero, solo se escapa texto.
 */
export const BOM = '﻿'
export const SEPARADOR = ';'

export function celdaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  const texto = String(valor)
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

/**
 * Lectura: separador `;` o `,` (el que aparezca primero fuera de comillas en la
 * primera línea), comillas dobladas, BOM descartado. No decodifica bytes.
 */
export function filasDeCsv(texto: string): string[][] {
  const t = texto.startsWith(BOM) ? texto.slice(1) : texto
  let sep = ','
  let entre = false
  for (const c of t) {
    if (c === '"') entre = !entre
    else if (!entre && (c === ';' || c === ',')) {
      sep = c
      break
    } else if (!entre && (c === '\n' || c === '\r')) break
  }
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let comillas = false
  const cerrarCelda = () => {
    fila.push(celda)
    celda = ''
  }
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!
    if (comillas) {
      if (c !== '"') celda += c
      else if (t[i + 1] === '"') {
        celda += '"'
        i++
      } else comillas = false
    } else if (c === '"') comillas = true
    else if (c === sep) cerrarCelda()
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      cerrarCelda()
      filas.push(fila)
      fila = []
    } else celda += c
  }
  if (celda !== '' || fila.length) {
    cerrarCelda()
    filas.push(fila)
  }
  return filas
}

export function filaCsv(valores: readonly (string | number | null | undefined)[]): string {
  return `${valores.map(celdaCsv).join(SEPARADOR)}\r\n`
}
