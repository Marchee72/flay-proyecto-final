/**
 * Version que informa /api/salud. Tiene que cambiar en cada despliegue: es lo
 * que prueba que el demo se actualizo solo (SC-007 de 001-andamiaje).
 *
 * El orden importa. `--build-env` de la plataforma no llega al proceso que
 * sirve, asi que el despliegue pasa FLAY_VERSION como variable de ejecucion y
 * el identificador de commit queda de respaldo: siempre hay algo que cambia.
 */
const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)

export const VERSION =
  process.env.FLAY_VERSION ?? commit ?? process.env.npm_package_version ?? '0.0.0'
