import { createPartFromBase64, GoogleGenAI, type Schema, Type } from '@google/genai'
import { z } from 'zod'

import {
  type AccionDelAgente,
  type Asistencia,
  type ContextoAgente,
  DIMENSIONES_VECTOR,
  disponible,
  type ExtraccionPropuesta,
  noDisponible,
  type Resultado,
  type Sugerencia,
} from '@/dominio/contratos/asistencia'

/**
 * La implementacion del proveedor elegido en § 14.3 (research R-01): Gemini
 * API por su SDK oficial, en capa paga. Es el **unico** archivo del sistema
 * que lo importa. Salida estructurada por esquema JSON y validada con Zod
 * antes de devolverla: una salida fuera de esquema equivale a indisponibilidad
 * (§ 8.3, PI-04). Un reintento ante 429/503 y despues `disponible: false`,
 * nunca una excepcion (RNF-14).
 */

// `-lite` y no `gemini-3.5-flash`: el grande devuelve 503 por demanda y, cuando
// responde, tarda de 25 s a minutos; el chico resuelve el mismo comprobante en
// ~1,5 s (PI-07, 15-pruebas.md). Se cambia por variable sin tocar codigo.
const MODELO_TEXTO = process.env.GEMINI_MODELO ?? 'gemini-3.5-flash-lite'
const MODELO_AGENTE = process.env.GEMINI_MODELO_AGENTE ?? MODELO_TEXTO
const MODELO_VECTORES = process.env.GEMINI_MODELO_VECTORES ?? 'gemini-embedding-001'
const LOTE_DE_VECTORES = 20

/** La misma negativa que la determinista, para que la respuesta fuera de dominio sea estable. */
const NEGATIVA_AGENTE =
  'Solo puedo ayudarte con cosas de tu consorcio: expensas, reservas, reclamos, novedades y la documentación.'

/** Solo en modo «todos»: le enseña al modelo que omitir `consorcioId` trae todos los consorcios. */
const reglasDeCartera = (c: ContextoAgente): string =>
  c.consorcios && c.consorcios.length > 1
    ? `
- El usuario tiene varios consorcios: ${c.consorcios.map((x) => `${x.nombre} (${x.id})`).join('; ')}.
- Una herramienta de lectura SIN consorcioId consulta todos y devuelve un resultado por consorcio. Para una pregunta "en total", comparativa o de ranking, la llamas UNA sola vez sin consorcioId y haces la suma o la comparacion con lo que vuelve; no llames de a un consorcio. Con consorcioId consultas solo ese.
- Una accion (crear, deshabilitar, cancelar, asignar, etc.) se hace sobre UN consorcio: incluye siempre su consorcioId (el que la persona nombro, por nombre o direccion). Si no dijo cual, preguntaselo; nunca la hagas sobre todos.`
    : ''

const cliente = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

/** Errores de cuota o de carga del proveedor: un reintento con espera y listo. */
async function conReintento<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  for (let intento = 0; ; intento++) {
    try {
      return disponible(await fn())
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error)
      // La pantalla dice «no disponible»; el motivo real queda en el log del servidor.
      console.error(`[asistencia] ${MODELO_TEXTO} intento ${intento + 1}: ${mensaje.slice(0, 500)}`)
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

const ESQUEMA_SUGERENCIAS: Schema = {
  type: Type.OBJECT,
  properties: {
    sugerencias: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          etiqueta: { type: Type.STRING },
          pedido: { type: Type.STRING },
          herramienta: { type: Type.STRING, nullable: true },
        },
        required: ['etiqueta', 'pedido', 'herramienta'],
      },
    },
  },
  required: ['sugerencias'],
}

