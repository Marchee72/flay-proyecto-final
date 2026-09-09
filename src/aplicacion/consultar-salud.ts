import { VERSION } from '@/compartido/version'
import { ultimaMigracionAplicada } from '@/infraestructura/salud-bd'

export type Salud = { estado: 'ok' | 'degradado'; version: string; migracion: string }

/** Caso de uso de FR-017: estado, version y migracion aplicada. */
export async function consultarSalud(): Promise<Salud> {
  try {
    return { estado: 'ok', version: VERSION, migracion: await ultimaMigracionAplicada() }
  } catch {
    return { estado: 'degradado', version: VERSION, migracion: 'desconocida' }
  }
}
