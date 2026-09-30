import type { Metadata } from 'next'
import Link from 'next/link'
import { History } from 'lucide-react'

import { momentoParaMostrar } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarEspacios, suspensionesEnRango } from '@/aplicacion/reservas/espacios'
import {
  historialDeReservas,
  unidadesParaReservar,
  type ReservaDelHistorial,
} from '@/aplicacion/reservas/reservar'

import { AvisoDeError, conConsorcio } from '../../../../con-consorcio'
import { Filtros } from '../../../../filtros'
import { TablaDesplazable } from '../../../../tabla-desplazable'
import { CalendarioUso } from './calendario-uso'
import { construirCalendario } from './calendario'

export const metadata: Metadata = { title: 'Historial de reservas — Flay' }

const ESTADO: Record<string, { texto: string; clase: string }> = {
  cumplida: { texto: 'Cumplida', clase: 'etiqueta--pendiente' },
  confirmada: { texto: 'Confirmada', clase: 'etiqueta--rendido' },
  pendiente: { texto: 'Pendiente', clase: 'etiqueta--pendiente' },
  cancelada: { texto: 'Cancelada', clase: 'etiqueta--vencido' },
  rechazada: { texto: 'Rechazada', clase: 'etiqueta--vencido' },
}

const estadoDe = (r: ReservaDelHistorial) => ESTADO[r.cumplida ? 'cumplida' : r.estado]

/**
 * Historial de uso de los espacios comunes, un mes por vez (`RF-16`). Solo el
 * administrador: es el unico que ve quien reservo, no solo la unidad.
 */
export default async function HistorialDeReservasPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string }>
  searchParams: Promise<{ mes?: string; espacio?: string; unidad?: string }>
}) {
  const parametros = await searchParams
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Reservas')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  const mes = /^\d{4}-\d{2}$/.test(parametros.mes ?? '')
    ? parametros.mes!
    : RELOJ.hoy().toISOString().slice(0, 7)
  const [anio, numero] = mes.split('-').map(Number)
  // Los bordes del mes en la hora del consorcio (Argentina, sin horario de verano).
  const desde = new Date(`${mes}-01T00:00:00-03:00`)
  const siguiente =
    numero === 12 ? `${anio + 1}-01` : `${anio}-${String(numero + 1).padStart(2, '0')}`
  const hasta = new Date(`${siguiente}-01T00:00:00-03:00`)

  try {
    const [espacios, unidades, reservas, tramos] = await Promise.all([
      listarEspacios(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      unidadesParaReservar(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      historialDeReservas(HABILITACIONES, RELOJ, {
        usuarioId,
        consorcioId: activo.id,
        desde,
        hasta,
        espacioId: parametros.espacio || undefined,
        unidadId: parametros.unidad || undefined,
      }),
      suspensionesEnRango(HABILITACIONES, RELOJ, {
        usuarioId,
        consorcioId: activo.id,
        desde,
        hasta,
        espacioId: parametros.espacio || undefined,
      }),
    ])
    const calendario = construirCalendario(mes, reservas, tramos, RELOJ.hoy().toISOString())

    return (
      <>
        <h1>Historial de reservas</h1>
        <p className="apagado">
          Quién usó cada espacio común, mes por mes.{' '}
          <Link href={`/consorcios/${activo.id}/reservas`}>Volver a las próximas reservas</Link>.
        </p>

        <Filtros>
          <form className="fila-de-filtros" role="search" aria-label="Filtrar el historial">
            <div className="campo">
              <label htmlFor="mes">Mes</label>
              <input id="mes" name="mes" type="month" defaultValue={mes} />
            </div>
            <div className="campo">
              <label htmlFor="espacio-filtro">Espacio</label>
              <select id="espacio-filtro" name="espacio" defaultValue={parametros.espacio ?? ''}>
                <option value="">Todos</option>
                {espacios.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="unidad-filtro">Unidad</label>
              <select id="unidad-filtro" name="unidad" defaultValue={parametros.unidad ?? ''}>
                <option value="">Todas</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.designacion}
                  </option>
                ))}
              </select>
            </div>
            <button className="boton boton--fantasma" type="submit">
              Filtrar
            </button>
          </form>
        </Filtros>

        <CalendarioUso calendario={calendario} />

        {reservas.length === 0 ? (
          <div className="vacio">
            <History aria-hidden="true" />
            <p>Sin reservas en ese mes.</p>
          </div>
        ) : (
          <TablaDesplazable tabIndex={0} role="region" aria-label="Detalle de reservas">
            <table>
              <thead>
                <tr>
                  <th scope="col">Espacio</th>
                  <th scope="col">Desde</th>
                  <th scope="col">Hasta</th>
                  <th scope="col">Unidad</th>
                  <th scope="col">Reservó</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {reservas.map((r) => (
                  <tr key={r.id}>
                    <td>{r.espacio}</td>
                    <td>{momentoParaMostrar(r.desde)}</td>
                    <td>{momentoParaMostrar(r.hasta)}</td>
                    <td>{r.unidad}</td>
                    <td>{r.solicitante}</td>
                    <td>
                      <span className={`etiqueta ${estadoDe(r).clase}`}>{estadoDe(r).texto}</span>
                      {r.motivoRechazo && <p className="ayuda">{r.motivoRechazo}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaDesplazable>
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
