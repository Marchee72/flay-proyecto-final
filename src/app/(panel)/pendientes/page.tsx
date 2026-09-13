import type { Metadata } from 'next'
import { BadgeCheck, Inbox, Send } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { estadoDeLaCola } from '@/aplicacion/comunicacion/despachar'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { accionDespachar } from '../comunicacion/acciones'
import { AvisoDeError, conConsorcio } from '../con-consorcio'
import { EncabezadoDeConsorcio } from '../encabezado-consorcio'

export const metadata: Metadata = { title: 'Avisos pendientes — Flay' }

/**
 * El estado de la cola y el boton «enviar avisos ahora» (`FR-012`). La cola
 * es global —no lleva consorcio—, asi que los numeros son de toda la
 * plataforma; el boton solo lo tiene el administrador.
 */
export default async function PendientesPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string; despachado?: string; error?: string }>
}) {
  const parametros = await searchParams
  const pantalla = await conConsorcio(parametros, '/pendientes', 'Avisos pendientes')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const [roles, cola] = await Promise.all([
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
      estadoDeLaCola(),
    ])
    if (!roles.includes('administrador')) {
      return (
        <AvisoDeError
          error={new ErrorDeAplicacion('Tu rol no permite ver la cola de avisos.', 'RNF-03')}
        />
      )
    }

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref="/consorcios"
          volverTexto="Volver a consorcios"
        />
        <h1>Avisos pendientes</h1>
        <p className="apagado">
          Los correos salen solos con el uso; este botón los empuja ahora, de a lotes de hasta
          veinte segundos. Lo agotado se reintenta desde acá.
        </p>
        {parametros.despachado && (
          <p className="aviso aviso--atencion" role="status">
            <BadgeCheck className="icono" aria-hidden="true" />
            <span>Se despachó lo que había pendiente.</span>
          </p>
        )}
        {parametros.error && (
          <AvisoDeError error={new ErrorDeAplicacion(parametros.error, 'FR-012')} />
        )}

        <div className="kpi">
          <span className="kpi__icono">
            <Inbox className="icono" aria-hidden="true" />
          </span>
          <div>
            <div className="kpi__rotulo">Avisos sin enviar</div>
            <div className="kpi__cifra cifra">{cola.avisosSinEnviar}</div>
            <div className="kpi__detalle">
              {cola.pendientes} trabajos pendientes · {cola.agotados} agotados · {cola.despachados}{' '}
              despachados
            </div>
          </div>
        </div>
        {cola.ultimoError && <p className="ayuda">Último error: {cola.ultimoError}</p>}

        <div className="fila-acciones">
          <form action={accionDespachar}>
            <input type="hidden" name="consorcio" value={activo.id} />
            <button className="boton boton--primario" type="submit">
              <Send className="icono" aria-hidden="true" />
              Enviar avisos ahora
            </button>
          </form>
          {cola.agotados > 0 && (
            <form action={accionDespachar}>
              <input type="hidden" name="consorcio" value={activo.id} />
              <input type="hidden" name="reintentar" value="1" />
              <button className="boton boton--fantasma" type="submit">
                Reintentar los agotados
              </button>
            </form>
          )}
        </div>
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
