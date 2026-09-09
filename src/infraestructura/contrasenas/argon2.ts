import { hash, verify } from '@node-rs/argon2'

import type { DerivadorDeContrasenas } from '@/dominio/contratos/derivador-contrasenas'

/**
 * Argon2id con los parametros recomendados por OWASP: 19 MiB de memoria, dos
 * iteraciones y paralelismo 1 (RNF-04). Aca es donde se ajustan si el inicio de
 * sesion se va por encima del presupuesto de tiempo de la plataforma; el
 * dominio no se entera.
 */
const PARAMETROS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const

export const argon2id: DerivadorDeContrasenas = {
  derivar: (contrasenaEnClaro) => hash(contrasenaEnClaro, PARAMETROS),
  verificar: async (contrasenaEnClaro, claveDerivada) => {
    try {
      return await verify(claveDerivada, contrasenaEnClaro, PARAMETROS)
    } catch {
      // Una clave derivada corrupta no es una excepcion del negocio: es un no.
      return false
    }
  },
}
