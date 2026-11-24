/**
 * Validadores de campo de alquileres, para la pantalla (nota 28).
 *
 * Reexporta el dominio —que es puro— desde un modulo sin infraestructura: los
 * modales son componentes de cliente y no pueden importar `inquilinos.ts`, que
 * arrastra Prisma.
 */
export { errorDeFinDeAlquiler } from '@/dominio/ocupaciones/vigencia'
