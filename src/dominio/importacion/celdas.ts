/**
 * Celdas de la planilla a valores canónicos. Los coeficientes se leen como
 * texto y nunca se redondean ni pasan por `number` (invariante 2).
 */
type Leido = { valor: string } | { error: string }

export function leerCoeficiente(texto: string): Leido {
  const t = texto.trim()
  if (t === '') return { error: 'Falta el coeficiente.' }
  if (!/^\d+([.,]\d+)?$/.test(t)) return { error: 'El coeficiente no es un número válido.' }
  const valor = t.replace(',', '.')
  if ((valor.split('.')[1] ?? '').length > 8)
    return { error: 'El coeficiente admite hasta 8 decimales.' }
  if (/^0*(\.0*)?$/.test(valor)) return { error: 'El coeficiente tiene que ser mayor que cero.' }
  return { valor }
}

export function leerFecha(texto: string): Leido {
  const t = texto.trim()
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t) ?? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  const invalida = { error: 'La fecha tiene que ser AAAA-MM-DD o día/mes/año.' }
  if (!m) return invalida
  const [anio, mes, dia] = t.includes('-') ? [+m[1]!, +m[2]!, +m[3]!] : [+m[3]!, +m[2]!, +m[1]!]
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia)
    return { error: 'La fecha no existe en el calendario.' }
  const dos = (n: number) => String(n).padStart(2, '0')
  return { valor: `${anio}-${dos(mes)}-${dos(dia)}` }
}

export function leerDni(texto: string): Leido {
  const valor = texto.replace(/[.\s]/g, '')
  return /^\d{7,8}$/.test(valor) ? { valor } : { error: 'El DNI tiene que tener 7 u 8 números.' }
}
