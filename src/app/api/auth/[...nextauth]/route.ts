import { handlers } from '@/aplicacion/identidad/sesion'

/** Punto de entrada de Auth.js. Corre en Node: Argon2id es un modulo nativo. */
export const { GET, POST } = handlers
