// Adaptadores de las pruebas de concepto (§ 8.4.3, § 14.3). Codigo desechable:
// ninguna linea pasa a `src/`. Cada proveedor expone lo que sabe hacer:
//   extraer(archivo)            -> objeto con los cinco campos del comprobante
//   vectorizar(textos, tipo)    -> number[][]   (tipo: 'documento' | 'consulta')
// Los modelos se sobreescriben por variable de entorno para no tocar codigo
// cuando un alias cambie de nombre.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

export const CAMPOS = ['proveedor', 'cuit', 'fecha', 'importe', 'rubro']

const Extraccion = z.object({
  proveedor: z
    .string()
    .describe('Razon social o nombre del emisor del comprobante, tal como figura'),
  cuit: z.string().describe('CUIT del emisor, con el formato NN-NNNNNNNN-N'),
  fecha: z.string().describe('Fecha de emision del comprobante en formato AAAA-MM-DD'),
  importe: z
    .string()
    .describe(
      'Importe total del comprobante como cadena con punto decimal y dos decimales, ej. 96500.00',
    ),
  rubro: z
    .string()
    .describe('Codigo del rubro de gasto que mejor describe el comprobante, ej. R04'),
})

const ESQUEMA_JSON = {
  type: 'object',
  properties: {
    proveedor: { type: 'string' },
    cuit: { type: 'string' },
    fecha: { type: 'string' },
    importe: { type: 'string' },
    rubro: { type: 'string' },
  },
  required: CAMPOS,
}

export function instrucciones(rubros) {
  return `Sos el asistente de carga de gastos de una administracion de consorcios de Rosario, Argentina.
Extrae del comprobante adjunto exactamente estos campos y respondé solo con el JSON pedido:
- proveedor: razon social o nombre del EMISOR (no del cliente, que siempre es el consorcio).
- cuit: CUIT del emisor, formato NN-NNNNNNNN-N.
- fecha: fecha de EMISION del comprobante, AAAA-MM-DD. No la de vencimiento ni la del periodo.
- importe: importe TOTAL del comprobante fiscal, con punto decimal y dos decimales (ej. 96500.00). Si el archivo trae un presupuesto y una factura, vale la factura. Las retenciones informativas no se descuentan.
- rubro: el codigo de esta lista que mejor describe el gasto:
${rubros.map((r) => `  ${r.codigo} — ${r.nombre}: ${r.descripcion}`).join('\n')}
Si un campo no se puede leer, devolvé una cadena vacia en ese campo.`
}

/** Los proveedores devuelven 429 o 503 bajo carga: se reintenta con espera creciente antes de contarlo como error. */
async function pedir(url, opciones, intentos = 4) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, opciones)
    if (r.ok || i === intentos - 1 || ![429, 500, 502, 503, 504].includes(r.status)) return r
    await new Promise((f) => setTimeout(f, 3000 * 2 ** i))
  }
}

const aDataUri = (archivo) => `data:${archivo.mime};base64,${archivo.bytes.toString('base64')}`

/** Anthropic: PDF como documento, PNG como imagen, salida estructurada con Zod. Sin vectores propios. */
const anthropic = {
  nombre: 'anthropic',
  modeloExtraccion: process.env.ANTHROPIC_MODELO ?? 'claude-opus-5',
  clave: 'ANTHROPIC_API_KEY',
  async extraer(archivo, sistema) {
    const cliente = new Anthropic()
    const adjunto =
      archivo.mime === 'application/pdf'
        ? {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: archivo.bytes.toString('base64'),
            },
          }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type: archivo.mime,
              data: archivo.bytes.toString('base64'),
            },
          }
    const respuesta = await cliente.messages.parse({
      model: this.modeloExtraccion,
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(Extraccion) },
      system: sistema,
      messages: [
        {
          role: 'user',
          content: [adjunto, { type: 'text', text: 'Extrae los campos de este comprobante.' }],
        },
      ],
    })
    return { datos: respuesta.parsed_output, uso: respuesta.usage }
  },
}

/** Voyage AI: el proveedor de vectores que Anthropic documenta. REST, sin SDK. */
const voyage = {
  nombre: 'voyage',
  modeloVectores: process.env.VOYAGE_MODELO ?? 'voyage-4',
  clave: 'VOYAGE_API_KEY',
  async vectorizar(textos, tipo) {
    const r = await pedir('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        input: textos,
        model: this.modeloVectores,
        input_type: tipo === 'consulta' ? 'query' : 'document',
      }),
    })
    if (!r.ok) throw new Error(`voyage ${r.status}: ${await r.text()}`)
    const { data } = await r.json()
    return data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
  },
}

