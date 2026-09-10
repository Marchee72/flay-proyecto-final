// Arnes de RNF-06 (I-07): entorno, volumen y percentil fijados, para que "2 s"
// sea una medicion repetible y no una impresion.
//
// Las pantallas del panel exigen sesion, asi que el arnes entra por el mismo
// formulario que una persona: pide la marca contra falsificacion, manda las
// credenciales y se queda con la galleta. Sin eso, medir /gastos mediria la
// redireccion a /ingresar, que es rapidisima y no dice nada.
import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')

const URL_BASE = process.env.URL_BASE ?? 'http://localhost:3000'
const RUTA = process.argv[2] ?? '/api/salud'
const MUESTRAS = Number(process.env.MUESTRAS ?? 50)
const LIMITE_MS = Number(process.env.LIMITE_P95_MS ?? 2000)
const CORREO = process.env.MEDIR_CORREO ?? process.env.ADMIN_SEMILLA_CORREO
const CLAVE = process.env.MEDIR_CLAVE ?? process.env.ADMIN_SEMILLA_CLAVE

/** Galletas de la sesion, si la ruta las necesita. */
let galletas = ''

const guardar = (respuesta) => {
  const nuevas = respuesta.headers
    .getSetCookie()
    .map((galleta) => galleta.split(';')[0])
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
    body: new URLSearchParams({ csrfToken, correo: CORREO, contrasena: CLAVE, callbackUrl: RUTA }),
  })
  guardar(entrada)

  if (!galletas.includes('session-token')) {
    console.error('No se pudo iniciar sesion: revisar MEDIR_CORREO y MEDIR_CLAVE.')
    process.exit(1)
  }
}

// Todo lo que no sea la ruta de salud vive detras de la sesion.
if (!RUTA.startsWith('/api/') && CORREO && CLAVE) await iniciarSesion()

const percentil = (valores, p) => {
  const orden = [...valores].sort((a, b) => a - b)
  return orden[Math.min(orden.length - 1, Math.ceil((p / 100) * orden.length) - 1)]
}

const tiempos = []
for (let i = 0; i < MUESTRAS; i++) {
  const inicio = performance.now()
  const respuesta = await fetch(`${URL_BASE}${RUTA}`, {
    headers: galletas ? { cookie: galletas } : {},
    redirect: 'manual',
  })
  await respuesta.arrayBuffer()

  // Una redireccion es la vuelta a /ingresar: se estaria midiendo otra cosa.
  if (respuesta.status >= 300 && respuesta.status < 400) {
    console.error(`${RUTA} redirigio a ${respuesta.headers.get('location')}: falta la sesion.`)
    process.exit(1)
  }

  if (!respuesta.ok) {
    console.error(`${RUTA} respondio ${respuesta.status} en la muestra ${i + 1}.`)
    process.exit(1)
  }
  tiempos.push(performance.now() - inicio)
}

const p50 = percentil(tiempos, 50)
const p95 = percentil(tiempos, 95)
console.log(
  `${RUTA} · ${MUESTRAS} muestras · p50 ${p50.toFixed(0)} ms · p95 ${p95.toFixed(0)} ms · limite ${LIMITE_MS} ms`,
)

if (p95 > LIMITE_MS) {
  console.error(`p95 por encima del limite de RNF-06 (${LIMITE_MS} ms).`)
  process.exit(1)
}
