'use client'

import { accionConfirmarComprobante } from '../acciones'
import { SubidaDirecta } from '../../../../subida-directa'

/**
 * Comprobante de un gasto ya registrado (FR-018b): la misma subida directa que
 * el resto. El archivo va del navegador al almacenamiento y no pasa por el
 * servidor; el permiso verifica tipo y tamaño antes de transferir un byte.
 */
export function AdjuntarComprobante({
  consorcioId,
  gastoId,
}: {
  consorcioId: string
  gastoId: string
}) {
  return (
    <SubidaDirecta
      consorcioId={consorcioId}
      permiso={{ ruta: '/api/comprobantes/permiso', campos: { gasto: gastoId } }}
      accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/tiff"
      objeto="el comprobante"
      ayuda="PDF, JPEG, PNG, WebP, HEIC o TIFF · hasta 25 MB"
      etiquetaBoton="Subir"
      confirmar={accionConfirmarComprobante}
      exito="Comprobante subido."
    >
      <input type="hidden" name="gasto" value={gastoId} />
    </SubidaDirecta>
  )
}
