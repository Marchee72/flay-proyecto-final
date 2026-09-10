'use client'

import { useActionState } from 'react'

import { accionRegistrarGasto } from '../acciones'

const SIN_ERROR = { mensaje: '' }

export interface Opcion {
  id: string
  etiqueta: string
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
  periodos,
  rubros,
  proveedores,
  precargado,
}: {
  consorcioId: string
  periodos: readonly Opcion[]
  rubros: readonly Opcion[]
  proveedores: readonly Opcion[]
  precargado: Readonly<Record<string, string>>
}) {
  const [estado, accion, enviando] = useActionState(accionRegistrarGasto, SIN_ERROR)

  const marca = (campo: string) =>
    precargado[campo] ? <span className="etiqueta-precargado">Precargado — revisalo</span> : null

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />

      <div className="campo">
        <label htmlFor="periodo">Período</label>
        <select id="periodo" name="periodo" defaultValue={precargado.periodo ?? ''} required>
          {periodos.map((periodo) => (
            <option key={periodo.id} value={periodo.id}>
              {periodo.etiqueta}
            </option>
          ))}
        </select>
        <p className="ayuda">Sólo se listan los períodos abiertos: el resto no admite gastos.</p>
      </div>

      <div className="campo">
        <label htmlFor="rubro">Rubro</label>
        {marca('rubro')}
        <select id="rubro" name="rubro" defaultValue={precargado.rubro ?? ''} required>
          {rubros.map((rubro) => (
            <option key={rubro.id} value={rubro.id}>
              {rubro.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="proveedor">Proveedor</label>
        {marca('proveedor')}
        <select id="proveedor" name="proveedor" defaultValue={precargado.proveedor ?? ''}>
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
        />
        <p className="ayuda">Con punto decimal y hasta dos decimales. Sin separador de miles.</p>
      </div>

      <div className="campo">
        <label htmlFor="fecha">Fecha</label>
        {marca('fecha')}
        <input id="fecha" name="fecha" type="date" defaultValue={precargado.fecha ?? ''} required />
      </div>

      <div className="campo">
        <label htmlFor="descripcion">Descripción</label>
        {marca('descripcion')}
        <input id="descripcion" name="descripcion" defaultValue={precargado.descripcion ?? ''} />
      </div>

      {estado.mensaje && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Registrando…' : 'Registrar gasto'}
      </button>
    </form>
  )
}
