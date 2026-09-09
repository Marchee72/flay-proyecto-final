/** Version que informa /api/salud. El despliegue la fija para probar SC-007. */
export const VERSION = process.env.FLAY_VERSION ?? process.env.npm_package_version ?? '0.0.0'