const SugerenciasZod = z.object({
  sugerencias: z
    .array(
      z.object({
        etiqueta: z.string().min(1).max(60),
        pedido: z.string().min(1).max(200),
        herramienta: z.string().nullable(),
      }),
    )
    .max(3),
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
  agente: {
    async conversar(contexto, historial, herramientas, emitir) {
      const sistema = `Sos el asistente de Flay, un sistema de administracion de consorcios de Argentina. Hoy es ${contexto.hoy}. Hablas con un usuario con rol ${contexto.rolTexto}, en castellano rioplatense, claro y breve.
Reglas, sin excepcion:
- Respondes SOLO sobre los consorcios del usuario: expensas, reservas, reclamos, gastos, novedades y documentacion. Ante cualquier pedido ajeno a eso, respondes exactamente: "${NEGATIVA_AGENTE}". No intentes responderlo.
- Para TODO dato (deudas, reservas, reclamos, etc.) usas las herramientas; nunca inventes cifras, fechas ni nombres, ni los supongas de tu conocimiento.
- Para crear, asignar o publicar algo, llamas a la herramienta correspondiente con sus argumentos: NO afirmes que ya lo hiciste. La confirmacion la da la persona despues.
- Despues de usar una herramienta, contestas en prosa, con el dato concreto, en una o dos frases. Nada de tablas, ni markdown, ni volcar el JSON: la pantalla con el detalle se la ofrece la interfaz aparte con un enlace. Si hay varios items, a lo sumo una lista corta con guiones.
- La persona habla con NOMBRES, nunca con identificadores: no conoce los ids y NUNCA se los pidas. Para una accion que necesita un id (espacio, unidad, reclamo, proveedor, documento, novedad), primero llama a la lectura que los lista (ver_espacios, ver_mis_unidades, ver_unidades_para_reclamar, ver_reclamos, ver_proveedores, ver_documentos, ver_novedades), busca por el nombre que dijo y usa el id que corresponda.
- Preguntas solo lo que la persona puede saber: un dato que no es un id (motivo, fecha, hora) o cual de varios nombres parecidos quiso decir, o cuando el nombre no aparece en la lista.${reglasDeCartera(contexto)}`
      const contents = historial.map((t) =>
        t.rol === 'usuario'
          ? { role: 'user' as const, parts: [{ text: t.texto }] }
          : t.rol === 'asistente'
            ? { role: 'model' as const, parts: [{ text: t.texto }] }
            : {
                role: 'user' as const,
                // El resultado es contexto interno para el modelo, no un mensaje para la persona.
                // La instruccion va pegada al dato (lo ultimo que lee): la regla del system prompt
                // sola no alcanza, con un resultado grande el modelo lo copiaba tal cual.
                parts: [
                  {
                    text: `Resultado de la herramienta ${t.nombre} (datos internos, NO para mostrar):\n${t.resultado}\n\nRespondele a la persona en prosa breve con lo que pidio, o llama a otra herramienta si te falta un dato. NUNCA copies el JSON, los arreglos ni los identificadores en tu respuesta.`,
                  },
                ],
              },
      )
      return conReintento<AccionDelAgente>(async () => {
        const flujo = await cliente().models.generateContentStream({
          model: MODELO_AGENTE,
          contents,
          config: {
            systemInstruction: sistema,
            temperature: 0,
            tools: herramientas.length
              ? [
                  {
                    functionDeclarations: herramientas.map((h) => ({
                      name: h.nombre,
                      description: h.descripcion,
                      parameters: h.parametros as Schema,
                    })),
                  },
                ]
              : undefined,
          },
        })
        let texto = ''
        let llamada: { name?: string; args?: Record<string, unknown> } | undefined
        for await (const trozo of flujo) {
          llamada ??= trozo.functionCalls?.[0]
          // `.text` avisa por consola si el trozo trae una llamada; se lee solo sin ella.
          if (!trozo.functionCalls?.length && trozo.text) {
            texto += trozo.text
            emitir(trozo.text)
          }
        }
        if (llamada?.name) {
          return {
            tipo: 'invocar',
            nombre: llamada.name,
            argumentos: (llamada.args ?? {}) as Record<string, unknown>,
          }
        }
        return { tipo: 'responder', texto }
      })
    },
    async sugerir(contexto, historial, herramientas) {
      const sistema = `Sos el asistente de Flay, un sistema de administracion de consorcios de Argentina. Hoy es ${contexto.hoy}. Hablas con un usuario con rol ${contexto.rolTexto}.
Segun la conversacion, propone hasta tres proximos pasos concretos que la persona pueda pedir, solo con estas herramientas: ${herramientas.map((h) => h.nombre).join(', ') || '(ninguna)'}.
- "etiqueta": lo que se ve en el boton, corta, en castellano rioplatense.
- "pedido": el mensaje que la persona mandaria, en primera persona, con los datos que ya salieron en la conversacion.
- "herramienta": la herramienta que haria falta, de la lista; null si es una pregunta.
- Si falta un dato para actuar, una sugerencia es preguntarlo. Si una accion no esta en la lista, no la propongas.
- Si no hay nada util que proponer, devolve una lista vacia.`
      const conversacion = historial
        .map((t) =>
          t.rol === 'herramienta'
            ? `[datos de ${t.nombre}]\n${t.resultado}`
            : `${t.rol}: ${t.texto}`,
        )
        .join('\n')
      const r = await generarJson(sistema, [conversacion], ESQUEMA_SUGERENCIAS, SugerenciasZod)
      if (!r.disponible) return r
      return disponible(
        r.valor.sugerencias.map(
          (s): Sugerencia => ({
            etiqueta: s.etiqueta,
            pedido: s.pedido,
            ...(s.herramienta ? { herramienta: s.herramienta } : {}),
          }),
        ),
      )
    },
  },
}
