import { Prisma } from '@prisma/client'

import { ErrorDeAplicacion } from '@/compartido/errores'

/**
 * Errores de las asambleas (016, `contracts/contratos.md`). Mensajes para el
 * usuario final (RNF-10); el código de trazabilidad no se muestra.
 */

class ErrorDeAsamblea extends ErrorDeAplicacion {
  constructor(mensaje: string, codigo = 'RF-31', detalle?: Record<string, unknown>) {
    super(mensaje, codigo, detalle)
  }
}

export class AsambleaInvalida extends ErrorDeAsamblea {
  constructor(mensaje: string) {
    super(mensaje, 'RF-29')
  }
}

export class AnticipacionInsuficiente extends ErrorDeAsamblea {
  constructor(dias: number, fechaMinima: string) {
    super(
      `La convocatoria tiene que salir con al menos ${dias} días de anticipación: la fecha más temprana posible es el ${fechaMinima}.`,
      'RF-29',
      { dias, fechaMinima },
    )
  }
}

export class NoPuedeDirigir extends ErrorDeAsamblea {
  constructor() {
    super(
      'Solo un miembro del consejo, o la administración si está invitada, puede dirigir esta asamblea.',
    )
  }
}

export class NoDirige extends ErrorDeAsamblea {
  constructor() {
    super('Esa acción la hace quien dirige la asamblea. Si te toca, tomá la dirección primero.')
  }
}

export class AntesDeHora extends ErrorDeAsamblea {
  constructor(hora: string) {
    super(`La asamblea se abre a partir de la hora de la primera convocatoria (${hora}).`)
  }
}

export class SinQuorum extends ErrorDeAsamblea {
  constructor(porcentaje: string, segunda: string) {
    super(
      `Hay ${porcentaje} % de los coeficientes presentes: no alcanza el quórum de primera convocatoria. A partir de las ${segunda} se puede constituir en segunda, con los presentes.`,
    )
  }
}

export class NoConstituida extends ErrorDeAsamblea {
  constructor() {
    super('La asamblea todavía no está constituida: primero hay que verificar el quórum.')
  }
}

export class OtroPuntoAbierto extends ErrorDeAsamblea {
  constructor() {
    super('Ya hay un punto en votación. Cerralo antes de abrir otro.')
  }
}

export class PuntosSinCerrar extends ErrorDeAsamblea {
  constructor(cantidad: number) {
    super(
      `Quedan ${cantidad} ${cantidad === 1 ? 'punto' : 'puntos'} del orden del día sin tratar. Cerralos antes de finalizar.`,
    )
  }
}

export class UnidadYaAcreditada extends ErrorDeAsamblea {
  constructor() {
    super('Esa unidad ya está acreditada.')
  }
}

export class NoPresente extends ErrorDeAsamblea {
  constructor() {
    super('Esa persona no está acreditada como presente.')
  }
}

export class AutoridadSinUsuario extends ErrorDeAsamblea {
  constructor() {
    super(
      'Presidente y secretario tienen que tener usuario en Flay, porque firman el acta. Elegí a un presente con cuenta.',
    )
  }
}

export class UnidadYaVoto extends ErrorDeAsamblea {
  constructor() {
    super('Esa unidad ya votó este punto. Un voto emitido no se modifica.')
  }
}

export class NoRepresenta extends ErrorDeAsamblea {
  constructor() {
    super('No representás a esa unidad en esta asamblea.')
  }
}

export class NoEsPropietario extends ErrorDeAsamblea {
  constructor() {
    super('Solo el propietario vigente de la unidad puede otorgar un poder sobre ella.', 'RF-30')
  }
}

export class ApoderadoNoHabilitado extends ErrorDeAsamblea {
  constructor() {
    super('El apoderado tiene que ser un usuario habilitado en este consorcio.', 'RF-30')
  }
}

export class UnidadYaTienePoder extends ErrorDeAsamblea {
  constructor() {
    super(
      'Esa unidad ya tiene un poder vigente para esta asamblea. Revocalo antes de otorgar otro.',
      'RF-30',
    )
  }
}

export class AsambleaYaAbierta extends ErrorDeAsamblea {
  constructor() {
    super('La asamblea ya se abrió: los poderes ya no se revocan.', 'RF-30')
  }
}

export class FueraDePlazo extends ErrorDeAsamblea {
  constructor() {
    super('El plazo para oponerse a esa decisión ya venció.', 'RF-33')
  }
}

export class NoEraAusente extends ErrorDeAsamblea {
  constructor() {
    super(
      'Solo puede oponerse el propietario de una unidad que estuvo ausente y tenía voto.',
      'RF-33',
    )
  }
}

export class ActaNoEnRedaccion extends ErrorDeAsamblea {
  constructor() {
    super('El acta ya se envió a firmar: su texto no cambia.', 'RF-32')
  }
}

export class ActaIncompleta extends ErrorDeAsamblea {
  constructor(mensaje: string) {
    super(mensaje, 'RF-32')
  }
}

export class FirmanteInvalido extends ErrorDeAsamblea {
  constructor(mensaje: string) {
    super(mensaje, 'RF-32')
  }
}

export class FirmanteYaFirmo extends ErrorDeAsamblea {
  constructor() {
    super('Ese firmante ya firmó: su firma no se reemplaza.', 'RF-32')
  }
}

export class ContrasenaIncorrecta extends ErrorDeAsamblea {
  constructor() {
    super('La contraseña no es correcta. Para firmar tenés que confirmarla.', 'RF-32')
  }
}

export class YaFirmo extends ErrorDeAsamblea {
  constructor() {
    super('Ya firmaste esta acta.', 'RF-32')
  }
}

export class ConfiguracionInvalida extends ErrorDeAsamblea {
  constructor(mensaje: string) {
    super(mensaje, 'RF-29')
  }
}

/** Lo que dijo un disparador: el texto después de «FLAY:». */
export class ReglaDeAsamblea extends ErrorDeAsamblea {
  constructor(mensaje: string) {
    super(mensaje)
  }
}

const textoDe = (error: unknown): string =>
  error instanceof Error
    ? `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? '')}`
    : ''

/**
 * Traduce lo que rechazó la base al error de aplicación (research R-02): una
 * clave única violada (`23505` / `P2002`) a `duplicado`, y un `RAISE` de los
 * disparadores (`FLAY: …`) a `ReglaDeAsamblea` con su mensaje.
 */
export function traducirErrorDeBase(error: unknown, duplicado?: () => ErrorDeAplicacion): unknown {
  if (error instanceof ErrorDeAplicacion) return error
  const texto = textoDe(error)
  const regla = /FLAY: ([^"\\]+?)(?:\\n|"|$)/.exec(texto)
  if (regla) return new ReglaDeAsamblea(regla[1].trim())
  const esUnico =
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') ||
    /23505|Unique constraint/.test(texto)
  if (esUnico && duplicado) return duplicado()
  return error
}

/** Corre `trabajo` y traduce lo que la base rechace. */
export async function conReglas<T>(
  trabajo: () => Promise<T>,
  duplicado?: () => ErrorDeAplicacion,
): Promise<T> {
  try {
    return await trabajo()
  } catch (error) {
    throw traducirErrorDeBase(error, duplicado)
  }
}
