import { ErrorDeAplicacion } from '@/compartido/errores'

/**
 * Tope de unidades por apoderado (art. 23 del reglamento, FR-012). El conteo
 * de las que ya representa lo hace la aplicación dentro de un candado de
 * transacción (research R-12); acá solo se decide.
 */

export class TopeDePoderes extends ErrorDeAplicacion {
  constructor(tope: number) {
    super(
      `Esa persona ya representa ${tope} ${tope === 1 ? 'unidad' : 'unidades'}, el máximo que permite el consorcio para una asamblea.`,
      'RF-30',
      { tope },
    )
  }
}

export function verificarTope(representadasHoy: number, tope: number): void {
  if (representadasHoy >= tope) throw new TopeDePoderes(tope)
}
