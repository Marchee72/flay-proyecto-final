import type { Metadata } from 'next'
import { CalendarClock } from 'lucide-react'

import {
  escalonadoDesdeTramos,
  verReglaVencimientos,
} from '@/aplicacion/consorcios/regla-vencimientos'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { AvisoDeError, conConsorcio } from '../../../con-consorcio'
import { FormularioVencimientos } from './formulario'

export const metadata: Metadata = { title: 'Vencimientos — Flay' }

/**
 * Regla de vencimientos escalonados del consorcio (`RF-08`). La configura el
 * administrador; `verReglaVencimientos` ya exige el rol, así que un consorcista
 * que entre por la dirección recibe el aviso de error, no la pantalla.
 */
export default async function VencimientosPage({
  params,
}: {
  params: Promise<{ consorcio: string }>
}) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Vencimientos')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const regla = await verReglaVencimientos(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })
    const { escalones, diaFirme } = escalonadoDesdeTramos(regla.tramos)

    return (
      <>
        <h1>Vencimientos escalonados</h1>
        <p className="apagado">
          Hasta dos vencimientos con recargo por expensa y una fecha de vencimiento en firme. Pagar
          antes cuesta menos; pasada la última fecha, la expensa vence y arrastra con mora.
        </p>

        {regla.porOmision && (
          <p className="aviso aviso--atencion" role="status">
            <CalendarClock className="icono" aria-hidden="true" />
            <span>
              Todavía no configuraste la regla: hoy la expensa vence una sola vez, el día {diaFirme}
              , sin recargo.
            </span>
          </p>
        )}

        <div className="tarjeta">
          <FormularioVencimientos
            consorcioId={activo.id}
            escalones={escalones}
            diaFirme={diaFirme}
            tasaMoraMensual={regla.tasaMoraMensual}
          />
        </div>
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
