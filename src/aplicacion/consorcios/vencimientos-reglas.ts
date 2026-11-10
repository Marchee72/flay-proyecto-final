/**
 * Validadores de campo de la regla de vencimientos, para la pantalla.
 *
 * Reexporta el dominio —que es puro— desde un modulo sin infraestructura: el
 * formulario es un componente de cliente y no puede importar
 * `regla-vencimientos.ts`, que arrastra Prisma.
 */
export { errorDeDia, errorDeRecargo, errorDeTasaMora } from '@/dominio/liquidacion/vencimientos'
