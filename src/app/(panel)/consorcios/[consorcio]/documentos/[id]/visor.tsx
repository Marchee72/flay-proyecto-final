'use client'

import { useState } from 'react'

/**
 * El PDF del documento. Se queda con el primer enlace firmado: mientras se
 * buscan sugerencias, `EnVivo` refresca la pagina cada 3 s, cada refresco firma
 * un enlace nuevo y un `src` distinto recargaba el visor cada vez.
 */
export function Visor({ src, titulo }: { src: string; titulo: string }) {
  const [primero] = useState(src)
  return <iframe className="visor" src={primero} title={titulo} />
}
