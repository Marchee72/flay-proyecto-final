const fs=require('fs')
const p='docs/entrega-final/15-pruebas.md'
let s=fs.readFileSync(p,'utf8')
const filas = {
 'PI-02': '**Cumple** (12/09/2026, proveedor real): sobre una foto desenfocada y rotada el extractor devolvió confianza 0,300 con fecha e importe inventados; por debajo del umbral 0,5 (CU-06 3b) no se precarga ningún campo y la pantalla lo dice. Latencia 9,0 s. `pruebas/integracion/extraccion.spec.ts` reproduce esa salida',
 'PI-03': '**Cumple** (12/09/2026): proyecto `degradacion` de Playwright contra un servidor con la implementación nula (`pruebas/e2e/asistencia.degradacion.spec.ts`), más `asistencia.spec.ts` con `no_disponible`: el comprobante queda guardado, el formulario vacío y el gasto se carga a mano; reclamos y consulta siguen',
 'PI-04': '**Cumple**: `pruebas/integracion/extraccion.spec.ts` («una salida fuera de esquema equivale a servicio no disponible»)',
 'PI-05': '**Cumple**: la revisión (`/gastos/asistida/[id]`) muestra el comprobante junto al formulario; `pruebas/e2e/asistencia.spec.ts` (SC-017) corrige el importe y verifica `campos_corregidos = ["importe"]`',
 'PI-07': '**Cumple** (12/09/2026, proveedor real, `gemini-3.5-flash-lite` porque `gemini-3.5-flash` devolvía 503 por demanda): «¿Cuánto cuesta el estacionamiento para visitas?» → sin respaldo, 3,5 s; como consorcista del otro consorcio, la pregunta del SUM → sin respaldo, 0,6 s (ningún fragmento ajeno llega al generador). Con la determinista, diez preguntas sin respuesta dan diez abstenciones (`consulta-documental.spec.ts`)',
 'PI-08': '**Cumple** (12/09/2026, proveedor real): «¿Cuántas personas entran en el salón de usos múltiples?» → «La capacidad máxima del salón de usos múltiples es de cuarenta personas», cita Reglamento de copropiedad, fragmento 50, 3,9 s; indexar los 72 artículos tomó 7,3 s. Sin citas no hay respuesta, lo decide el caso de uso',
 'PI-09': '**Cumple**: `pruebas/integracion/triage.spec.ts` («con la nula el reclamo se crea sin sugerencia»)',
}
for (const [id, estado] of Object.entries(filas)) {
  const re = new RegExp(`^(\| ${id} \|[^\n]*\|)\s*\|$`, 'm')
  if (!re.test(s)) throw new Error('no encontrada ' + id)
  s = s.replace(re, `$1 ${estado} |`)
}
fs.writeFileSync(p, s)
