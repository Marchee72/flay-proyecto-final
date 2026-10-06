import { createHash } from 'node:crypto'

import {
  type AccionDelAgente,
  type Asistencia,
  DIMENSIONES_VECTOR,
  disponible,
  type HerramientaDisponible,
  type Sugerencia,
  type UrgenciaSugerida,
} from '@/dominio/contratos/asistencia'

/** Lo que la determinista responde ante un pedido ajeno al dominio de Flay (SC-006). */
export const NEGATIVA_FUERA_DE_DOMINIO =
  'Solo puedo ayudarte con cosas de tu consorcio: expensas, reservas, reclamos, novedades y la documentación.'

/** Palabra clave del pedido → herramienta de lectura. El orden importa: gana la primera. */
const RUTEO_LECTURA: [patron: RegExp, herramienta: string][] = [
  [/morosidad|deuda|debo|mora|moroso/, 'ver_morosidad'],
  [/expensa/, 'ver_expensas'],
  [/saldo|estado de cuenta|cuenta/, 'ver_estado_cuenta'],
  [/reglamento|document|acta|contrato/, 'consultar_reglamentos'],
  [/indicador/, 'ver_indicador_morosidad'],
  [/bandeja/, 'ver_bandeja'],
  [/notificaci/, 'ver_mis_notificaciones'],
  [/usuarios/, 'ver_usuarios'],
  [/proveedor/, 'ver_proveedores'],
  [/periodo|período/, 'ver_periodos'],
  [/padron|padrón/, 'ver_padron'],
  [/gasto/, 'ver_gastos'],
  [/novedad/, 'ver_novedades'],
  [/reclamo/, 'ver_reclamos'],
  [/reserva|reservar|espacio|salon|salón|sum|quincho|parrilla/, 'ver_reservas'],
  [/mis unidades|mi unidad|unidad/, 'ver_mis_unidades'],
  [/resumen|edificio|consorcio\b/, 'ver_resumen'],
  [/consorcios|administr/, 'listar_mis_consorcios'],
]

/**
 * Palabra clave de la conversacion → pastillas. Se filtran contra las herramientas
 * ofrecidas, asi un consorcista nunca recibe «deshabilitar».
 */
const RUTEO_SUGERENCIAS: [patron: RegExp, sugerencias: Sugerencia[]][] = [
  [
    /rompi|roto|rota|perdida|filtra|terraza|ascensor/,
    [
      {
        etiqueta: 'Levantar un reclamo',
        pedido: 'crear_reclamo titulo="Algo roto" descripcion="Se rompió algo y hay que revisarlo"',
        herramienta: 'crear_reclamo',
      },
      {
        etiqueta: 'Deshabilitar el espacio',
        pedido: 'deshabilitar_espacio',
        herramienta: 'deshabilitar_espacio',
      },
      { etiqueta: 'Ver los espacios', pedido: 'ver_espacios', herramienta: 'ver_espacios' },
    ],
  ],
  [
    /reserva|espacio|salon|salón|sum|quincho/,
    [{ etiqueta: 'Ver los espacios', pedido: 'ver_espacios', herramienta: 'ver_espacios' }],
  ],
]

/** Pares `clave=valor` o `clave="valor con espacios"` del texto → argumentos. */
function argumentosDe(texto: string): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  const re = /(\w+)=("([^"]*)"|(\S+))/g
  for (let m = re.exec(texto); m; m = re.exec(texto)) args[m[1]] = m[3] ?? m[4]
  return args
}

/**
 * Agente determinista: predecible, no inteligente. Rutea por palabra clave a una
 * herramienta de lectura; para escrituras, el texto nombra la herramienta y sus
 * argumentos como `herramienta clave=valor ...` (así las pruebas controlan los
 * argumentos sin un modelo). Si el ultimo turno es resultado de herramienta,
 * responde con ese resultado y corta el bucle.
 */
