/**
 * La maquina de estados del reclamo, expuesta a la presentacion sin arrastrar
 * la base: los componentes de cliente la importan de aca (§ 12.1.2).
 */
export { ESTADOS_RECLAMO, ETIQUETAS_ESTADO, TRANSICIONES } from '@/dominio/reclamos/estado'
export type { EstadoReclamo } from '@/dominio/reclamos/estado'
