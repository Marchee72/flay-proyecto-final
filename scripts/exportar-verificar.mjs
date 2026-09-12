// SC-018 (condicion «exportacion abierta» de § 5.5.4): baja los tres CSV del
// consorcio de 12 unidades contra el entorno desplegado y los cuadra, en
// decimal, con lo que dice la base: la liquidacion vigente del ultimo periodo
// liquidado, sus gastos y los pagos del consorcio. Entra por el formulario,
// como una persona (mismo arnes que medir-p95).
//
//   URL_BASE=https://... npm run exportar:verificar
import { existsSync } from 'node:fs'

import { PrismaClient } from '@prisma/client'
import { Decimal } from 'decimal.js'

if (existsSync('.env')) process.loadEnvFile('.env')

const URL_BASE = process.env.URL_BASE ?? 'http://localhost:3000'
const CONSORCIO = process.env.EXPORTAR_CONSORCIO ?? 'Mitre 456'
const CORREO = process.env.MEDIR_CORREO ?? process.env.ADMIN_SEMILLA_CORREO
const CLAVE = process.env.MEDIR_CLAVE ?? process.env.ADMIN_SEMILLA_CLAVE
const D = (v) => new Decimal(v === null || v === undefined ? 0 : v.toString())

const prisma = new PrismaClient()
let galletas = ''
const guardar = (respuesta) => {
  const nuevas = respuesta.headers
    .getSetCookie()
    .map((g) => g.split(';')[0])
    .filter(Boolean)
  if (nuevas.length > 0) galletas = [galletas, ...nuevas].filter(Boolean).join('; ')
}

async function iniciarSesion() {
  const csrf = await fetch(`${URL_BASE}/api/auth/csrf`)
  guardar(csrf)
  const { csrfToken } = await csrf.json()
  const entrada = await fetch(`${URL_BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: galletas },
    body: new URLSearchParams({ csrfToken, correo: CORREO, contrasena: CLAVE, callbackUrl: '/' }),
  })
  guardar(entrada)
  if (!galletas.includes('session-token')) {
    console.error('No se pudo iniciar sesion: revisar MEDIR_CORREO y MEDIR_CLAVE.')
    process.exit(1)
  }
}

/** Lector minimo: `;`, comillas dobladas, CRLF. Devuelve objetos por encabezado. */
function leerCsv(texto) {
  const filas = []
  let fila = []
  let celda = ''
  let entreComillas = false
  const cuerpo = texto.startsWith('﻿') ? texto.slice(1) : texto
  for (let i = 0; i < cuerpo.length; i++) {
    const c = cuerpo[i]
    if (entreComillas) {
      if (c === '"' && cuerpo[i + 1] === '"') {
        celda += '"'
        i++
      } else if (c === '"') entreComillas = false
      else celda += c
    } else if (c === '"') entreComillas = true
    else if (c === ';') {
      fila.push(celda)
      celda = ''
    } else if (c === '\r') continue
    else if (c === '\n') {
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else celda += c
  }
  if (celda || fila.length) {
    fila.push(celda)
    filas.push(fila)
  }
  const [encabezado, ...datos] = filas
  return datos.map((f) => Object.fromEntries(encabezado.map((k, i) => [k, f[i]])))
}

async function bajar(consorcioId, tabla) {
  const inicio = performance.now()
  const respuesta = await fetch(`${URL_BASE}/api/exportar/${consorcioId}/${tabla}.csv`, {
    headers: { cookie: galletas },
    redirect: 'manual',
  })
  if (!respuesta.ok) {
    console.error(`${tabla}.csv respondio ${respuesta.status}.`)
    process.exit(1)
  }
  const texto = await respuesta.text()
  console.log(
    `${tabla}.csv · ${texto.length} caracteres · ${(performance.now() - inicio).toFixed(0)} ms`,
  )
  return leerCsv(texto)
}

const consorcio = await prisma.consorcio.findFirstOrThrow({ where: { nombre: CONSORCIO } })
const liquidacion = await prisma.liquidacion.findFirst({
  where: { consorcioId: consorcio.id, estado: 'vigente' },
  orderBy: { emitidaEn: 'desc' },
  include: { periodo: true },
})
if (!liquidacion) {
  console.error(`${CONSORCIO} no tiene ninguna liquidacion vigente: sembrar primero.`)
  process.exit(1)
}
const periodo = `${liquidacion.periodo.anio}-${String(liquidacion.periodo.mes).padStart(2, '0')}`

await iniciarSesion()
const [gastos, liquidaciones, pagos] = await Promise.all(
  ['gastos', 'liquidaciones', 'pagos'].map((t) => bajar(consorcio.id, t)),
)

const diferencias = []
const cuadrar = (nombre, esperado, obtenido) => {
  const ok = esperado.toFixed(2) === obtenido.toFixed(2)
  console.log(
    `${ok ? 'ok ' : 'NO '} ${nombre}: base ${esperado.toFixed(2)} · csv ${obtenido.toFixed(2)}`,
  )
  if (!ok) diferencias.push(nombre)
}

// Gastos del periodo liquidado: el CSV suma lo mismo que el total general emitido.
const gastosDelPeriodo = gastos.filter((g) => g.periodo === periodo)
cuadrar(
  `gastos ${periodo} (${gastosDelPeriodo.length} filas)`,
  D(liquidacion.totalGeneral),
  gastosDelPeriodo.reduce((s, g) => s.plus(D(g.importe)), D(0)),
)

// Detalles de la liquidacion vigente: ordinario + extraordinario + ajuste = total general.
const detalles = liquidaciones.filter((l) => l.liquidacion_id === liquidacion.id)
cuadrar(
  `liquidacion ${periodo} (${detalles.length} unidades)`,
  D(liquidacion.totalGeneral),
  detalles.reduce(
    (s, d) =>
      s.plus(D(d.importe_ordinario)).plus(D(d.importe_extraordinario)).plus(D(d.ajuste_redondeo)),
    D(0),
  ),
)

// Pagos: misma cantidad y misma suma que la tabla.
const pagosEnBase = await prisma.pago.aggregate({
  where: { consorcioId: consorcio.id },
  _sum: { importe: true },
  _count: true,
})
if (pagosEnBase._count !== pagos.length) {
  console.log(`NO  pagos: base ${pagosEnBase._count} filas · csv ${pagos.length}`)
  diferencias.push('pagos (cantidad)')
}
cuadrar(
  `pagos (${pagos.length} filas)`,
  D(pagosEnBase._sum.importe),
  pagos.reduce((s, p) => s.plus(D(p.importe)), D(0)),
)

await prisma.$disconnect()
if (diferencias.length > 0) {
  console.error(`La exportacion no cuadra: ${diferencias.join(', ')}.`)
  process.exit(1)
}
console.log('La exportacion cuadra al centavo con la base (SC-018).')