function decidir(
  historial: { rol: string; texto?: string; nombre?: string; resultado?: string }[],
  herramientas: HerramientaDisponible[],
): AccionDelAgente {
  const ultimo = historial[historial.length - 1]
  if (!ultimo) return { tipo: 'responder', texto: NEGATIVA_FUERA_DE_DOMINIO }
  if (ultimo.rol === 'herramienta') {
    return { tipo: 'responder', texto: ultimo.resultado ?? '' }
  }
  const texto = (ultimo.texto ?? '').toLowerCase()
  const ofrecidas = new Set(herramientas.map((h) => h.nombre))

  // Escritura (o lectura) nombrada explicitamente: `nombre_herramienta clave=valor`.
  const nombrada = texto.match(/^\s*([a-z_]+)\b/)?.[1]
  if (nombrada && ofrecidas.has(nombrada)) {
    return { tipo: 'invocar', nombre: nombrada, argumentos: argumentosDe(ultimo.texto ?? '') }
  }

  for (const [patron, herramienta] of RUTEO_LECTURA) {
    if (patron.test(texto) && ofrecidas.has(herramienta)) {
      return { tipo: 'invocar', nombre: herramienta, argumentos: argumentosDe(ultimo.texto ?? '') }
    }
  }
  return { tipo: 'responder', texto: NEGATIVA_FUERA_DE_DOMINIO }
}

/**
 * La implementacion determinista: la que corren las pruebas (RNF-15, research
 * R-02, `contracts/asistencia.md`). No es buena: es **predecible**. Misma
 * entrada, misma salida, sin red. Lee el texto de un PDF o de un archivo de
 * texto plano; una imagen no la lee, y lo dice como el proveedor real diria
 * que no pudo.
 */

const URGENTES = ['agua', 'gas', 'electric', 'ascensor', 'seguridad', 'incendio', 'inund']

/** Palabras que no dicen nada del tema: no cuentan como coincidencia. */
const VACIAS = new Set(
  'que qué cual cuál como cómo donde dónde cuando cuándo quien quién cuanto cuánto cuanta cuánta con para por sin sobre entre desde hasta del los las una uno unos unas ese esa eso este esta esto aquel hay son ser estar tiene tener puede pueden pued debe deben deb mas más muy solo sólo cada todo toda todos todas otro otra nada algo ante bajo tras'.split(
    ' ',
  ),
)

/** Palabras del texto, normalizadas, sin las vacias ni las muy cortas. */
export function tokens(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 2 && !VACIAS.has(t))
    .map((t) => t.replace(/(es|s)$/, ''))
    .filter((t) => !VACIAS.has(t))
}

