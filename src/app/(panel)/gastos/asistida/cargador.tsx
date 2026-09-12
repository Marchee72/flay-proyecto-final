'use client'

import { accionIniciarCargaAsistida } from '../acciones'
import { SubidaDirecta } from '../../subida-directa'

/** El comprobante suelto sube directo y la confirmacion encola la extraccion (`RF-06`). */
export function CargadorDeComprobante({ consorcioId }: { consorcioId: string }) {
  return (
    <SubidaDirecta
      consorcioId={consorcioId}
      prefijo="extracciones"
      accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/tiff"
      etiquetaArchivo="Comprobante (PDF o foto)"
      etiquetaBoton="Subir y extraer"
      confirmar={accionIniciarCargaAsistida}
    />
  )
}
