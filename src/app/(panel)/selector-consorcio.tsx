import Link from 'next/link'
import { Building2, TriangleAlert } from 'lucide-react'

import { elegirConsorcio } from './acciones'

export type ConsorcioOpcion = { id: string; nombre: string }

/**
 * Cambio de consorcio activo sin guion: un formulario con la Server Action
 * `elegirConsorcio`, que valida el id contra el alcance, lo guarda en la
 * galleta `flay_consorcio` y vuelve a la misma dirección con
 * `?consorcio=<id>` (resto de parámetros intactos). Vive en la barra del
 * panel (§3.4 de la guía: el consorcio activo siempre visible en la barra,
 * no como sección) y se reutiliza en Usuarios con etiqueta visible.
 */
export function SelectorDeConsorcio({
  consorcios,
  activoId,
  id = 'consorcio-activo',
  mostrarEtiqueta = false,
}: {
  consorcios: ConsorcioOpcion[]
  activoId?: string
  id?: string
  mostrarEtiqueta?: boolean
}) {
  if (consorcios.length === 0) return null

  const activo = consorcios.find((c) => c.id === activoId) ?? consorcios[0]

  if (consorcios.length === 1 && !mostrarEtiqueta) {
    return (
      <p className="consorcio">
        <Building2 className="icono" aria-hidden="true" />
        {activo.nombre}
      </p>
    )
  }

  return (
    <form
      action={elegirConsorcio}
      className={mostrarEtiqueta ? 'fila-de-filtros' : 'selector-consorcio'}
    >
      {mostrarEtiqueta ? (
        <div className="campo">
          <label htmlFor={id}>Consorcio</label>
          <select id={id} name="consorcio" defaultValue={activo.id}>
            {consorcios.map((consorcio) => (
              <option key={consorcio.id} value={consorcio.id}>
                {consorcio.nombre}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <Building2 className="icono" aria-hidden="true" />
          <label className="oculto" htmlFor={id}>
            Consorcio activo
          </label>
          <select id={id} name="consorcio" aria-label="Consorcio activo" defaultValue={activo.id}>
            {consorcios.map((consorcio) => (
              <option key={consorcio.id} value={consorcio.id}>
                {consorcio.nombre}
              </option>
            ))}
          </select>
        </>
      )}
      <button className="boton boton--fantasma" type="submit">
        Cambiar
      </button>
    </form>
  )
}

/**
 * RNF-10 para las pantallas que trabajan sobre un consorcio: si no hay
 * ninguno elegido no se adivina (nada de `consorcios[0]` silencioso). Dice
 * qué pasó y da el paso siguiente: elegir en la barra o ir directo al
 * primero al alcance, conservando el resto de los parámetros.
 */
export function AvisoConsorcioNoElegido({
  consorcios,
  base,
  parametros,
  pedidoDesconocido = false,
}: {
  consorcios: ConsorcioOpcion[]
  base: string
  parametros: Record<string, string | undefined>
  pedidoDesconocido?: boolean
}) {
  const sugerido = consorcios[0]
  const busqueda = new URLSearchParams()
  for (const [clave, valor] of Object.entries(parametros)) {
    if (clave !== 'consorcio' && valor) busqueda.set(clave, valor)
  }
  busqueda.set('consorcio', sugerido.id)

  return (
    <p className="aviso aviso--atencion" role="status">
      <TriangleAlert className="icono" aria-hidden="true" />
      <span>
        {pedidoDesconocido
          ? 'Ese consorcio no está al alcance, por eso no se muestra ningún dato. '
          : 'No se eligió ningún consorcio, por eso no se muestra ningún dato. '}
        Elegir uno en el selector «Consorcio activo» de la barra superior y presionar «Cambiar», o{' '}
        <Link href={`${base}?${busqueda}`}>Ver {sugerido.nombre}</Link>.
      </span>
    </p>
  )
}
