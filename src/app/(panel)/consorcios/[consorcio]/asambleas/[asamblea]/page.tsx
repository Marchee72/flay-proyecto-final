import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Ban,
  CalendarPlus,
  Download,
  FileSignature,
  Pencil,
  Play,
  Send,
  Trash2,
} from 'lucide-react'

import { momentoParaMostrar } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { apoderadosPosibles } from '@/aplicacion/asambleas/poderes'
import { verAsamblea } from '@/aplicacion/asambleas/ver'

import { AvisoDeError, conConsorcio, idONoEncontrado } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'
import { EnVivo } from '../../../../en-vivo'
import { BotonModal } from '../../../../modal'
import { EtiquetaEstado } from '../etiqueta-estado'
import { accionAbrir, accionBorrar, accionCancelar, accionConvocar } from './acciones'
import { Ocultos } from './comunes'
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
    const agendable = vista.estado === 'convocada'
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
          <section className="borrador-barra" aria-label="Acciones del borrador">
            <p className="borrador-barra__texto">
              <strong>Borrador sin publicar:</strong> todavía no se avisó a nadie. Al convocar, el
              orden del día queda fijo y se notifica en Flay y por correo.
            </p>
            <div className="borrador-barra__acciones">
              <BotonModal
                etiqueta={
                  <>
                    <Trash2 className="icono" aria-hidden="true" />
                    Borrar
                  </>
                }
                titulo="Borrar el borrador"
                variante="boton--peligro"
                claseBoton="borrador-barra__borrar"
              >
                <form action={accionBorrar}>
                  <Ocultos vista={vista} />
                  <p className="ayuda">
                    Se borran los datos y el orden del día. No se puede deshacer.
                  </p>
                  <div className="fila-acciones">
                    <button className="boton boton--peligro" type="submit">
                      Confirmar borrado
                    </button>
                  </div>
                </form>
              </BotonModal>
              <span className="borrador-barra__separador" aria-hidden="true" />
              <Link className="boton boton--fantasma" href={`${base}/${vista.id}/editar`}>
                <Pencil className="icono" aria-hidden="true" />
                Editar
              </Link>
              <BotonModal
                etiqueta={
                  <>
                    <Send className="icono" aria-hidden="true" />
                    Convocar
                  </>
                }
                titulo="Enviar la convocatoria"
              >
                <form action={accionConvocar}>
                  <Ocultos vista={vista} />
                  <p className="ayuda">
                    Se avisa a los propietarios en Flay y por correo, y el orden del día ya no se
                    puede cambiar.
                  </p>
                  <div className="fila-acciones">
                    <button className="boton boton--primario" type="submit">
                      Confirmar convocatoria
                    </button>
                  </div>
                </form>
              </BotonModal>
            </div>
          </section>
        )}

        {vista.estado === 'convocada' && vista.yo.puedeDirigir && (
          <section aria-label="El día de la reunión">
            {vista.propietariosSinCuenta.length > 0 && (
              <p className="aviso aviso--atencion" role="status">
                {vista.propietariosSinCuenta.length === 1
                  ? 'Un propietario no tiene cuenta en Flay'
                  : `${vista.propietariosSinCuenta.length} propietarios no tienen cuenta en Flay`}
                : les llega la convocatoria por correo si lo tienen cargado. A los que no, hay que
                convocarlos por otro medio.
              </p>
            )}
            <div className="borrador-barra">
              <p className="borrador-barra__texto">
                <strong>El día de la reunión:</strong>{' '}
                {yaEsHora
                  ? 'Ya está en horario para iniciar la acreditación y abrir la sesión.'
                  : `Se habilita la apertura desde el ${momentoParaMostrar(vista.fechaHora)}.`}
              </p>
              <div className="borrador-barra__acciones">
                <BotonModal
                  etiqueta={
                    <>
                      <Ban className="icono" aria-hidden="true" />
                      Cancelar la asamblea
                    </>
                  }
                  titulo="Cancelar la asamblea"
                  variante="boton--peligro"
                  claseBoton="borrador-barra__borrar"
                >
                  <form action={accionCancelar}>
                    <Ocultos vista={vista} />
                    <p className="ayuda">
                      Se notificará la cancelación a todos los propietarios convocados en Flay y por
                      correo.
                    </p>
                    <div className="campo campo--ancho">
                      <label htmlFor="motivo">Motivo de la cancelación</label>
                      <textarea
                        id="motivo"
                        name="motivo"
                        rows={3}
                        maxLength={300}
                        placeholder="Ej.: reprogramación por falta de disponibilidad del salón…"
                      />
                    </div>
                    <div className="fila-acciones">
                      <button className="boton boton--peligro" type="submit">
                        Confirmar cancelación
                      </button>
                    </div>
                  </form>
                </BotonModal>
                <span className="borrador-barra__separador" aria-hidden="true" />
                <form action={accionAbrir}>
                  <Ocultos vista={vista} />
                  <button className="boton boton--primario" type="submit" disabled={!yaEsHora}>
                    <Play className="icono" aria-hidden="true" />
                    Abrir la asamblea
                  </button>
                </form>
              </div>
            </div>
          </section>
        )}

        {vista.estado === 'en_curso' && (
          <div className="sala">
            <Sala vista={vista} />
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
