'use client'

import { useActionState } from 'react'

import { ETIQUETAS_ESTADO, type EstadoReclamo, TRANSICIONES } from '@/aplicacion/reclamos/estados'

import { BotonModal } from '../../modal'
import { accionAsignar, accionTransicionar, type Resultado } from '../acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/**
 * Acciones del detalle (`CU-08`): asignar y cada transicion que el estado
 * admite, filtradas por lo que el rol puede. Solo presentacion: el caso de uso
 * vuelve a decidir.
 */
export function AccionesDeReclamo({
  consorcioId,
  reclamoId,
  estado,
  responsableId,
  rubroId,
  proveedorId,
  puedeAdministrar,
  esAutor,
  responsables,
  proveedores,
  rubros,
}: {
  consorcioId: string
  reclamoId: string
  estado: EstadoReclamo
  responsableId: string | null
  rubroId: string | null
  proveedorId: string | null
  puedeAdministrar: boolean
  esAutor: boolean
  responsables: readonly { id: string; nombre: string }[]
  proveedores: readonly { id: string; razonSocial: string }[]
  rubros: readonly { id: string; nombre: string }[]
}) {
  const delAutor: [EstadoReclamo, EstadoReclamo][] = [
    ['resuelto', 'en_curso'],
    ['cerrado', 'abierto'],
  ]
  const salidas = TRANSICIONES[estado].filter((hacia) =>
    puedeAdministrar
      ? // El administrador asigna con el formulario de asignacion, no con un boton suelto.
        !(estado === 'abierto' && hacia === 'asignado')
      : esAutor && delAutor.some(([d, h]) => d === estado && h === hacia),
  )

  if (salidas.length === 0 && !puedeAdministrar) return null

  return (
    <div className="fila-acciones">
      {puedeAdministrar && estado !== 'rechazado' && (
        <BotonModal
          etiqueta={estado === 'abierto' ? 'Asignar' : 'Cambiar asignación'}
          titulo="Asignar el reclamo"
          variante={estado === 'abierto' ? 'boton--primario' : 'boton--fantasma'}
        >
          <FormularioAsignar
            consorcioId={consorcioId}
            reclamoId={reclamoId}
            responsableId={responsableId}
            rubroId={rubroId}
            proveedorId={proveedorId}
            responsables={responsables}
            proveedores={proveedores}
            rubros={rubros}
          />
        </BotonModal>
      )}
      {salidas.map((hacia) => (
        <BotonModal
          key={hacia}
          etiqueta={etiquetaDeTransicion(hacia)}
          titulo={etiquetaDeTransicion(hacia)}
          variante={hacia === 'rechazado' ? 'boton--peligro' : 'boton--fantasma'}
        >
          <FormularioTransicion consorcioId={consorcioId} reclamoId={reclamoId} hacia={hacia} />
        </BotonModal>
      ))}
    </div>
  )
}

function etiquetaDeTransicion(hacia: EstadoReclamo): string {
  return (
    {
      abierto: 'Reabrir',
      asignado: 'Volver a asignado',
      en_curso: 'Marcar en curso',
      resuelto: 'Marcar resuelto',
      cerrado: 'Cerrar',
      rechazado: 'Rechazar',
    } satisfies Record<EstadoReclamo, string>
  )[hacia]
}

function FormularioTransicion({
  consorcioId,
  reclamoId,
  hacia,
}: {
  consorcioId: string
  reclamoId: string
  hacia: EstadoReclamo
}) {
  const [estado, accion, enviando] = useActionState(accionTransicionar, SIN_ERROR)
  const hayError = estado.mensaje !== ''
  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="reclamo" value={reclamoId} />
      <input type="hidden" name="hacia" value={hacia} />
      <div className="campo">
        <label htmlFor={`comentario-${hacia}`}>Comentario</label>
        <textarea id={`comentario-${hacia}`} name="comentario" rows={3} />
        <p className="ayuda">Queda en el historial, visible para quien hizo el reclamo.</p>
      </div>
      {hayError && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}
      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : `Pasar a ${ETIQUETAS_ESTADO[hacia].toLowerCase()}`}
      </button>
    </form>
  )
}

function FormularioAsignar({
  consorcioId,
  reclamoId,
  responsableId,
  rubroId,
  proveedorId,
  responsables,
  proveedores,
  rubros,
}: {
  consorcioId: string
  reclamoId: string
  responsableId: string | null
  rubroId: string | null
  proveedorId: string | null
  responsables: readonly { id: string; nombre: string }[]
  proveedores: readonly { id: string; razonSocial: string }[]
  rubros: readonly { id: string; nombre: string }[]
}) {
  const [estado, accion, enviando] = useActionState(accionAsignar, SIN_ERROR)
  const hayError = estado.mensaje !== ''
  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="reclamo" value={reclamoId} />
      <div className="campo">
        <label htmlFor="responsable">Responsable</label>
        <select id="responsable" name="responsable" defaultValue={responsableId ?? ''} required>
          <option value="">Elegí quién lo atiende</option>
          {responsables.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="rubro">Rubro</label>
        <select id="rubro" name="rubro" defaultValue={rubroId ?? ''}>
          <option value="">Sin rubro</option>
          {rubros.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="proveedor">Proveedor</label>
        <select id="proveedor" name="proveedor" defaultValue={proveedorId ?? ''}>
          <option value="">Sin proveedor</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.razonSocial}
            </option>
          ))}
        </select>
      </div>
      {hayError && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}
      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Asignar'}
      </button>
    </form>
  )
}
