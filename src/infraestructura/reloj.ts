import type { Reloj } from '@/dominio/contratos/reloj'

export const relojDelSistema: Reloj = {
  ahora: () => new Date(),
  hoy: () => {
    const ahora = new Date()
    return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()))
  },
}
