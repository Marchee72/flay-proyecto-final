import type { Rol } from '@/dominio/identidad/rol'

import type { Herramienta } from '@/aplicacion/asistente/base'
import { escritura } from '@/aplicacion/asistente/escritura'
import { gestion } from '@/aplicacion/asistente/gestion'
import { lectura } from '@/aplicacion/asistente/lectura'

/**
 * Registro de herramientas del asistente (RF-27). Cada una **enruta a un caso de
 * uso existente**: el asistente no toca Prisma ni autoriza (eso lo hace el caso
 * de uso con `conAutorizacion`). El registro solo decide, por rol, que se le
 * ofrece al modelo (UX); aunque el modelo invente una fuera de alcance, el caso
 * de uso responde «no encontrado».
 *
 * - Lectura: `ejecutar` devuelve `{ paraUI, paraModelo }`; el modelo ve lo mismo
 *   que la interfaz le muestra a ese rol, salvo los enlaces firmados.
 * - Escritura: NO se ejecuta al pedirla. `resumir` arma la tarjeta desde la base
 *   y `confirmar` corre el caso de uso real tras el clic.
 */

export type {
  ContextoHerramienta,
  Herramienta,
  ResultadoHerramienta,
} from '@/aplicacion/asistente/base'
export { ArgumentoInvalido } from '@/aplicacion/asistente/base'

export const HERRAMIENTAS: readonly Herramienta[] = [...lectura, ...escritura, ...gestion]

/**
 * Las herramientas que se le ofrecen a un usuario con estos roles (solo UX). En
 * cartera (todos los consorcios) va todo, incluido el aviso a la cartera; las
 * escrituras de un solo consorcio exigen que se nombre cuál (`conversar`). Fuera
 * de cartera, las que se declaran `cartera` no se ofrecen.
 */
export function herramientasPara(roles: readonly Rol[], cartera = false): Herramienta[] {
  return HERRAMIENTAS.filter(
    (h) =>
      (h.roles === 'todos' || roles.some((rol) => h.roles.includes(rol))) &&
      (cartera || !h.cartera),
  )
}

export function herramientaPorNombre(nombre: string): Herramienta | undefined {
  return HERRAMIENTAS.find((h) => h.nombre === nombre)
}

/**
 * Lo que se le declara al modelo: a toda herramienta atada a un consorcio se le
 * suma un `consorcioId` opcional para consultar otro dentro del alcance del
 * usuario (FR-011). `conversar` lo valida contra `misConsorcios`.
 */
export function parametrosParaModelo(h: Herramienta, cartera = false): Record<string, unknown> {
  if (h.sinConsorcio) return h.parametros
  const props = (h.parametros.properties ?? {}) as Record<string, unknown>
  return {
    ...h.parametros,
    properties: {
      ...props,
      consorcioId: {
        type: 'string',
        description: cartera
          ? 'Opcional: el consorcio sobre el que consultar. Si lo omitís, se consulta en TODOS los consorcios del usuario y recibís un resultado por consorcio.'
          : 'Opcional: otro consorcio al que el usuario accede.',
      },
    },
  }
}
