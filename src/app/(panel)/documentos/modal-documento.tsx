'use client'

import { accionCargarDocumento } from '../comunicacion/acciones'
import { BotonModal } from '../modal'
import { SubidaDirecta } from '../subida-directa'

/** Carga de un documento con subida directa y marca de visibilidad (`RF-19`). */
export function ModalDocumento({
  consorcioId,
  tipos,
}: {
  consorcioId: string
  tipos: readonly { valor: string; etiqueta: string }[]
}) {
  return (
    <BotonModal etiqueta="Cargar documento" titulo="Cargar un documento">
      <SubidaDirecta
        consorcioId={consorcioId}
        prefijo="documentos"
        accept="application/pdf"
        etiquetaArchivo="Archivo PDF"
        etiquetaBoton="Cargar"
        confirmar={accionCargarDocumento}
      >
        <div className="campo">
          <label htmlFor="titulo-documento">Título</label>
          <input id="titulo-documento" name="titulo" maxLength={200} required />
        </div>
        <div className="campo">
          <label htmlFor="tipo-documento">Tipo</label>
          <select id="tipo-documento" name="tipo" defaultValue="reglamento_copropiedad">
            {tipos.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="fecha-documento">Fecha del documento</label>
          <input id="fecha-documento" name="fecha" type="date" />
        </div>
        <div className="campo">
          <label>
            <input type="checkbox" name="visible" defaultChecked /> Visible para los consorcistas
          </label>
          <p className="ayuda">
            Sin la marca, solo lo ven la administración y el consejo: contratos con datos de
            terceros, por ejemplo.
          </p>
        </div>
      </SubidaDirecta>
    </BotonModal>
  )
}
