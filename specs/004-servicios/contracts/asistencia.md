# Contrato — Interfaces de asistencia automática (dominio)

Viven en `src/dominio/contratos/asistencia.ts`. El dominio las **declara**; `src/infraestructura/asistencia/`
las implementa tres veces —`gemini.ts`, `determinista.ts`, `nula.ts`— y `src/aplicacion/dependencias.ts`
elige una por entorno (research R-01, R-02; SC-012). Ninguna acepta ni devuelve `number` para
dinero: `importe` es cadena con punto decimal.

Toda implementación **no lanza** por indisponibilidad del servicio: devuelve `{ disponible: false, motivo }`.
Lanzar queda reservado a errores de programación. Es lo que hace que RNF-14 sea una propiedad de la
firma y no de cada llamador.

```ts
export type Resultado<T> = { disponible: true; valor: T } | { disponible: false; motivo: string }

export interface ExtractorDocumental {
  /** Comprobante en bytes; la salida ya viene validada contra el esquema (§ 8.3). */
  extraer(documento: { bytes: Uint8Array; tipoContenido: string }, contexto: { rubros: RubroParaClasificar[] }):
    Promise<Resultado<ExtraccionPropuesta>>
}

export interface ExtraccionPropuesta {
  proveedor: string | null
  cuit: string | null          // NN-NNNNNNNN-N o null
  fecha: string | null         // AAAA-MM-DD
  importe: string | null       // "96500.00"
  rubroCodigo: string | null   // uno de contexto.rubros, o null
  confianza: string            // "0.000" a "1.000"
  confianzaPorCampo: Record<'proveedor' | 'cuit' | 'fecha' | 'importe' | 'rubro', string>
}

export interface ClasificadorTexto {
  /** Triage de un reclamo. El proveedor sugerido sale de `contexto.proveedores` o es null. */
  clasificar(texto: { titulo: string; descripcion: string }, contexto: { rubros: RubroParaClasificar[]; proveedores: ProveedorParaSugerir[] }):
    Promise<Resultado<SugerenciaTriage>>
}

export interface SugerenciaTriage {
  rubroCodigo: string | null
  urgencia: 'baja' | 'media' | 'alta' | 'critica' | null
  proveedorId: string | null
  horasEstimadas: number | null   // horas, no dinero
  confianza: string
}

export interface GeneradorVectores {
  readonly dimensiones: 768
  vectorizar(textos: string[], tipo: 'documento' | 'consulta'): Promise<Resultado<number[][]>>
}

export interface GeneradorRespuesta {
  /**
   * Responde solo con lo que dicen los fragmentos. `citas` son numeros de fragmento del arreglo
   * recibido; vacio significa "no esta en la documentacion" (Principio IV, SC-014, SC-015).
   */
  responder(pregunta: string, fragmentos: FragmentoParaResponder[]): Promise<Resultado<RespuestaFundada>>
}

export interface FragmentoParaResponder { numero: number; documento: string; pagina: number | null; contenido: string }
export interface RespuestaFundada { respuesta: string; citas: number[]; sinRespaldo: boolean }

export interface RubroParaClasificar { codigo: string; nombre: string; descripcion: string }
export interface ProveedorParaSugerir { id: string; nombre: string; rubros: string[] }
```

## Comportamiento por implementación

| Método | `gemini.ts` | `determinista.ts` | `nula.ts` |
|---|---|---|---|
| `extraer` | PDF o imagen en línea, salida estructurada con esquema JSON, `temperature 0`, un reintento ante 429/503 y después `disponible: false` | Regex: CUIT `\d{2}-\d{8}-\d`, fecha `dd/mm/aaaa`, el importe que sigue a «total»; rubro por palabra clave del nombre; confianza `1.000` si encontró los cinco, `0.500` si no | `disponible: false`, motivo «servicio de extracción no configurado» |
| `clasificar` | Igual, con la lista de proveedores en el mensaje; el id devuelto se verifica contra la lista | Rubro por palabra clave; urgencia `critica` si el texto menciona agua, gas, electricidad, ascensor o seguridad; proveedor: el primero cuyo rubro coincide | `disponible: false` |
| `vectorizar` | `gemini-embedding-001`, 768 dimensiones, `taskType` según `tipo`, lotes de 20 | Bolsa de palabras normalizada, proyectada a 768 por hash de cada token; misma entrada, mismo vector | `disponible: false` |
| `responder` | Fragmentos numerados en el mensaje; salida estructurada `{ respuesta, citas, sinRespaldo }`; sin citas ⇒ `sinRespaldo: true` | Cita el fragmento que comparte más palabras con la pregunta si comparte al menos dos; si no, `sinRespaldo` | `disponible: false` |

**Validación de salida**: cada implementación del proveedor valida la respuesta con Zod antes de
devolverla; una salida fuera de esquema equivale a `disponible: false` (§ 8.3, PI-04).
