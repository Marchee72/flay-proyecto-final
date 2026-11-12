import { createHash, randomBytes } from 'node:crypto'

/** La credencial viaja en el enlace; en la base queda solo su resumen. */
export const resumen = (credencial: string) => createHash('sha256').update(credencial).digest('hex')

/** Credencial nueva y el resumen que se guarda (invitación y restablecimiento). */
export function nuevaCredencial(): { credencial: string; hash: string } {
  const credencial = randomBytes(32).toString('base64url')
  return { credencial, hash: resumen(credencial) }
}
