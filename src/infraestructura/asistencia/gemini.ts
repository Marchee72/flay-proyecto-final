import { createPartFromBase64, GoogleGenAI, type Schema, Type } from '@google/genai'
import { z } from 'zod'

import {
  type Asistencia,
  DIMENSIONES_VECTOR,
  disponible,
  type ExtraccionPropuesta,
  noDisponible,
  type Resultado,
} from '@/dominio/contratos/asistencia'

/**
 * La implementacion del proveedor elegido en § 14.3 (research R-01): Gemini
 * API por su SDK oficial, en capa paga. Es el **unico** archivo del sistema
 * que lo importa. Salida estructurada por esquema JSON y validada con Zod
 * antes de devolverla: una salida fuera de esquema equivale a indisponibilidad
 * (§ 8.3, PI-04). Un reintento ante 429/503 y despues `disponible: false`,
 * nunca una excepcion (RNF-14).
 */

const MODELO_TEXTO = process.env.GEMINI_MODELO ?? 'gemini-3.5-flash'
const MODELO_VECTORES = process.env.GEMINI_MODELO_VECTORES ?? 'gemini-embedding-001'
const LOTE_DE_VECTORES = 20

const cliente = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

/** Errores de cuota o de carga del proveedor: un reintento con espera y listo. */
async function conReintento<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  for (let intento = 0; ; intento++) {
    try {
      return disponible(await fn())
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error)
      const transitorio = /\b(429|503|overloaded|quota|RESOURCE_EXHAUSTED|UNAVAILABLE)\b/i.test(
        mensaje,
      )
      if (transitorio && intento === 0) {
        await new Promise((f) => setTimeout(f, 4000))
        continue
      }
      return noDisponible(
        transitorio
          ? 'El servicio de asistencia está saturado en este momento. Probá de nuevo en unos minutos.'
          : 'El servicio de asistencia no respondió como se esperaba.',
      )
    }
  }
}

const ESQUEMA_EXTRACCION: Schema = {
  type: Type.OBJECT,
  properties: {
    proveedor: { type: Type.STRING, nullable: true },
    cuit: { type: Type.STRING, nullable: true },
    fecha: { type: Type.STRING, nullable: true },
    importe: { type: Type.STRING, nullable: true },
    rubroCodigo: { type: Type.STRING, nullable: true },
    confianza: { type: Type.NUMBER },
    confianzaPorCampo: {
      type: Type.OBJECT,
      properties: {
        proveedor: { type: Type.NUMBER },
        cuit: { type: Type.NUMBER },
        fecha: { type: Type.NUMBER },
        importe: { type: Type.NUMBER },
        rubro: { type: Type.NUMBER },
      },
      required: ['proveedor', 'cuit', 'fecha', 'importe', 'rubro'],
    },
  },
  required: [
    'proveedor',
    'cuit',
    'fecha',
    'importe',
    'rubroCodigo',
    'confianza',
    'confianzaPorCampo',
  ],
}

const aTexto = (v: string | null | undefined) => (v && v.trim() !== '' ? v.trim() : null)
const aConfianza = (n: number) => Math.min(1, Math.max(0, n)).toFixed(3)
const confianzaZod = z.number().min(0).max(1)

const ExtraccionZod = z.object({
  proveedor: z.string().nullable(),
  cuit: z.string().nullable(),
  fecha: z.string().nullable(),
  importe: z.string().nullable(),
  rubroCodigo: z.string().nullable(),
  confianza: confianzaZod,
  confianzaPorCampo: z.object({
    proveedor: confianzaZod,
    cuit: confianzaZod,
    fecha: confianzaZod,
    importe: confianzaZod,
    rubro: confianzaZod,
  }),
})

const ESQUEMA_TRIAGE: Schema = {
  type: Type.OBJECT,
  properties: {
    rubroCodigo: { type: Type.STRING, nullable: true },
    urgencia: { type: Type.STRING, nullable: true, enum: ['baja', 'media', 'alta', 'critica'] },
    proveedorId: { type: Type.STRING, nullable: true },
    horasEstimadas: { type: Type.INTEGER, nullable: true },
    confianza: { type: Type.NUMBER },
  },
  required: ['rubroCodigo', 'urgencia', 'proveedorId', 'horasEstimadas', 'confianza'],
}

