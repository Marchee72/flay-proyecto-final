// Semilla del juego de datos de § 13.4 (FR-028): dos consorcios de 12 y 96
// unidades, con sus coeficientes sumando 100.00000000 exacto, mas el catalogo
// de rubros. Deterministica: dos corridas dejan exactamente lo mismo.
//
// Desde 004-servicios agrega los usuarios ficticios (sin contraseña), los
// espacios comunes, los reclamos con historial y el reglamento como documento
// del consorcio de 12, en `pendiente` con su trabajo de indexacion.
//
// Encima de eso, `semilla-demo.ts` agrega dos edificios mas, proveedores, seis
// meses de gastos liquidados con sus pagos, reclamos, reservas y novedades,
// usando los casos de uso reales. Por eso corre con `vite-node` y no con
// `node`: los casos de uso importan con alias `@/`.
//
// No crea contraseñas salvo que DEMO_CLAVE este definida: entonces los
// usuarios ficticios nacen activos con esa misma clave, para entrar como cada
// rol en la demostracion (§ 13.5). Sin ella, el unico que entra sale de
// `npm run semilla:arranque`, con la clave en variable de entorno (FR-005).
import { existsSync, readFileSync } from 'node:fs'

import { hash } from '@node-rs/argon2'

import { prismaBase as prisma } from '@/infraestructura/prisma'

import { sembrarJuego } from '../pruebas/fixtures/juego-13-4.ts'
import { sembrarServicios } from '../pruebas/fixtures/servicios-13-4.ts'
import { sembrarRubros } from '../prisma/semilla-rubros.ts'
import { sembrarDemo } from './semilla-demo.ts'

// `.env.local` es donde `vercel env pull` deja el token del almacen: sin el,
// el reglamento queda registrado pero sin archivo y la indexacion falla.
for (const archivo of ['.env', '.env.local']) {
  if (existsSync(archivo)) process.loadEnvFile(archivo)
}

/** El reglamento va al almacen de objetos si hay token; si no, queda registrado igual. */
async function guardarEnAlmacen(clave, bytes, tipoContenido) {
  const { put } = await import('@vercel/blob')
  await put(clave, bytes, { access: 'public', contentType: tipoContenido, addRandomSuffix: false })
}

try {
  const rubros = await sembrarRubros(prisma)
  const juego = await sembrarJuego(prisma)

  console.log(`Rubros asegurados: ${rubros}.`)
  for (const consorcio of juego.consorcios) {
    console.log(`Consorcio ${consorcio.nombre}: ${consorcio.unidades} unidades.`)
  }

  const porNombre = Object.fromEntries(juego.consorcios.map((c) => [c.nombre, c.id]))
  const base = { 'C-A': porNombre['Mitre 456'], 'C-B': porNombre['San Martin 7890'] }
  const claveDerivada = process.env.DEMO_CLAVE
    ? await hash(process.env.DEMO_CLAVE, { memoryCost: 19_456, timeCost: 2, parallelism: 1 })
    : undefined
  const servicios = await sembrarServicios(prisma, base, {
    reglamento: {
      titulo: 'Reglamento de copropiedad — Torre Pellegrini',
      contenido: readFileSync('datos-cliente/reglamento/reglamento-copropiedad.md'),
      tipoContenido: 'text/markdown',
    },
    guardar: process.env.BLOB_READ_WRITE_TOKEN ? guardarEnAlmacen : undefined,
    claveDerivada,
  })
  console.log(
    `Usuarios ficticios: ${Object.keys(servicios.usuarios).length} · espacios: ${servicios.espacios} · reclamos nuevos: ${servicios.reclamos} · reglamento: ${servicios.documentoId ? 'registrado' : 'no'}.`,
  )

  const demo = await sembrarDemo(base, { claveDerivada })
  console.log(
    `Demo: consorcios ${demo.consorcios} · proveedores nuevos ${demo.proveedores} · gastos ${demo.gastos} · liquidaciones ${demo.liquidaciones} · pagos ${demo.pagos} · reclamos ${demo.reclamos} · reservas ${demo.reservas} · novedades ${demo.novedades}.`,
  )
  console.log('Para cargar el volumen anual: npm run semilla:volumen')
} finally {
  await prisma.$disconnect()
}
