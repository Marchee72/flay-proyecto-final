// PoC 1 de § 8.4.3: extraccion de datos de comprobantes. Corre los 30 archivos
// de `datos-cliente/comprobantes/archivos/` contra un proveedor y compara con
// el indice, campo por campo. Umbral: al menos el 80 % de los campos correctos
// sin correccion humana.
//
//   node poc/poc-extraccion.mjs <anthropic|gemini|mistral> [--limite N] [--desde Cnn]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { CAMPOS, elegir, instrucciones, tokens } from './proveedores.mjs'

if (existsSync('.env')) process.loadEnvFile('.env')

const [nombre, ...resto] = process.argv.slice(2)
const limite = Number(resto[resto.indexOf('--limite') + 1]) || 30
const desde = resto.includes('--desde') ? resto[resto.indexOf('--desde') + 1] : 'C01'
const proveedor = elegir(nombre ?? 'anthropic', 'extraer')
const UMBRAL = 0.8

const csv = (ruta) => {
  const [cabecera, ...filas] = readFileSync(ruta, 'utf8').trim().split('\n')
  const claves = cabecera.split(';')
  return filas.map((f) => Object.fromEntries(f.split(';').map((v, i) => [claves[i], v])))
}
const todas = csv('datos-cliente/comprobantes/indice-30.csv')
const indice = todas.slice(todas.findIndex((f) => f.id === desde)).slice(0, limite)
const rubros = csv('datos-cliente/rubros-semilla.csv')
const sistema = instrucciones(rubros)

/** Comparadores por campo: tolerantes con el formato, estrictos con el dato. */
const aCentavos = (s) => {
  let t = String(s ?? '').replace(/[^\d.,-]/g, '')
  if (t.includes(',') && t.includes('.'))
    t =
      t.lastIndexOf(',') > t.lastIndexOf('.')
        ? t.replace(/\./g, '').replace(',', '.')
        : t.replace(/,/g, '')
  else if (t.includes(',')) t = t.replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null
  return Math.round(Number(t) * 100)
}
const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '')
const nombreParecido = (esperado, obtenido) => {
  const a = tokens(esperado.replace(/\(.*?\)/g, ''))
  const b = tokens(String(obtenido ?? ''))
  if (a.length === 0 || b.length === 0) return false
  const comunes = a.filter((t) => b.includes(t)).length
  if (comunes / Math.min(a.length, b.length) >= 0.5) return true
  // "EPE" contra "Empresa Provincial de la Energia de Santa Fe": la sigla del nombre largo.
  const sigla = b.map((t) => t[0]).join('')
  return a.length === 1 && a[0].length <= 5 && sigla.startsWith(a[0])
}
const COMPARAR = {
  proveedor: (e, o) => nombreParecido(e, o),
  cuit: (e, o) => soloDigitos(e).length === 11 && soloDigitos(e) === soloDigitos(o),
  fecha: (e, o) => e === String(o ?? '').trim(),
  importe: (e, o) => aCentavos(e) === aCentavos(o),
  rubro: (e, o) =>
    e ===
    String(o ?? '')
      .trim()
      .toUpperCase(),
}

const resultados = []
const aciertos = Object.fromEntries(CAMPOS.map((c) => [c, 0]))
const inicio = Date.now()
for (const fila of indice) {
  const archivo = `datos-cliente/comprobantes/archivos/${fila.id}.${existsSync(`datos-cliente/comprobantes/archivos/${fila.id}.pdf`) ? 'pdf' : 'png'}`
  const mime = archivo.endsWith('.pdf') ? 'application/pdf' : 'image/png'
  const t0 = Date.now()
  let datos = {}
  let uso = null
  let error = null
  try {
    ;({ datos, uso } = await proveedor.extraer({ bytes: readFileSync(archivo), mime }, sistema))
  } catch (e) {
    error = e.message
  }
  const campos = Object.fromEntries(
    CAMPOS.map((c) => [c, !error && COMPARAR[c](fila[c], datos?.[c])]),
  )
  for (const c of CAMPOS) if (campos[c]) aciertos[c]++
  const marca = CAMPOS.map((c) => (campos[c] ? '✓' : '✗')).join(' ')
  console.log(
    `${fila.id}  ${marca}  ${Date.now() - t0} ms  ${fila.observacion}${error ? `  ERROR ${error.slice(0, 80)}` : ''}`,
  )
  resultados.push({
    id: fila.id,
    observacion: fila.observacion,
    esperado: Object.fromEntries(CAMPOS.map((c) => [c, fila[c]])),
    obtenido: datos,
    campos,
    ms: Date.now() - t0,
    uso,
    error,
  })
}

const total = indice.length * CAMPOS.length
const correctos = Object.values(aciertos).reduce((a, b) => a + b, 0)
const precision = correctos / total
console.log('\nPor campo:', CAMPOS.map((c) => `${c} ${aciertos[c]}/${indice.length}`).join(' · '))
console.log(
  `Total: ${correctos}/${total} = ${(precision * 100).toFixed(1)} %  (umbral ${UMBRAL * 100} %)  →  ${precision >= UMBRAL ? 'SUPERA' : 'NO SUPERA'}`,
)
console.log(
  `Proveedor ${proveedor.nombre} · modelo ${proveedor.modeloExtraccion} · ${((Date.now() - inicio) / 1000).toFixed(0)} s`,
)

mkdirSync('poc/resultados', { recursive: true })
const salida = `poc/resultados/extraccion-${proveedor.nombre}-${proveedor.modeloExtraccion}.json`
writeFileSync(
  salida,
  JSON.stringify(
    {
      proveedor: proveedor.nombre,
      modelo: proveedor.modeloExtraccion,
      fecha: new Date().toISOString(),
      comprobantes: indice.length,
      aciertos,
      correctos,
      total,
      precision,
      umbral: UMBRAL,
      supera: precision >= UMBRAL,
      resultados,
    },
    null,
    2,
  ) + '\n',
)
console.log(`Detalle en ${salida}`)
