import type { z } from 'zod'

import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { Asistencia } from '@/dominio/contratos/asistencia'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { Rol } from '@/dominio/identidad/rol'

/**
 * Tipos y ayudas compartidas del registro de herramientas (RF-27). Viven aparte
 * para que las herramientas de lectura y escritura no se importen en circulo.
 *
 * Regla de datos: el modelo ve lo mismo que la interfaz le muestra a ese rol —el
 * caso de uso ya recorto por rol, ocupacion y consorcio—, **salvo los enlaces
 * firmados**, que son credenciales temporales y no salen hacia el proveedor.
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

export const aFecha = (v: unknown): Date => {
  const d = new Date(String(v))
  if (Number.isNaN(d.getTime())) throw new ArgumentoInvalido('Fecha inválida.')
  return d
}

/**
 * Copia sin los enlaces firmados: cualquier cadena `http(s)://`. Se filtra por
 * valor y no por clave porque `direccion` tambien es la calle del consorcio.
 */
export function sinEnlaces<T>(valor: T): T {
  if (typeof valor === 'string') return (/^https?:\/\//i.test(valor) ? null : valor) as T
  if (Array.isArray(valor)) return valor.map((v) => sinEnlaces(v)) as unknown as T
  if (valor !== null && typeof valor === 'object' && !(valor instanceof Date)) {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [k, sinEnlaces(v)]),
    ) as unknown as T
  }
  return valor
}

/** Resultado estandar: la UI y el modelo ven lo mismo, salvo los enlaces. */
export const generico = (paraUI: unknown): ResultadoHerramienta => ({
  paraUI,
  paraModelo: sinEnlaces(paraUI),
})
