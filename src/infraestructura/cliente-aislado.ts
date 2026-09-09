import { AsyncLocalStorage } from 'node:async_hooks'

import { Prisma, PrismaClient } from '@prisma/client'

/**
 * Aislamiento por consorcio en un solo punto (Principio I, RN-12, RT-04).
 *
 * Ninguna consulta de negocio usa el cliente crudo de Prisma: la regla de ESLint
 * restringe su importacion fuera de `src/infraestructura`. Aca, y solo aca, se
 * inyecta el filtro por consorcio; olvidarlo en una consulta es imposible porque
 * la consulta nunca decide el filtro.
 */

type ContextoConsorcio = { consorcioId: string }

const contexto = new AsyncLocalStorage<ContextoConsorcio>()

/** Corre `fn` con el consorcio activo. Todo acceso a datos ocurre adentro. */
export function enConsorcio<T>(consorcioId: string, fn: () => Promise<T>): Promise<T> {
  if (!consorcioId) {
    throw new Error('Aislamiento: el consorcio activo no puede ser vacio.')
  }
  return contexto.run({ consorcioId }, fn)
}

export function consorcioActivo(): string | undefined {
  return contexto.getStore()?.consorcioId
}

const CAMPO = 'consorcioId'

/** Modelos alcanzados: los que declaran `consorcioId`. En esta etapa, ninguno. */
const MODELOS_AISLADOS = new Set(
  Prisma.dmmf.datamodel.models
    .filter((modelo) => modelo.fields.some((campo) => campo.name === CAMPO))
    .map((modelo) => modelo.name),
)

const OPERACIONES_CON_DATOS = new Set(['create', 'createMany', 'createManyAndReturn'])

// Prisma exige que el `where` de findUnique use solo campos unicos, asi que el
// filtro no se puede inyectar ahi. Se rechaza en vez de dejarlo pasar sin filtro.
const OPERACIONES_PROHIBIDAS = new Set(['findUnique', 'findUniqueOrThrow'])

function exigirConsorcio(modelo: string, operacion: string): string {
  const activo = consorcioActivo()
  if (!activo) {
    throw new Error(
      `Aislamiento: ${modelo}.${operacion} se invoco sin consorcio activo. ` +
        'Envolver el acceso en enConsorcio(consorcioId, ...).',
    )
  }
  return activo
}

function conFiltro(args: Record<string, unknown>, consorcioId: string): Record<string, unknown> {
  const where = (args.where ?? {}) as Record<string, unknown>
  return { ...args, where: { ...where, [CAMPO]: consorcioId } }
}

function conDatos(args: Record<string, unknown>, consorcioId: string): Record<string, unknown> {
  const data = args.data
  if (Array.isArray(data)) {
    return { ...args, data: data.map((fila) => ({ ...fila, [CAMPO]: consorcioId })) }
  }
  return { ...args, data: { ...((data ?? {}) as object), [CAMPO]: consorcioId } }
}

/**
 * Decision de aislamiento, aislada de Prisma para poder probarla sola (SC-013):
 * devuelve los argumentos con el filtro puesto, o falla.
 */
export function aplicarAislamiento(
  modelo: string,
  operacion: string,
  args: Record<string, unknown>,
  esAislado = MODELOS_AISLADOS.has(modelo),
): Record<string, unknown> {
  if (!esAislado) return args

  if (OPERACIONES_PROHIBIDAS.has(operacion)) {
    throw new Error(
      `Aislamiento: ${modelo}.${operacion} no admite filtro por consorcio. Usar findFirst.`,
    )
  }

  const consorcioId = exigirConsorcio(modelo, operacion)

  if (OPERACIONES_CON_DATOS.has(operacion)) return conDatos(args, consorcioId)
  // findFirst, findMany, update, upsert, delete, count, aggregate: llevan `where`.
  return conFiltro(args, consorcioId)
}

export function crearClienteAislado(base: PrismaClient = new PrismaClient()) {
  return base.$extends({
    name: 'aislamiento-por-consorcio',
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          return query(aplicarAislamiento(model, operation, args))
        },
      },
    },
  })
}

export type ClienteAislado = ReturnType<typeof crearClienteAislado>
