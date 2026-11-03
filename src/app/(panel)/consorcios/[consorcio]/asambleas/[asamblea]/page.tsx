import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarPlus, Download, FileSignature, Pencil } from 'lucide-react'

import { momentoParaMostrar } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { apoderadosPosibles } from '@/aplicacion/asambleas/poderes'
import { verAsamblea } from '@/aplicacion/asambleas/ver'

import { AvisoDeError, conConsorcio, idONoEncontrado } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'
import { EnVivo } from '../../../../en-vivo'
import { EtiquetaEstado } from '../etiqueta-estado'
import { accionAbrir, accionBorrar, accionCancelar, accionConvocar } from './acciones'
import { Ocultos } from './comunes'
import { Direccion } from './direccion'
import { OrdenDelDia } from './orden-del-dia'
import { Poderes } from './poderes'
import { Sala } from './sala'

export const metadata: Metadata = { title: 'Asamblea — Flay' }

/**
 * Una asamblea, según su estado (RF-29 a RF-33):
 * - borrador: editar y convocar;
 * - convocada: orden del día, calendario y poderes; quien dirige la abre;
 * - en curso: la sala en vivo, que se refresca sola (FR-023);
 * - finalizada / acta firmada: resultados, oposición y el acta.
 */
export default async function AsambleaPage({
  params,
}: {
  params: Promise<{ consorcio: string; asamblea: string }>
}) {
  const { consorcio: consorcioId, asamblea } = await params
  const asambleaId = idONoEncontrado(asamblea)
  const pantalla = await conConsorcio(consorcioId, 'Asamblea')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  const base = `/consorcios/${activo.id}/asambleas`

  try {
    const vista = await verAsamblea(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      asambleaId,
    })
    const apoderados =
      vista.estado === 'convocada'
        ? await apoderadosPosibles(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id })
        : []
    const yaEsHora = RELOJ.ahora() >= new Date(vista.fechaHora)
    const agendable = vista.estado === 'convocada' || vista.estado === 'en_curso'
    const conActa = vista.estado === 'finalizada' || vista.estado === 'acta_firmada'

    return (
      <>
        {vista.estado === 'en_curso' && <EnVivo />}
        <Volver href={base} />
        <div className="cabecera-pagina">
          <div>
            <h1>{vista.titulo}</h1>
            <p className="apagado">
              <EtiquetaEstado estado={vista.estado} />{' '}
              {vista.tipo === 'ordinaria' ? 'Ordinaria' : 'Extraordinaria'} · {vista.lugar}
            </p>
            <p className="apagado">
              Primera convocatoria: {momentoParaMostrar(vista.fechaHora)} · segunda:{' '}
              {momentoParaMostrar(vista.segundaConvocatoria).slice(-5)} · organiza{' '}
              {vista.organizador}
              {!vista.administracionInvitada && ' · la administración no está invitada'}
            </p>
          </div>
          <div className="cabecera-pagina__acciones">
            {agendable && (
              <>
                <a
                  className="boton boton--fantasma"
                  href={vista.enlaceGoogleCalendar}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <CalendarPlus className="icono" aria-hidden="true" />
                  Agregar a Google Calendar
                </a>
                <a
                  className="boton boton--terciario"
                  href={`/api/asambleas/${vista.id}/ics?consorcio=${activo.id}`}
                >
                  <Download className="icono" aria-hidden="true" />
                  Descargar .ics
                </a>
              </>
            )}
            {conActa && (
              <Link className="boton boton--primario" href={`${base}/${vista.id}/acta`}>
                <FileSignature className="icono" aria-hidden="true" />
                Acta
              </Link>
            )}
          </div>
        </div>

        {vista.estado === 'cancelada' && (
          <p className="aviso aviso--atencion" role="status">
            Asamblea cancelada{vista.motivoCancelacion ? `: ${vista.motivoCancelacion}` : '.'}
          </p>
        )}

        {vista.estado === 'borrador' && vista.yo.puedeDirigir && (
          <section className="tarjeta" aria-labelledby="borrador-titulo">
            <h2 id="borrador-titulo">Borrador</h2>
            <p className="apagado">
              Todavía no se avisó a nadie. Al convocar, el orden del día queda fijo y sale el aviso
              a todos los propietarios, en Flay y por correo.
            </p>
            <div className="fila-acciones">
              <Link className="boton boton--fantasma" href={`${base}/${vista.id}/editar`}>
                <Pencil className="icono" aria-hidden="true" />
                Editar
              </Link>
              <form action={accionConvocar}>
                <Ocultos vista={vista} />
                <button className="boton boton--primario" type="submit">
                  Convocar
                </button>
              </form>
              <form action={accionBorrar}>
                <Ocultos vista={vista} />
                <button className="boton boton--peligro" type="submit">
                  Borrar
                </button>
              </form>
            </div>
          </section>
        )}

        {vista.estado === 'convocada' && vista.yo.puedeDirigir && (
          <section className="tarjeta" aria-labelledby="dirigir-titulo">
            <h2 id="dirigir-titulo">El día de la reunión</h2>
            {vista.propietariosSinCuenta.length > 0 && (
              <p className="aviso aviso--atencion" role="status">
                {vista.propietariosSinCuenta.length === 1
                  ? 'Un propietario no tiene cuenta en Flay'
                  : `${vista.propietariosSinCuenta.length} propietarios no tienen cuenta en Flay`}
                : les llega la convocatoria por correo si lo tienen cargado. A los que no, hay que
                convocarlos por otro medio.
              </p>
            )}
            <div className="fila-acciones">
              <form action={accionAbrir}>
                <Ocultos vista={vista} />
                <button className="boton boton--primario" type="submit" disabled={!yaEsHora}>
                  Abrir la asamblea
                </button>
              </form>
              {!yaEsHora && (
                <span className="apagado">
                  Se abre desde {momentoParaMostrar(vista.fechaHora)}.
                </span>
              )}
            </div>
            <form action={accionCancelar} className="fila-de-filtros">
              <Ocultos vista={vista} />
              <div className="campo">
                <label htmlFor="motivo">Motivo de la cancelación</label>
                <input id="motivo" name="motivo" maxLength={300} />
              </div>
              <button className="boton boton--peligro" type="submit">
                Cancelar la asamblea
              </button>
            </form>
          </section>
        )}

        {vista.estado === 'en_curso' && (
          <div className="sala">
            <Sala vista={vista} />
            <Direccion vista={vista} />
          </div>
        )}

        {vista.estado === 'convocada' && <Poderes vista={vista} apoderados={apoderados} />}

        {vista.estado !== 'en_curso' && <OrdenDelDia vista={vista} conResultados={conActa} />}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
