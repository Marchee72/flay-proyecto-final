/**
 * Frontera de privacidad hacia proveedores externos de IA (RF-27, RNF-13, § 5.3.2, § 7.8).
 *
 * Ningun dato personal identificatorio (PII) de personas fisicas —nombres, correos,
 * telefonos, DNI/CUIL, personaId/usuarioId ni enlaces firmados— puede salir hacia un
 * servicio externo de procesamiento.
 *
 * Este modulo vive en el dominio (sin dependencias de infraestructura ni base) para
 * poder reutilizarse desde el asistente, la redaccion de actas y el triage de reclamos.
 */

export const CLAVES_PII: ReadonlySet<string> = new Set([
  'correo',
  'email',
  'telefono',
  'celular',
  'dni',
  'documento',
  'cuil',
  'apellido',
  'personaId',
  'usuarioId',
  'usuario',
  'solicitante',
  'autor',
  'responsable',
  'responsableId',
  'ocupantes',
  'ocupante',
  'titular',
  'creadoPor',
  'reservadoPor',
])

const RE_CORREO = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const RE_CUIL_PERSONA = /\b(?:20|23|24|27)-\d{7,8}-\d\b/g
const RE_DNI_PUNTOS = /(?<!\$\s?)\b\d{1,2}\.\d{3}\.\d{3}\b(?!,\d)/g
const RE_DNI_ETIQUETADO = /\b((?:DNI|D\.?N\.?I\.?|DU)\s*:?\s*)\d{7,8}\b/gi
const RE_TEL_INTERNACIONAL = /\+54\s*(?:9\s*)?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{4}\b/g
// Los codigos de area argentinos comienzan con 01..03 (nunca 00, lo que preserva numeros de factura 0001-...).
const RE_TEL_AREA = /\b0[1-9]\d{1,2}[\s-]\d{3,4}[\s-]?\d{3,4}\b/g
const RE_TEL_CELULAR_15 = /\b15[\s-]\d{3,4}[\s-]?\d{4}\b/g

/**
 * Redacta patrones estructurados de contacto e identificacion personal dentro de
 * cadenas de texto libre, sin alterar importes, fechas ISO, designaciones de unidad,
 * numeros de factura ni CUIT de personas juridicas (30/33/34).
 */
export function redactarContactoEnTexto(texto: string): string {
  return texto
    .replace(RE_CORREO, '[correo omitido]')
    .replace(RE_CUIL_PERSONA, '[documento omitido]')
    .replace(RE_DNI_PUNTOS, '[documento omitido]')
    .replace(RE_DNI_ETIQUETADO, '$1[documento omitido]')
    .replace(RE_TEL_INTERNACIONAL, '[teléfono omitido]')
    .replace(RE_TEL_AREA, '[teléfono omitido]')
    .replace(RE_TEL_CELULAR_15, '[teléfono omitido]')
}

/**
 * Sanea cualquier estructura antes de enviarla a un proveedor externo de IA:
 * 1. Anula URLs `http(s)://` (credenciales temporales / enlaces firmados).
 * 2. Elimina recursivamente todas las claves declaradas en `CLAVES_PII`.
 * 3. Redacta patrones de contacto/documento en cadenas de texto libre.
 */
export function sanitizarParaModelo<T>(valor: T): T {
  if (typeof valor === 'string') {
    if (/^https?:\/\//i.test(valor)) return null as T
    return redactarContactoEnTexto(valor) as T
  }
  if (Array.isArray(valor)) {
    return valor.map((v) => sanitizarParaModelo(v)) as unknown as T
  }
  if (valor !== null && typeof valor === 'object' && !(valor instanceof Date)) {
    const entradas: [string, unknown][] = []
    for (const [k, v] of Object.entries(valor)) {
      if (CLAVES_PII.has(k)) continue
      entradas.push([k, sanitizarParaModelo(v)])
    }
    return Object.fromEntries(entradas) as unknown as T
  }
  return valor
}
