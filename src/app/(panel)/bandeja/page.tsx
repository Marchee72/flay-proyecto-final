import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BadgeCheck, Inbox, Send } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { fechaParaMostrar } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { verBandeja } from '@/aplicacion/pendientes/bandeja'

import { accionDespachar } from '../comunicacion/acciones'
import { AvisoDeError } from '../con-consorcio'

export const metadata: Metadata = { title: 'Bandeja — Flay' }

/**
 * Lo pendiente de todos los consorcios que se administran (diseno 2026-09-13
 * § 4.3): reclamos sin resolver y periodos sin liquidar por consorcio, y la
 * cola de avisos con el boton «enviar ahora» (`FR-012`). Sin lateral: no hay
 * un consorcio, hay todos.
 */
export default async function BandejaPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string; despachado?: string; error?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  const parametros = await searchParams

  const bandeja = await verBandeja(HABILITACIONES, RELOJ, { usuarioId })
  const visibles = parametros.consorcio
    ? bandeja.consorcios.filter((c) => c.id === parametros.consorcio)
    : bandeja.consorcios
  const hayAlgo = visibles.some((c) => c.reclamos.length > 0 || c.periodosAbiertos.length > 0)

  return (
    <main className="suelto">
      <h1>Bandeja</h1>
      <p className="apagado">
        Lo que espera una decisión, en todos los consorcios que administrás.
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

      {bandeja.consorcios.length > 1 && (
        <form method="get" className="fila-de-filtros">
          <div className="campo">
            <label htmlFor="consorcio">Consorcio</label>
            <select id="consorcio" name="consorcio" defaultValue={parametros.consorcio ?? ''}>
              <option value="">Todos</option>
              {bandeja.consorcios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <button className="boton boton--fantasma" type="submit">
            Filtrar
          </button>
        </form>
      )}

      {!hayAlgo && (
        <div className="vacio">
          <Inbox aria-hidden="true" />
          <p>
            {bandeja.consorcios.length === 0
              ? 'La bandeja es del que administra; con tu rol no hay nada que decidir acá.'
              : 'Nada pendiente. Todo lo que había, ya se atendió.'}
          </p>
        </div>
      )}

      {visibles
        .filter((c) => c.reclamos.length > 0 || c.periodosAbiertos.length > 0)
        .map((c) => (
          <section key={c.id} className="tarjeta">
            <h2>
              <Link href={`/consorcios/${c.id}`}>{c.nombre}</Link>
            </h2>
            {c.periodosAbiertos.length > 0 && (
              <p>
                Sin liquidar: {c.periodosAbiertos.join(', ')} ·{' '}
                <Link href={`/consorcios/${c.id}/periodos`}>Períodos</Link>
              </p>
            )}
            {c.reclamos.length > 0 && (
              <ul className="lista-simple">
                {c.reclamos.map((r) => (
                  <li key={r.id}>
                    <span
                      className={`etiqueta etiqueta--${r.urgencia === 'critica' ? 'vencido' : 'pendiente'}`}
                    >
                      {r.urgencia}
                    </span>{' '}
                    <Link href={`/consorcios/${c.id}/reclamos/${r.id}`}>{r.titulo}</Link>{' '}
                    <span className="apagado">desde {fechaParaMostrar(r.fechaApertura)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

      {bandeja.cola && (
        <>
          <h2>Avisos por correo</h2>
          <p className="apagado">
            Los correos salen solos con el uso; este botón los empuja ahora, de a lotes de hasta
            veinte segundos. Lo agotado se reintenta desde acá.
          </p>
          <div className="kpi">
            <span className="kpi__icono">
              <Send className="icono" aria-hidden="true" />
            </span>
            <div>
              <div className="kpi__rotulo">Avisos sin enviar</div>
              <div className="kpi__cifra cifra">{bandeja.cola.avisosSinEnviar}</div>
              <div className="kpi__detalle">
                {bandeja.cola.pendientes} trabajos pendientes · {bandeja.cola.agotados} agotados ·{' '}
                {bandeja.cola.despachados} despachados
              </div>
            </div>
          </div>
          {bandeja.cola.ultimoError && (
            <p className="ayuda">Último error: {bandeja.cola.ultimoError}</p>
          )}
          <div className="fila-acciones">
            <form action={accionDespachar}>
              <input type="hidden" name="consorcio" value={bandeja.consorcios[0].id} />
              <button className="boton boton--primario" type="submit">
                <Send className="icono" aria-hidden="true" />
                Enviar avisos ahora
              </button>
            </form>
            {bandeja.cola.agotados > 0 && (
              <form action={accionDespachar}>
                <input type="hidden" name="consorcio" value={bandeja.consorcios[0].id} />
                <input type="hidden" name="reintentar" value="1" />
                <button className="boton boton--fantasma" type="submit">
                  Reintentar los agotados
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </main>
  )
}
