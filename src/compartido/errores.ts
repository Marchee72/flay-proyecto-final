/**
 * Errores de aplicacion con mensaje para el usuario final: que paso, con que
 * magnitud y que hacer (RNF-10, §14.4). El detalle tecnico va al registro, no a
 * la pantalla, y el codigo de trazabilidad tampoco se muestra.
 */
export class ErrorDeAplicacion extends Error {
  constructor(
    readonly mensajeParaUsuario: string,
    readonly codigo: string,
    readonly detalle?: Record<string, unknown>,
  ) {
    super(`${codigo}: ${mensajeParaUsuario}`)
    this.name = new.target.name
  }
}

/** No hay habilitacion vigente. Nunca se dice si el recurso existe (SC-002). */
export class NoEncontrado extends ErrorDeAplicacion {
  constructor(codigo = 'RN-12') {
    super('No encontramos lo que buscabas.', codigo)
  }
}

/** Hay habilitacion pero el rol no alcanza (SC-002b). */
export class RolInsuficiente extends ErrorDeAplicacion {
  constructor(accion: string) {
    super(`Tu rol no permite ${accion}. Pedíselo al administrador del consorcio.`, 'RNF-03')
  }
}

/** El consorcio está archivado: se consulta, no se opera (RN-22). */
export class ConsorcioArchivado extends ErrorDeAplicacion {
  constructor() {
    super('Este consorcio está archivado: se puede consultar, pero no operar.', 'RN-22')
  }
}

export const textoDe = (error: unknown): string =>
  error instanceof Error
    ? `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? '')}`
    : ''

/** Lo que rechazó el candado de la base (RN-22), como error de aplicación; lo demás pasa igual. */
export function traducirArchivado(error: unknown): unknown {
  return textoDe(error).includes('Este consorcio está archivado') ? new ConsorcioArchivado() : error
}

export class SinConsorcioActivo extends ErrorDeAplicacion {
  constructor() {
    super('No hay un consorcio seleccionado.', 'RN-12')
  }
}
