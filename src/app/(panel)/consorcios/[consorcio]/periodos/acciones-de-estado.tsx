'use client'

import { useActionState, useRef } from 'react'
import { X } from 'lucide-react'

import {
  accionAnularLiquidacion,
  accionCerrarPeriodo,
  accionGenerarDocumentos,
  accionLiquidarPeriodo,
  type Resultado,
} from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

type AccionDeEstado = (previo: Resultado, datos: FormData) => Promise<Resultado>

/**
 * Los botones de estado del período, uno por fila de la tabla (`CU-03`).
 *
 * Cada uno es su propio formulario: así el mensaje de error aparece **en la
 * fila que falló** y no arriba de todo, que con doce períodos en pantalla es la
 * diferencia entre entender qué pasó y adivinarlo (RNF-10).
 *
 * Anular toca dinero y se dispara desde la tabla, sin pantalla previa: pide
 * confirmación explícita en dos pasos (RN-06). El primer clic solo muestra el
 * resumen con la magnitud exacta; recién el segundo envía la Server Action. El
 * estado vive en el cliente con foco gestionado (sin `confirm()` nativo ni
 * librerías nuevas). Liquidar no la necesita: su pantalla **es** el resumen.
 */
export function BotonCerrar({
  consorcioId,
  periodoId,
}: {
  consorcioId: string
  periodoId: string
}) {
  return (
    <Boton
      accion={accionCerrarPeriodo}
      consorcioId={consorcioId}
      campo="periodo"
      valor={periodoId}
      etiqueta="Cerrar"
      trabajando="Cerrando…"
    />
  )
}

/**
 * Liquidar no confirma en dos pasos: vive **dentro** de la pantalla de revision
 * (`periodos/[id]`), que ya muestra los gastos, los totales y el reparto. Un
 * modal que repitiera el total arriba de todo eso no agrega una decision, la
 * estorba. Anular si lo hace: se dispara desde la tabla, sin pantalla previa.
 */
export function BotonLiquidar({
  consorcioId,
  periodoId,
  totalRevisado,
}: {
  consorcioId: string
  periodoId: string
  /** El total que se vio al revisar; la emision lo compara (RF-07). */
  totalRevisado: string
}) {
  return (
    <Boton
      accion={accionLiquidarPeriodo}
      consorcioId={consorcioId}
      campo="periodo"
      valor={periodoId}
      ocultos={{ totalRevisado }}
      etiqueta="Confirmar y liquidar"
      trabajando="Liquidando…"
      primario
    />
  )
}

export function BotonAnular({
  consorcioId,
  liquidacionId,
  periodoEtiqueta,
  total,
  vencimiento,
}: {
  consorcioId: string
  liquidacionId: string
  /** `08/2026`: cadena ya armada en el servidor, acá solo se muestra. */
  periodoEtiqueta: string
  /** Importe ya formateado (`$ 1.234,56`): nunca número ni aritmética acá. */
  total: string
  /** Vencimiento ya formateado (`10/09/2026`). */
  vencimiento: string
}) {
  return (
    <ConfirmacionEnDosPasos
      accion={accionAnularLiquidacion}
      consorcioId={consorcioId}
      campo="liquidacion"
      valor={liquidacionId}
      etiquetaInicial="Anular"
      titulo={`Confirmar anulación del período ${periodoEtiqueta}`}
      descripcion={`Se anula la liquidación de ${total} con vencimiento ${vencimiento}. Los pagos aplicados se liberan como saldo a favor y la anulación queda registrada.`}
      resumen={[
        { rotulo: 'Liquidación', valor: total },
        { rotulo: 'Vencimiento', valor: vencimiento },
      ]}
      etiquetaConfirmar="Confirmar anulación"
      trabajando="Anulando…"
    />
  )
}

export function BotonGenerarDocumentos({
  consorcioId,
  liquidacionId,
}: {
  consorcioId: string
  liquidacionId: string
}) {
  return (
    <Boton
      accion={accionGenerarDocumentos}
      consorcioId={consorcioId}
      campo="liquidacion"
      valor={liquidacionId}
      etiqueta="Generar los documentos"
      trabajando="Generando…"
      primario
    />
  )
}

