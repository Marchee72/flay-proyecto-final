import { Download } from 'lucide-react'

import type { TablaExportable } from '@/aplicacion/exportar/exportar'

/** Enlace a la exportacion abierta de un listado (`FR-032b`, SC-018). */
export function EnlaceExportar({
  consorcioId,
  tabla,
}: {
  consorcioId: string
  tabla: TablaExportable
}) {
  return (
    <a
      className="boton boton--fantasma"
      href={`/api/exportar/${consorcioId}/${tabla}.csv`}
      download
    >
      <Download className="icono" aria-hidden="true" /> Exportar CSV
    </a>
  )
}