const TriageZod = z.object({
  rubroCodigo: z.string().nullable(),
  urgencia: z.enum(['baja', 'media', 'alta', 'critica']).nullable(),
  proveedorId: z.string().nullable(),
  horasEstimadas: z.number().int().nonnegative().nullable(),
  confianza: confianzaZod,
})

const ESQUEMA_RESPUESTA: Schema = {
  type: Type.OBJECT,
  properties: {
    respuesta: { type: Type.STRING },
    citas: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    sinRespaldo: { type: Type.BOOLEAN },
  },
  required: ['respuesta', 'citas', 'sinRespaldo'],
}

const RespuestaZod = z.object({
  respuesta: z.string(),
  citas: z.array(z.number().int()),
  sinRespaldo: z.boolean(),
})

async function generarJson<T>(
  sistema: string,
  partes: (string | [datos: string, tipoContenido: string])[],
  esquema: Schema,
  validar: z.ZodType<T>,
): Promise<Resultado<T>> {
  const resultado = await conReintento(async () => {
    const respuesta = await cliente().models.generateContent({
      model: MODELO_TEXTO,
      contents: [
        {
          role: 'user',
          parts: partes.map((p) =>
            typeof p === 'string' ? { text: p } : createPartFromBase64(...p),
          ),
        },
      ],
      config: {
        systemInstruction: sistema,
        responseMimeType: 'application/json',
        responseSchema: esquema,
        temperature: 0,
      },
    })
    return respuesta.text ?? ''
  })
  if (!resultado.disponible) return resultado
  try {
    return disponible(validar.parse(JSON.parse(resultado.valor)))
  } catch {
    // Fuera de esquema: se descarta y equivale a servicio no disponible (§ 8.3).
    return noDisponible('El servicio de asistencia devolvió una respuesta que no se entiende.')
  }
}

