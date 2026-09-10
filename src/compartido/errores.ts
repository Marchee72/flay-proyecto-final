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

export class SinConsorcioActivo extends ErrorDeAplicacion {
  constructor() {
    super('No hay un consorcio seleccionado.', 'RN-12')
  }
}
