import { ErrorDeAplicacion } from '@/compartido/errores'
import type { Importe } from '@/compartido/dinero'
import type { Reloj } from '@/dominio/contratos/reloj'

/**
 * Vigencia de un coeficiente (regla RN-02, FR-012).
 *
 * Un coeficiente se cambia **hacia adelante**. Hacia atras reescribiria
 * liquidaciones ya emitidas, y eso no se nota el dia que pasa: se nota meses
 * despues, cuando un consorcista reclama y los numeros no reconstruyen.
 *
 * El dia no se toma del sistema: viene del reloj, para que la regla se pueda
 * probar sin esperar al calendario.
 */

const UN_DIA = 86_400_000

export interface CambioDeCoeficiente {
  coeficiente: Importe
  vigenciaDesde: Date
}

export interface PlanDeCambio {
  /** Ultimo dia del coeficiente que estaba: el anterior al nuevo. */
  cierreDelAnterior: Date
  apertura: CambioDeCoeficiente
}

export class VigenciaRetroactiva extends ErrorDeAplicacion {
  constructor(hoy: Date) {
    super(
      `Un coeficiente sólo puede cambiar hacia adelante: la vigencia no puede ser anterior a ${dia(hoy)}.`,
      'RN-02',
      { desde: dia(hoy) },
    )
  }
}

export function planificarCambioDeCoeficiente(
  reloj: Reloj,
  cambio: CambioDeCoeficiente,
): PlanDeCambio {
  const hoy = reloj.hoy()

  if (cambio.vigenciaDesde < hoy) throw new VigenciaRetroactiva(hoy)

  return {
    cierreDelAnterior: new Date(cambio.vigenciaDesde.getTime() - UN_DIA),
    apertura: cambio,
  }
}

/** `2026-09-09`: la fecha como la escribe el calendario, sin hora ni zona. */
const dia = (fecha: Date) => fecha.toISOString().slice(0, 10)
