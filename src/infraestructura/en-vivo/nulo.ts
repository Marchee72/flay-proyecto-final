import type { AvisoEnVivo } from '@/dominio/contratos/aviso-en-vivo'

/** Sin `ABLY_API_KEY`: no se publica y la sala sigue con el sondeo de `EnVivo`. */
export const avisoNulo: AvisoEnVivo = {
  async publicar() {},
  async permisoDeEscucha() {
    return null
  },
}