export const asistenciaGemini: Asistencia = {
  extractor: {
    async extraer(documento, contexto) {
      const sistema = `Sos el asistente de carga de gastos de una administracion de consorcios de Rosario, Argentina.
Extrae del comprobante adjunto estos campos, y en cada uno una confianza entre 0 y 1:
- proveedor: razon social o nombre del EMISOR (no del cliente, que siempre es el consorcio).
- cuit: CUIT del emisor, formato NN-NNNNNNNN-N.
- fecha: fecha de EMISION, AAAA-MM-DD. No la de vencimiento ni la del periodo.
- importe: importe TOTAL del comprobante fiscal, con punto decimal y dos decimales (ej. 96500.00). Si hay presupuesto y factura, vale la factura. Las retenciones informativas no se descuentan.
- rubroCodigo: el codigo de esta lista que mejor describe el gasto, o null:
${contexto.rubros.map((r) => `  ${r.codigo} — ${r.nombre}: ${r.descripcion}`).join('\n')}
Si un campo no se puede leer, devolve null en ese campo y confianza 0.`
      const resultado = await generarJson(
        sistema,
        [
          [Buffer.from(documento.bytes).toString('base64'), documento.tipoContenido],
          'Extrae los campos de este comprobante.',
        ],
        ESQUEMA_EXTRACCION,
        ExtraccionZod,
      )
      if (!resultado.disponible) return resultado
      const v = resultado.valor
      const propuesta: ExtraccionPropuesta = {
        proveedor: aTexto(v.proveedor),
        cuit: aTexto(v.cuit),
        fecha: aTexto(v.fecha),
        importe: aTexto(v.importe),
        rubroCodigo: contexto.rubros.some((r) => r.codigo === v.rubroCodigo) ? v.rubroCodigo : null,
        confianza: aConfianza(v.confianza),
        confianzaPorCampo: {
          proveedor: aConfianza(v.confianzaPorCampo.proveedor),
          cuit: aConfianza(v.confianzaPorCampo.cuit),
          fecha: aConfianza(v.confianzaPorCampo.fecha),
          importe: aConfianza(v.confianzaPorCampo.importe),
          rubro: aConfianza(v.confianzaPorCampo.rubro),
        },
      }
      return disponible(propuesta)
    },
  },

  clasificador: {
    async clasificar(texto, contexto) {
      const sistema = `Sos el asistente de una administracion de consorcios. Clasifica el reclamo de un consorcista.
Rubros posibles (codigo — nombre):
${contexto.rubros.map((r) => `  ${r.codigo} — ${r.nombre}`).join('\n')}
Proveedores del consorcio (id — nombre — rubros que atiende). Sugeri uno SOLO de esta lista, o null:
${contexto.proveedores.map((p) => `  ${p.id} — ${p.nombre} — ${p.rubros.join(', ') || 'sin rubro'}`).join('\n') || '  (ninguno)'}
Urgencia: critica si afecta agua, gas, electricidad, ascensor o seguridad de las personas; alta si impide usar una parte del edificio; media en el resto; baja si es estetico.
horasEstimadas: estimacion de horas hasta resolver. confianza entre 0 y 1.`
      const resultado = await generarJson(
        sistema,
        [`Titulo: ${texto.titulo}\nDescripcion: ${texto.descripcion}`],
        ESQUEMA_TRIAGE,
        TriageZod,
      )
      if (!resultado.disponible) return resultado
      const v = resultado.valor
      return disponible({
        rubroCodigo: contexto.rubros.some((r) => r.codigo === v.rubroCodigo) ? v.rubroCodigo : null,
        urgencia: v.urgencia,
        proveedorId: contexto.proveedores.some((p) => p.id === v.proveedorId)
          ? v.proveedorId
          : null,
        horasEstimadas: v.horasEstimadas,
        confianza: aConfianza(v.confianza),
      })
    },
  },

  vectores: {
    dimensiones: DIMENSIONES_VECTOR,
    pisoDeSimilitud: 0.55,
    async vectorizar(textos, tipo) {
      const salida: number[][] = []
      for (let i = 0; i < textos.length; i += LOTE_DE_VECTORES) {
        const lote = textos.slice(i, i + LOTE_DE_VECTORES)
        const resultado = await conReintento(async () => {
          const respuesta = await cliente().models.embedContent({
            model: MODELO_VECTORES,
            contents: lote,
            config: {
              taskType: tipo === 'consulta' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
              outputDimensionality: DIMENSIONES_VECTOR,
            },
          })
          const vectores = (respuesta.embeddings ?? []).map((e) => e.values ?? [])
          if (
            vectores.length !== lote.length ||
            vectores.some((v) => v.length !== DIMENSIONES_VECTOR)
          ) {
            throw new Error(
              'El proveedor devolvió una cantidad o dimensión de vectores inesperada.',
            )
          }
          return vectores
        })
        if (!resultado.disponible) return resultado
        salida.push(...resultado.valor)
      }
      return disponible(salida)
    },
  },

  respuestas: {
    async responder(pregunta, fragmentos) {
      const sistema = `Respondes preguntas de consorcistas SOLO con lo que dicen los fragmentos de documentos que recibis.
Reglas, sin excepcion:
- Si los fragmentos no contienen la respuesta, sinRespaldo=true, respuesta vacia y citas vacias. No inventes, no completes con conocimiento general.
- Si contienen la respuesta, respondela en castellano rioplatense, breve, y pone en citas los numeros de los fragmentos que la sostienen.
- Nunca menciones datos de personas ni de deudas: los documentos son reglamentos, actas y contratos.`
      const cuerpo = fragmentos
        .map(
          (f) =>
            `[${f.numero}] (${f.documento}${f.pagina ? `, pág. ${f.pagina}` : ''})\n${f.contenido}`,
        )
        .join('\n\n')
      const resultado = await generarJson(
        sistema,
        [`Fragmentos:\n\n${cuerpo}\n\nPregunta: ${pregunta}`],
        ESQUEMA_RESPUESTA,
        RespuestaZod,
      )
      if (!resultado.disponible) return resultado
      const v = resultado.valor
      const citas = v.citas.filter((n) => fragmentos.some((f) => f.numero === n))
      // Sin citas no hay respuesta, diga lo que diga el modelo (Principio IV).
      if (v.sinRespaldo || citas.length === 0) {
        return disponible({ respuesta: '', citas: [], sinRespaldo: true })
      }
      return disponible({ respuesta: v.respuesta, citas, sinRespaldo: false })
    },
  },
}
