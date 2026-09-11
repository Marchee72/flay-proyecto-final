// PoC 2 de § 8.4.3: busqueda semantica sobre el reglamento. Un fragmento por
// articulo, vectores del proveedor, similitud coseno, y se mira si el articulo
// esperado esta entre los tres primeros. Umbral: al menos el 85 % de las 20
// preguntas (17 de 20).
//
//   node poc/poc-busqueda.mjs <voyage|gemini|mistral|lexico>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { elegir } from './proveedores.mjs'

if (existsSync('.env')) process.loadEnvFile('.env')

const proveedor = elegir(process.argv[2] ?? 'lexico', 'vectorizar')
const UMBRAL = 0.85
const K = 3

/** Un fragmento por articulo, con el titulo del capitulo adelante como contexto. */
function fragmentar(markdown) {
  const fragmentos = []
  let capitulo = ''
  for (const linea of markdown.split('\n')) {
    const cap = linea.match(/^###? (.+)$/)
    if (cap) capitulo = cap[1]
    const art = linea.match(/^Art\. (\d+)\. (.+)$/)
    if (art) fragmentos.push({ articulo: `Art. ${art[1]}`, texto: `${capitulo}. ${art[2]}` })
  }
  return fragmentos
}

const fragmentos = fragmentar(
  readFileSync('datos-cliente/reglamento/reglamento-copropiedad.md', 'utf8'),
)
const preguntas = readFileSync('datos-cliente/reglamento/preguntas-20.csv', 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((l) => {
    const [n, pregunta, esperado, fuente] = l.split(';')
    return { n, pregunta, esperado, fuentes: fuente.split('|') }
  })

const coseno = (a, b) => {
  let p = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    p += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? p / Math.sqrt(na * nb) : 0
}

const inicio = Date.now()
const vDocs = await proveedor.vectorizar(
  fragmentos.map((f) => f.texto),
  'documento',
)
const vPreg = await proveedor.vectorizar(
  preguntas.map((p) => p.pregunta),
  'consulta',
)

let aciertos = 0
const detalle = preguntas.map((p, i) => {
  const orden = fragmentos
    .map((f, j) => ({ articulo: f.articulo, similitud: coseno(vPreg[i], vDocs[j]) }))
    .sort((a, b) => b.similitud - a.similitud)
  const posicion = orden.findIndex((o) => p.fuentes.includes(o.articulo)) + 1
  const acierto = posicion > 0 && posicion <= K
  if (acierto) aciertos++
  console.log(
    `${p.n}  ${acierto ? '✓' : '✗'}  esperado ${p.fuentes.join('/')}  salio ${posicion || '>' + fragmentos.length}°  top-3: ${orden
      .slice(0, K)
      .map((o) => o.articulo)
      .join(', ')}  — ${p.pregunta}`,
  )
  return { ...p, posicion, acierto, top: orden.slice(0, 5) }
})

const tasa = aciertos / preguntas.length
console.log(
  `\nTop-${K}: ${aciertos}/${preguntas.length} = ${(tasa * 100).toFixed(0)} %  (umbral ${UMBRAL * 100} %)  →  ${tasa >= UMBRAL ? 'SUPERA' : 'NO SUPERA'}`,
)
console.log(
  `Proveedor ${proveedor.nombre} · modelo ${proveedor.modeloVectores} · ${fragmentos.length} fragmentos · ${((Date.now() - inicio) / 1000).toFixed(1)} s`,
)

mkdirSync('poc/resultados', { recursive: true })
const salida = `poc/resultados/busqueda-${proveedor.nombre}.json`
writeFileSync(
  salida,
  JSON.stringify(
    {
      proveedor: proveedor.nombre,
      modelo: proveedor.modeloVectores,
      fecha: new Date().toISOString(),
      fragmentos: fragmentos.length,
      k: K,
      aciertos,
      preguntas: preguntas.length,
      tasa,
      umbral: UMBRAL,
      supera: tasa >= UMBRAL,
      detalle,
    },
    null,
    2,
  ) + '\n',
)
console.log(`Detalle en ${salida}`)