/** Gemini API: REST v1beta. Los modelos de vectores nuevos devuelven un solo vector por llamada, asi que va de a uno. */
const gemini = {
  nombre: 'gemini',
  modeloExtraccion: process.env.GEMINI_MODELO ?? 'gemini-2.5-flash',
  modeloVectores: process.env.GEMINI_MODELO_VECTORES ?? 'gemini-embedding-001',
  clave: 'GEMINI_API_KEY',
  async extraer(archivo, sistema) {
    const r = await pedir(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.modeloExtraccion}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistema }] },
          contents: [
            {
              parts: [
                { inlineData: { mimeType: archivo.mime, data: archivo.bytes.toString('base64') } },
                { text: 'Extrae los campos de este comprobante.' },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: ESQUEMA_JSON,
            temperature: 0,
          },
        }),
      },
    )
    if (!r.ok) throw new Error(`gemini ${r.status}: ${await r.text()}`)
    const cuerpo = await r.json()
    return {
      datos: JSON.parse(cuerpo.candidates[0].content.parts[0].text),
      uso: cuerpo.usageMetadata,
    }
  },
  async vectorizar(textos, tipo) {
    const salida = []
    for (const texto of textos) {
      const r = await pedir(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.modeloVectores}:embedContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content: { parts: [{ text: texto }] },
            taskType: tipo === 'consulta' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
          }),
        },
      )
      if (!r.ok) throw new Error(`gemini ${r.status}: ${await r.text()}`)
      salida.push((await r.json()).embedding.values)
    }
    return salida
  },
}

/** Mistral: chat con imagen o documento en linea, y mistral-embed. REST v1. */
const mistral = {
  nombre: 'mistral',
  modeloExtraccion: process.env.MISTRAL_MODELO ?? 'mistral-small-latest',
  modeloVectores: process.env.MISTRAL_MODELO_VECTORES ?? 'mistral-embed',
  clave: 'MISTRAL_API_KEY',
  async extraer(archivo, sistema) {
    const adjunto =
      archivo.mime === 'application/pdf'
        ? { type: 'document_url', document_url: aDataUri(archivo) }
        : { type: 'image_url', image_url: aDataUri(archivo) }
    const r = await pedir('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.modeloExtraccion,
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'extraccion', schema: ESQUEMA_JSON, strict: true },
        },
        messages: [
          { role: 'system', content: sistema },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Extrae los campos de este comprobante.' }, adjunto],
          },
        ],
      }),
    })
    if (!r.ok) throw new Error(`mistral ${r.status}: ${await r.text()}`)
    const cuerpo = await r.json()
    return { datos: JSON.parse(cuerpo.choices[0].message.content), uso: cuerpo.usage }
  },
  async vectorizar(textos) {
    const r = await pedir('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({ model: this.modeloVectores, input: textos }),
    })
    if (!r.ok) throw new Error(`mistral ${r.status}: ${await r.text()}`)
    const { data } = await r.json()
    return data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
  },
}

/**
 * Linea de base sin proveedor: solapamiento de palabras (TF-IDF a mano). Cuesta
 * cero y responde la pregunta previa: ¿los vectores semanticos le ganan a buscar
 * palabras? Si no le ganan, no hay que pagar por ellos.
 */
const lexico = {
  nombre: 'lexico',
  modeloVectores: 'tf-idf',
  clave: null,
  vocabulario: null,
  async vectorizar(textos, tipo) {
    const bolsas = textos.map(tokens)
    if (tipo === 'documento' || !this.vocabulario) {
      const df = new Map()
      for (const b of bolsas) for (const t of new Set(b)) df.set(t, (df.get(t) ?? 0) + 1)
      this.vocabulario = {
        indice: [...df.keys()],
        idf: [...df.values()].map((n) => Math.log((1 + bolsas.length) / (1 + n)) + 1),
      }
    }
    const { indice, idf } = this.vocabulario
    return bolsas.map((b) => {
      const v = new Array(indice.length).fill(0)
      for (const t of b) {
        const i = indice.indexOf(t)
        if (i >= 0) v[i] += idf[i]
      }
      return v
    })
  },
}

const VACIAS = new Set(
  'de la el los las y o a en que se por con un una del al es su sus lo para no si mi me puedo hay qué que cuál cual como cómo quién quien cuándo cuando dónde donde este esta esto ese esa'.split(
    ' ',
  ),
)
export function tokens(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 2 && !VACIAS.has(t))
    .map((t) => t.replace(/(es|s)$/, ''))
}

export const PROVEEDORES = { anthropic, voyage, gemini, mistral, lexico }

export function elegir(nombre, capacidad) {
  const p = PROVEEDORES[nombre]
  if (!p)
    throw new Error(
      `Proveedor desconocido: ${nombre}. Opciones: ${Object.keys(PROVEEDORES).join(', ')}`,
    )
  if (!p[capacidad]) throw new Error(`${nombre} no sabe ${capacidad}.`)
  if (p.clave && !process.env[p.clave]) throw new Error(`Falta ${p.clave} en el entorno (.env).`)
  return p
}
