import Link from 'next/link'
import { ArrowLeft, Building2 } from 'lucide-react'

/**
 * Encabezado de consorcio (guía §3.4, Navegación): fila superior presente en
 * toda pantalla que trabaja sobre un consorcio resuelto. A la izquierda, la
 * insignia + el nombre del consorcio como texto prominente (no es `h1`: cada
 * página conserva el suyo); a la derecha, el botón «Volver» que lleva a la
 * lista madre con `?consorcio=` preservado —o a `/consorcios` en las listas—.
 * Solo presentación: no consulta la base ni decide permisos.
 */
export function EncabezadoDeConsorcio({
  nombre,
  volverHref,
  volverTexto = 'Volver',
}: {
  nombre: string
  volverHref: string
  volverTexto?: string
}) {
  return (
    <div className="encabezado-consorcio">
      <p className="encabezado-consorcio__nombre">
        <span className="encabezado-consorcio__insignia" aria-hidden="true">
          <Building2 className="icono" aria-hidden="true" />
        </span>
        {nombre}
      </p>
      <Link className="boton boton--fantasma" href={volverHref}>
        <ArrowLeft className="icono" aria-hidden="true" />
        {volverTexto}
      </Link>
    </div>
  )
}
