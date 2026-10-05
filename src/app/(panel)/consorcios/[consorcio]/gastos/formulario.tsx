'use client'

import { useActionState, useState, type ReactNode } from 'react'

import { accionRegistrarGasto } from './acciones'

const SIN_ERROR = { mensaje: '' }

export interface Opcion {
  id: string
  etiqueta: string
}

/** El rubro lleva su clasificacion para poder proponerla (regla RN-04). */
export interface OpcionRubro extends Opcion {
  clasificacion: 'ordinario' | 'extraordinario'
}

/**
 * Alta de gasto con **valores precargados** (FR-020, Principio IV).
 *
 * Esta es la costura de `RF-06`: en `004-servicios` la extraccion del
 * comprobante va a llenar estos mismos parametros y la pantalla no se rediseña.
 * Cada campo que viene precargado se marca como tal y el gasto no existe hasta
 * que una persona aprieta el boton (regla RN-14): ninguna salida automatica
 * impacta un dato economico sin confirmacion humana.
 */
export function FormularioGasto({
  consorcioId,
  mesActual,
  rubros,
  proveedores,
  precargado,
  extraccionId,
  accionesExtra,
}: {
  consorcioId: string
  /** `YYYY-MM` de hoy: el mes al que se imputa si nadie elige otro. */
  mesActual: string
  rubros: readonly OpcionRubro[]
  proveedores: readonly Opcion[]
  precargado: Readonly<Record<string, string>>
  /** Con extraccion, confirmar crea el gasto **y** ata el comprobante (`004-servicios` RF-06). */
  extraccionId?: string
  /** Otras acciones del mismo pie (descartar la extraccion): al lado de registrar, nunca abajo. */
  accionesExtra?: ReactNode
}) {
  const [estado, accion, enviando] = useActionState(accionRegistrarGasto, SIN_ERROR)
  const hayError = estado.mensaje !== ''

  // La clasificacion la propone el rubro y la puede corregir quien carga: al
  // cambiar de rubro vuelve a la suya, porque es lo que acierta casi siempre
  // (regla RN-04). Lo que se guarda queda congelado en el gasto.
  const rubroInicial = precargado.rubro || (rubros[0]?.id ?? '')
  const [rubroElegido, setRubroElegido] = useState(rubroInicial)
  const deRubro = (id: string) =>
    rubros.find((rubro) => rubro.id === id)?.clasificacion ?? 'ordinario'
  const [clasificacion, setClasificacion] = useState(
    precargado.clasificacion ?? deRubro(rubroInicial),
  )

  const marca = (campo: string) =>
    precargado[campo] ? (
      <span className="etiqueta-precargado">Precargado: revisar antes de confirmar</span>
    ) : null

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      {extraccionId && <input type="hidden" name="extraccion" value={extraccionId} />}

      <div className="campo">
        <label htmlFor="periodo">Período</label>
        <input
          id="periodo"
          name="periodo"
          type="month"
          defaultValue={precargado.periodo ?? mesActual}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-gasto ayuda-periodo' : 'ayuda-periodo'}
        />
        <p className="ayuda" id="ayuda-periodo">
          El mes de expensas al que se imputa. Si todavía no existe, se crea con este gasto.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="rubro">Rubro</label>
        {marca('rubro')}
        <select
          id="rubro"
          name="rubro"
          value={rubroElegido}
          onChange={(evento) => {
            setRubroElegido(evento.target.value)
            setClasificacion(deRubro(evento.target.value))
          }}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-gasto' : undefined}
        >
          {rubros.map((rubro) => (
            <option key={rubro.id} value={rubro.id}>
              {rubro.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="clasificacion">Clasificación</label>
        {marca('clasificacion')}
        <select
          id="clasificacion"
          name="clasificacion"
          value={clasificacion}
          onChange={(evento) =>
            setClasificacion(evento.target.value as OpcionRubro['clasificacion'])
          }
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-gasto ayuda-clasificacion' : 'ayuda-clasificacion'}
        >
          <option value="ordinario">Ordinario</option>
          <option value="extraordinario">Extraordinario</option>
        </select>
        <p className="ayuda" id="ayuda-clasificacion">
          La propone el rubro. Las ordinarias las paga el ocupante y las extraordinarias el
          propietario, así que conviene corregirla si este gasto no es lo habitual del rubro.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="proveedor">Proveedor</label>
        {marca('proveedor')}
        <select
          id="proveedor"
          name="proveedor"
          defaultValue={precargado.proveedor ?? ''}
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-gasto' : undefined}
        >
          <option value="">Sin proveedor</option>
          {proveedores.map((proveedor) => (
            <option key={proveedor.id} value={proveedor.id}>
              {proveedor.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="importe">Importe</label>
        {marca('importe')}
        <input
          id="importe"
          name="importe"
          className="cifra"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={precargado.importe ?? ''}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-gasto ayuda-importe' : 'ayuda-importe'}
        />
        <p className="ayuda" id="ayuda-importe">
          Con coma o punto decimal y hasta dos decimales, por ejemplo 12500,50.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="fecha">Fecha</label>
        {marca('fecha')}
        <input
          id="fecha"
          name="fecha"
          type="date"
          defaultValue={precargado.fecha ?? ''}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-gasto' : undefined}
        />
      </div>

      <div className="campo">
        <label htmlFor="descripcion">Descripción</label>
        {marca('descripcion')}
        <input
          id="descripcion"
          name="descripcion"
          defaultValue={precargado.descripcion ?? ''}
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-gasto' : undefined}
        />
      </div>

      {hayError && (
        <p className="error" id="error-gasto" role="alert">
          {estado.mensaje}
        </p>
      )}

      <div className="fila-acciones">
        <button className="boton boton--primario" type="submit" disabled={enviando}>
          {enviando ? 'Registrando…' : 'Registrar'}
        </button>
        {accionesExtra}
      </div>
    </form>
  )
}
