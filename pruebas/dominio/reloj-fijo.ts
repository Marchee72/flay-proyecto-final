import type { Reloj } from '@/dominio/contratos/reloj'

/** Reloj de prueba: la vigencia se verifica sin esperar al calendario. */
export function relojFijo(fecha: string): Reloj {
  const instante = new Date(fecha)
  return {
    ahora: () => new Date(instante),
    hoy: () =>
      new Date(Date.UTC(instante.getUTCFullYear(), instante.getUTCMonth(), instante.getUTCDate())),
  }
}
