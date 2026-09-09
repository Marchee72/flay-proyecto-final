/**
 * Roles del punto 12 (FR-007). La nomina nominada de deudores se reserva a los
 * dos primeros (regla RN-13 § 7.2); esta etapa aun no la produce.
 */
export const ROLES = ['administrador', 'consejo', 'consorcista'] as const

export type Rol = (typeof ROLES)[number]

/** Quien puede escribir datos economicos y de configuracion. */
export const ROLES_DE_CARGA: readonly Rol[] = ['administrador']

/** Quien puede ver la nomina nominada de deudores (regla RN-13). */
export const ROLES_NOMINA: readonly Rol[] = ['administrador', 'consejo']
