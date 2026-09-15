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
 * Liquidar y anular tocan dinero y piden confirmación explícita en dos pasos
 * (RN-06, RN-14): el primer clic solo muestra el resumen con la magnitud
 * exacta; recién el segundo envía la Server Action, que se invoca igual que
 * antes. El estado de confirmación vive en el cliente con foco gestionado
 * (sin `confirm()` nativo ni librerías nuevas).
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

export function BotonLiquidar({
  consorcioId,
  periodoId,
  periodoEtiqueta,
  cantidadGastos,
}: {
  consorcioId: string
  periodoId: string
  /** `08/2026`: cadena ya armada en el servidor, acá solo se muestra. */
  periodoEtiqueta: string
  /** Cantidad de gastos del período (conteo, no dinero). */
  cantidadGastos: number
}) {
  const alcance =
    cantidadGastos === 1 ? 'Se liquida 1 gasto.' : `Se liquidan ${cantidadGastos} gastos.`

  return (
    <ConfirmacionEnDosPasos
      accion={accionLiquidarPeriodo}
      consorcioId={consorcioId}
      campo="periodo"
      valor={periodoId}
      variante="liquidar"
      etiquetaInicial="Liquidar"
      titulo={`Confirmar liquidación del período ${periodoEtiqueta}`}
      descripcion={`${alcance} Al confirmar se generan las expensas y ya no se pueden cargar más gastos en este período.`}
      resumen={[
        { rotulo: 'Período', valor: periodoEtiqueta },
        { rotulo: 'Gastos', valor: String(cantidadGastos) },
      ]}
      etiquetaConfirmar="Confirmar liquidación"
      trabajando="Liquidando…"
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
      variante="anular"
      peligro
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
  etiqueta,
  trabajando,
  primario = false,
}: {
  accion: AccionDeEstado
  consorcioId: string
  campo: string
  valor: string
  etiqueta: string
  trabajando: string
  primario?: boolean
}) {
  const [estado, enviar, enCurso] = useActionState(accion, SIN_ERROR)

  return (
    <form action={enviar}>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name={campo} value={valor} />

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
 * Disparo en dos pasos para las acciones que tocan dinero (RN-06, RN-14).
 *
 * El primer botón es `type="button"`: solo abre el diálogo con el resumen. Es
 * el mismo `<dialog>` nativo del resto del panel (`modal.tsx`): `showModal()`
 * atrapa el foco, Escape cierra y al cerrar el foco vuelve al botón inicial.
 * Antes era un panel dentro de la celda, y la tabla se deformaba para
 * hacerle lugar. El envío real ocurre recién en «Confirmar…». Solo Anular
 * viste `.boton--peligro`; Liquidar confirma con `.boton--primario`.
 */
function ConfirmacionEnDosPasos({
  accion,
  consorcioId,
  campo,
  valor,
  variante,
  peligro = false,
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
  variante: 'liquidar' | 'anular'
  peligro?: boolean
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
  const tituloId = `confirmar-${variante}-${valor}-titulo`

  const abrir = () => {
    if (!dialogo.current || dialogo.current.open) return
    dialogo.current.showModal()
    tituloRef.current?.focus()
  }
  const cerrar = () => dialogo.current?.close()

  const clase = peligro ? 'boton--peligro' : 'boton--primario'

  return (
    <>
      <button ref={inicialRef} className={`boton ${clase}`} type="button" onClick={abrir}>
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

          <div className="modal__encabezado">
            <h2 ref={tituloRef} id={tituloId} tabIndex={-1} className="modal__titulo">
              {titulo}
            </h2>
            <button
              type="button"
              className="boton boton--fantasma"
              onClick={cerrar}
              aria-label="Cerrar diálogo"
            >
              <X className="icono" aria-hidden="true" />
              Cerrar
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
            <button className={`boton ${clase}`} type="submit" disabled={enCurso}>
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
