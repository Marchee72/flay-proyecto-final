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

/**
 * Los roles de plataforma y de empresa **no viven en este enum**: no son roles
 * *sobre un consorcio*, sino por encima (FR-007). Los llevan
 * `HabilitacionPlataforma` y `HabilitacionAdministradora`, y su existencia
 * vigente es el rol. Ponerlos aca obligaria a que `Habilitacion.consorcio_id`
 * admitiera nulo, que es justo el agujero que el Principio I no puede tener.
 *
 * `consejo` **se suma** a `consorcista` en vez de reemplazarlo: la clave unica
 * es (usuario, consorcio, rol), asi que una persona puede tener las dos
 * habilitaciones, cada una con su vigencia.
 */
