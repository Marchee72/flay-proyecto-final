import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, CalendarCheck, Siren } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { momentoParaMostrar } from '@/compartido/formato'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarEspacios } from '@/aplicacion/reservas/espacios'
import { listarReservas, unidadesParaReservar } from '@/aplicacion/reservas/reservar'

import { AvisoDeError, conConsorcio } from '../con-consorcio'
import { EncabezadoDeConsorcio } from '../encabezado-consorcio'
import { accionCancelarReserva } from './acciones'
import { ModalReserva } from './modal-reserva'

export const metadata: Metadata = { title: 'Reservas — Flay' }

const DIA = 86_400_000

/**
 * Reservas de espacios comunes (`CU-09`): las proximas dos semanas por
 * espacio, con la unidad y sin nombre de nadie; alta en modal; cancelacion
 * de las propias.
 */
export default async function ReservasPage({
  searchParams,
}: {
  searchParams: Promise<{
    consorcio?: string
    espacio?: string
    confirmada?: string
    cancelada?: string
    error?: string
  }>
}) {
  const parametros = await searchParams
  const pantalla = await conConsorcio(parametros, '/reservas', 'Reservas')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const hoy = RELOJ.hoy()
    const [espacios, unidades, roles, reservas] = await Promise.all([
      listarEspacios(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      unidadesParaReservar(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
      listarReservas(HABILITACIONES, RELOJ, {
        usuarioId,
        consorcioId: activo.id,
        desde: hoy,
        hasta: new Date(hoy.getTime() + 60 * DIA),
        espacioId: parametros.espacio || undefined,
      }),
    ])
    const esAdministrador = roles.includes('administrador')

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref="/consorcios"
          volverTexto="Volver a consorcios"
        />
        <h1>Reservas</h1>
        <p className="apagado">
          Los próximos sesenta días. Una unidad con deuda vencida no puede reservar hasta
          regularizar.
          {esAdministrador && (
            <>
              {' '}
              <Link href={`/espacios?consorcio=${activo.id}`}>Administrar espacios</Link>.
            </>
          )}
        </p>

        {parametros.confirmada && (
          <p className="aviso aviso--atencion" role="status">
            <BadgeCheck className="icono" aria-hidden="true" />
            <span>Reserva confirmada. Te llega un aviso por correo.</span>
          </p>
        )}
        {parametros.cancelada && (
          <p className="aviso aviso--atencion" role="status">
            <BadgeCheck className="icono" aria-hidden="true" />
            <span>Reserva cancelada.</span>
          </p>
        )}
        {parametros.error && (
          <AvisoDeError error={new ErrorDeAplicacion(parametros.error, 'RF-16')} />
        )}

        {espacios.length === 0 ? (
          <div className="vacio">
            <CalendarCheck aria-hidden="true" />
            <p>Este consorcio no tiene espacios reservables todavía.</p>
          </div>
        ) : unidades.length === 0 ? (
          <div className="vacio">
            <Siren aria-hidden="true" />
            <p>
              No tenés una unidad a tu nombre en este consorcio: la reserva la hace quien ocupa la
              unidad.
            </p>
          </div>
        ) : (
          <div className="fila-acciones">
            <ModalReserva
              consorcioId={activo.id}
              espacios={espacios}
              unidades={unidades}
              espacioInicial={parametros.espacio}
            />
          </div>
        )}

        <form className="fila-de-filtros" role="search" aria-label="Filtrar por espacio">
          <input type="hidden" name="consorcio" value={activo.id} />
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
          <button className="boton boton--fantasma" type="submit">
            Filtrar
          </button>
        </form>

        {reservas.length === 0 ? (
          <div className="vacio">
            <CalendarCheck aria-hidden="true" />
            <p>Sin reservas en los próximos sesenta días.</p>
          </div>
        ) : (
          <div className="tabla-desplazable" tabIndex={0} role="region" aria-label="Reservas">
            <table>
              <caption className="ayuda">
                Quién reservó se identifica por unidad, no por nombre
              </caption>
              <thead>
                <tr>
                  <th scope="col">Espacio</th>
                  <th scope="col">Desde</th>
                  <th scope="col">Hasta</th>
                  <th scope="col">Unidad</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="oculto">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {reservas.map((r) => (
                  <tr key={r.id}>
                    <td>{r.espacio}</td>
                    <td>{momentoParaMostrar(r.desde)}</td>
                    <td>{momentoParaMostrar(r.hasta)}</td>
                    <td>{r.unidad}</td>
                    <td>
                      <span
                        className={`etiqueta ${r.estado === 'confirmada' ? 'etiqueta--rendido' : 'etiqueta--vencido'}`}
                      >
                        {r.estado === 'confirmada' ? 'Confirmada' : 'Cancelada'}
                      </span>
                    </td>
                    <td>
                      {r.estado === 'confirmada' && (r.propia || esAdministrador) && (
                        <form action={accionCancelarReserva}>
                          <input type="hidden" name="consorcio" value={activo.id} />
                          <input type="hidden" name="reserva" value={r.id} />
                          <button className="boton boton--fantasma" type="submit">
                            Cancelar
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