function Boton({
  accion,
  consorcioId,
  campo,
  valor,
  ocultos = {},
  etiqueta,
  trabajando,
  primario = false,
}: {
  accion: AccionDeEstado
  consorcioId: string
  campo: string
  valor: string
  /** Campos extra que viajan con el envio. */
  ocultos?: Record<string, string>
  etiqueta: string
  trabajando: string
  primario?: boolean
}) {
  const [estado, enviar, enCurso] = useActionState(accion, SIN_ERROR)

  return (
    <form action={enviar}>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name={campo} value={valor} />
      {Object.entries(ocultos).map(([nombre, valorOculto]) => (
        <input key={nombre} type="hidden" name={nombre} value={valorOculto} />
      ))}

      <button
        className={`boton ${primario ? 'boton--primario' : 'boton--fantasma'}`}
        type="submit"
        disabled={enCurso}
      >
        {enCurso ? trabajando : etiqueta}
      </button>

      {estado.mensaje && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}
    </form>
  )
}

/**
 * Disparo en dos pasos de la anulación (RN-06), que se aprieta desde la tabla
 * y no tiene pantalla previa donde ver lo que se va a deshacer.
 *
 * El primer botón es `type="button"`: solo abre el diálogo con el resumen. Es
 * el mismo `<dialog>` nativo del resto del panel (`modal.tsx`): `showModal()`
 * atrapa el foco, Escape cierra y al cerrar el foco vuelve al botón inicial.
 * Antes era un panel dentro de la celda, y la tabla se deformaba para hacerle
 * lugar. El envío real ocurre recién en «Confirmar…».
 */
function ConfirmacionEnDosPasos({
  accion,
  consorcioId,
  campo,
  valor,
  ocultos = {},
  etiquetaInicial,
  titulo,
  descripcion,
  resumen,
  etiquetaConfirmar,
  trabajando,
}: {
  accion: AccionDeEstado
  consorcioId: string
  campo: string
  valor: string
  /** Campos extra que viajan con el envío. */
  ocultos?: Record<string, string>
  etiquetaInicial: string
  titulo: string
  descripcion: string
  resumen: { rotulo: string; valor: string }[]
  etiquetaConfirmar: string
  trabajando: string
}) {
  const [estado, enviar, enCurso] = useActionState(accion, SIN_ERROR)
  const inicialRef = useRef<HTMLButtonElement>(null)
  const dialogo = useRef<HTMLDialogElement>(null)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const tituloId = `confirmar-anular-${valor}-titulo`

  const abrir = () => {
    if (!dialogo.current || dialogo.current.open) return
    dialogo.current.showModal()
    tituloRef.current?.focus()
  }
  const cerrar = () => dialogo.current?.close()

  return (
    <>
      <button ref={inicialRef} className="boton boton--peligro" type="button" onClick={abrir}>
        {etiquetaInicial}
      </button>

      <dialog
        ref={dialogo}
        className="modal"
        aria-labelledby={tituloId}
        onClick={(evento) => {
          if (evento.target === dialogo.current) cerrar()
        }}
        onClose={() => inicialRef.current?.focus()}
      >
        <form action={enviar} className="modal__interior">
          <input type="hidden" name="consorcio" value={consorcioId} />
          <input type="hidden" name={campo} value={valor} />
          {Object.entries(ocultos).map(([nombre, valorOculto]) => (
            <input key={nombre} type="hidden" name={nombre} value={valorOculto} />
          ))}

          <div className="modal__encabezado">
            <h2 ref={tituloRef} id={tituloId} tabIndex={-1} className="modal__titulo">
              {titulo}
            </h2>
            <button
              type="button"
              className="boton boton--cerrar"
              onClick={cerrar}
              aria-label="Cerrar diálogo"
            >
              <X className="icono" aria-hidden="true" />
            </button>
          </div>

          <p className="apagado">{descripcion}</p>

          <div className="resumen">
            {resumen.map((item) => (
              <div key={item.rotulo} className="resumen__item">
                <div className="resumen__rotulo">{item.rotulo}</div>
                <div className="resumen__valor cifra">{item.valor}</div>
              </div>
            ))}
          </div>

          {estado.mensaje && (
            <p className="error" role="alert">
              {estado.mensaje}
            </p>
          )}

          <div className="fila-acciones">
            <button className="boton boton--peligro" type="submit" disabled={enCurso}>
              {enCurso ? trabajando : etiquetaConfirmar}
            </button>
            <button className="boton boton--fantasma" type="button" onClick={cerrar}>
              Cancelar
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
