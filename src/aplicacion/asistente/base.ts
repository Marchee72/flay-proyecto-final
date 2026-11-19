import type { z } from 'zod'

import { sanitizarParaModelo } from '@/dominio/asistencia/privacidad'
import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { Asistencia } from '@/dominio/contratos/asistencia'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { Rol } from '@/dominio/identidad/rol'

/**
 * Tipos y ayudas compartidas del registro de herramientas (RF-27). Viven aparte
 * para que las herramientas de lectura y escritura no se importen en circulo.
 *
 * Regla de privacidad (RNF-13, § 5.3.2, § 7.8): el modelo nunca recibe datos
 * personales identificatorios (nombres de personas, correos, telefonos, DNI/CUIL,
 * personaId/usuarioId) ni enlaces firmados. Las herramientas con personas aplican
 * proyeccion explicita (Capa 1) y `sanitizarParaModelo` actua como red de
 * contencion estructural en la frontera (Capa 2).
 */

export interface ContextoHerramienta {
  repositorio: RepositorioHabilitaciones
  reloj: Reloj
  almacen: AlmacenObjetos
  asistencia: Asistencia
  usuarioId: string
  /** El consorcio activo o uno resuelto para el admin; ya validado al alcance. */
  consorcioId: string
  roles: readonly Rol[]
}

export interface ResultadoHerramienta {
  /** Lo que ve el modelo: lo mismo que la UI, sin enlaces firmados. */
  paraModelo: unknown
  /** Lo que ve la persona (card/respuesta en pantalla). */
  paraUI: unknown
  /** Citas para la UI (solo `consultar_reglamentos`). */
  citas?: unknown[]
  /** El resultado de la herramienta ya ES la respuesta final; no vuelve al modelo. */
  terminal?: boolean
  /** Texto de la respuesta final cuando `terminal` (lo arma el caso de uso, no el modelo). */
  textoUI?: string
}

export interface Herramienta {
  nombre: string
  descripcion: string
  /** JSON Schema de los parametros, para el proveedor. */
  parametros: Record<string, unknown>
  /** Validacion en servidor de los argumentos del modelo. */
  validar: z.ZodTypeAny
  roles: readonly Rol[] | 'todos'
  escritura: boolean
  /** Lectura: ejecuta el caso de uso. */
  ejecutar?: (args: unknown, ctx: ContextoHerramienta) => Promise<ResultadoHerramienta>
  /** Escritura: texto de la tarjeta, armado desde la base. */
  resumir?: (args: unknown, ctx: ContextoHerramienta) => Promise<string>
  /** Escritura: ejecuta el caso de uso real al confirmar. */
  confirmar?: (args: unknown, ctx: ContextoHerramienta) => Promise<unknown>
  /** No acepta `consorcioId` (cruza consorcios o no depende de uno). */
  sinConsorcio?: boolean
  /** Escritura permitida en modo cartera (todos los consorcios). Sin esto, solo lecturas. */
  cartera?: boolean
}

export class ArgumentoInvalido extends Error {}

export const vacio = { type: 'object', properties: {} as Record<string, unknown> }
export const DIA = 86_400_000

/** Fecha-hora sin designador de zona (`2026-10-22T15:00` o con segundos), que Node tomaria como local del servidor. */
const SIN_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

export const aFecha = (v: unknown): Date => {
  const s = String(v)
  // Sin zona (ni `Z` ni offset) se interpreta como hora de Argentina (UTC-3), no
  // la del servidor. Solo-fecha (`YYYY-MM-DD`) y cadenas con zona quedan intactas.
  const m = SIN_ZONA.exec(s)
  const d = new Date(m ? `${s}${m[1] ? '' : ':00'}-03:00` : s)
  if (Number.isNaN(d.getTime())) throw new ArgumentoInvalido('Fecha inválida.')
  return d
}

export { sanitizarParaModelo }

/** Resultado estandar: la UI ve la salida del caso de uso; el modelo recibe la version saneada (sin PII ni enlaces). */
export const generico = (paraUI: unknown): ResultadoHerramienta => ({
  paraUI,
  paraModelo: sanitizarParaModelo(paraUI),
})