async function textoDe(bytes: Uint8Array, tipoContenido: string): Promise<string | null> {
  if (tipoContenido === 'application/pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  }
  if (tipoContenido.startsWith('text/')) return new TextDecoder().decode(bytes)
  return null
}

function rubroPorPalabras(
  texto: string,
  rubros: { codigo: string; nombre: string }[],
): string | null {
  const palabras = new Set(tokens(texto))
  let mejor: { codigo: string; coincidencias: number } | null = null
  for (const rubro of rubros) {
    const coincidencias = tokens(rubro.nombre).filter((t) => palabras.has(t)).length
    if (coincidencias > 0 && (!mejor || coincidencias > mejor.coincidencias)) {
      mejor = { codigo: rubro.codigo, coincidencias }
    }
  }
  return mejor?.codigo ?? null
}

export const asistenciaDeterminista: Asistencia = {
  extractor: {
    async extraer(documento, contexto) {
      const texto = await textoDe(documento.bytes, documento.tipoContenido)
      if (texto === null) {
        return { disponible: false, motivo: 'La implementación de pruebas no lee imágenes.' }
      }
      const cuit = texto.match(/\b(\d{2}-\d{8}-\d)\b/)?.[1] ?? null
      const fecha = texto.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/)
      const total = texto.match(/total[^\d$]*\$?\s*([\d.]+,\d{2})/i)?.[1] ?? null
      const proveedor =
        texto
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.length > 3) ?? null
      const importe = total ? total.replace(/\./g, '').replace(',', '.') : null
      const rubroCodigo = rubroPorPalabras(texto, contexto.rubros)
      const hallados = [proveedor, cuit, fecha, importe, rubroCodigo].filter(Boolean).length
      const confianza = (hallados / 5).toFixed(3)
      const porCampo = (v: unknown) => (v ? '1.000' : '0.000')
      return disponible({
        proveedor,
        cuit,
        fecha: fecha ? `${fecha[3]}-${fecha[2]}-${fecha[1]}` : null,
        importe,
        rubroCodigo,
        confianza,
        confianzaPorCampo: {
          proveedor: porCampo(proveedor),
          cuit: porCampo(cuit),
          fecha: porCampo(fecha),
          importe: porCampo(importe),
          rubro: porCampo(rubroCodigo),
        },
      })
    },
  },

  clasificador: {
    async clasificar(texto, contexto) {
      const todo = `${texto.titulo} ${texto.descripcion}`.toLowerCase()
      const urgencia: UrgenciaSugerida = URGENTES.some((u) => todo.includes(u))
        ? 'critica'
        : 'media'
      const rubroCodigo = rubroPorPalabras(todo, contexto.rubros)
      const rubroNombre = contexto.rubros.find((r) => r.codigo === rubroCodigo)?.nombre
      const proveedor = rubroNombre
        ? (contexto.proveedores.find((p) => p.rubros.includes(rubroNombre)) ?? null)
        : null
      return disponible({
        rubroCodigo,
        urgencia,
        proveedorId: proveedor?.id ?? null,
        horasEstimadas: urgencia === 'critica' ? 24 : 120,
        confianza: rubroCodigo ? '0.800' : '0.400',
      })
    },
  },

  vectores: {
    dimensiones: DIMENSIONES_VECTOR,
    pisoDeSimilitud: 0.1,
    // Bolsa de palabras proyectada por hash: cada token suma en una posicion
    // fija del vector. Sin semantica, pero con solapamiento de palabras, y
    // siempre el mismo vector para el mismo texto.
    async vectorizar(textos) {
      return disponible(
        textos.map((texto) => {
          const vector = new Array<number>(DIMENSIONES_VECTOR).fill(0)
          for (const token of tokens(texto)) {
            const hash = createHash('sha1').update(token).digest()
            vector[hash.readUInt16BE(0) % DIMENSIONES_VECTOR] += 1
          }
          const norma = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1
          return vector.map((v) => v / norma)
        }),
      )
    },
  },

  respuestas: {
    // Cita el fragmento que comparte mas palabras **con sentido** (cuatro letras
    // o mas, fuera de las vacias) con la pregunta, si comparte al menos dos; si
    // no, no hay respaldo. Nunca inventa (Principio IV).
    async responder(pregunta, fragmentos) {
      const palabras = new Set(tokens(pregunta).filter((t) => t.length >= 4))
      let mejor: { numero: number; contenido: string; comunes: number } | null = null
      for (const f of fragmentos) {
        const comunes = new Set(tokens(f.contenido).filter((t) => palabras.has(t))).size
        if (comunes >= 2 && (!mejor || comunes > mejor.comunes)) {
          mejor = { numero: f.numero, contenido: f.contenido, comunes }
        }
      }
      if (!mejor) return disponible({ respuesta: '', citas: [], sinRespaldo: true })
      return disponible({
        respuesta: `Según la documentación: ${mejor.contenido}`,
        citas: [mejor.numero],
        sinRespaldo: false,
      })
    },
  },

  agente: {
    async conversar(_contexto, historial, herramientas, emitir) {
      const accion = decidir(historial, herramientas)
      if (accion.tipo === 'responder') {
        // Tres trozos: lo bastante para que las pruebas vean que llega en partes.
        const t = accion.texto
        const paso = Math.max(1, Math.ceil(t.length / 3))
        for (let i = 0; i < t.length; i += paso) emitir(t.slice(i, i + paso))
      }
      return disponible(accion)
    },
    async sugerir(_contexto, historial, herramientas) {
      const texto = historial
        .map((t) => ('texto' in t ? t.texto : ''))
        .join(' ')
        .toLowerCase()
      const ofrecidas = new Set(herramientas.map((h) => h.nombre))
      const hallada = RUTEO_SUGERENCIAS.find(([patron]) => patron.test(texto))?.[1] ?? []
      return disponible(hallada.filter((s) => !s.herramienta || ofrecidas.has(s.herramienta)))
    },
  },
}
