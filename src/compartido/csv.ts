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

export function filaCsv(valores: readonly (string | number | null | undefined)[]): string {
  return `${valores.map(celdaCsv).join(SEPARADOR)}\r\n`
}
