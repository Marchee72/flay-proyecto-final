/**
 * Validador de campo del horario de uso, para la pantalla.
 *
 * Reexporta el dominio —que es puro— desde un modulo sin infraestructura: el
 * formulario es un componente de cliente y no puede importar `espacios.ts`,
 * que arrastra Prisma.
 */
export {
  errorDeHorario,
  horaDesdeMinutos,
  horarioParaMostrar,
  minutosDesdeHora,
} from '@/dominio/reservas/horario'
