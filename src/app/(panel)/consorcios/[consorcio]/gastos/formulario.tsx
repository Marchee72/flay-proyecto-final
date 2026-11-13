'use client'

import { useActionState, useRef, type ReactNode } from 'react'

import { accionEditarGasto, accionRegistrarGasto, type Resultado } from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

export interface Opcion {
  id: string
  etiqueta: string
}

/** El rubro lleva su clasificacion para poder proponerla (regla RN-04). */
export interface OpcionRubro extends Opcion {
  clasificacion: 'ordinario' | 'extraordinario'
}

/** El gasto que se edita: el periodo no se toca (RF-04). */
export interface GastoAEditar {
  id: string
  rubroId: string
  clasificacion: 'ordinario' | 'extraordinario'
  proveedorId: string | null
  importe: string
  fecha: string
  descripcion: string
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
  gasto,
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
  /** Con `gasto` el formulario edita: sin periodo, y guarda por la accion de edicion. */
  gasto?: GastoAEditar
}) {
  const [estado, accion, enviando] = useActionState(
    gasto ? accionEditarGasto : accionRegistrarGasto,
    SIN_ERROR,
  )
  const hayError = estado.mensaje !== ''
  // Lo que se muestra de entrada: el gasto que se edita o lo precargado. Lo que
  // la persona tipeo y el servidor rechazo (`estado.valores`) gana sobre ambos.
  const base: Readonly<Record<string, string>> = gasto
    ? {
        rubro: gasto.rubroId,
        clasificacion: gasto.clasificacion,
        proveedor: gasto.proveedorId ?? '',
        importe: gasto.importe,
        fecha: gasto.fecha,
        descripcion: gasto.descripcion,
      }
    : precargado

  // La clasificacion la propone el rubro y la puede corregir quien carga: al
  // cambiar de rubro vuelve a la suya, porque es lo que acierta casi siempre
  // (regla RN-04). Lo que se guarda queda congelado en el gasto.
  const rubroInicial = estado.valores?.rubro ?? (base.rubro || (rubros[0]?.id ?? ''))
  const deRubro = (id: string) =>
    rubros.find((rubro) => rubro.id === id)?.clasificacion ?? 'ordinario'
  // No controlado, como todo desplegable que vuelve con `estado.valores`: el
  // reinicio del formulario de React 19 pisaria un `value` (ver la `key`).
  const clasificacionRef = useRef<HTMLSelectElement>(null)

  const marca = (campo: string) =>
    precargado[campo] ? (
      <span className="etiqueta-precargado">Precargado: revisar antes de confirmar</span>
    ) : null

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      {extraccionId && <input type="hidden" name="extraccion" value={extraccionId} />}
      {gasto && <input type="hidden" name="gasto" value={gasto.id} />}

      {!gasto && (
        <div className="campo">
          <label htmlFor="periodo">Período</label>
          <input
            id="periodo"
            name="periodo"
            type="month"
            defaultValue={estado.valores?.periodo ?? precargado.periodo ?? mesActual}
            required
            aria-invalid={hayError || undefined}
            aria-describedby={hayError ? 'error-gasto ayuda-periodo' : 'ayuda-periodo'}
          />
          <p className="ayuda" id="ayuda-periodo">
            El mes de expensas al que se imputa. Si todavía no existe, se crea con este gasto.
          </p>
        </div>
      )}

      <div className="campo">
        <label htmlFor="rubro">Rubro</label>
        {marca('rubro')}
        <select
          key={estado.valores?.rubro ?? 'inicial'}
          id="rubro"
          name="rubro"
          defaultValue={rubroInicial}
          onChange={(evento) => {
            if (clasificacionRef.current)
              clasificacionRef.current.value = deRubro(evento.target.value)
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
          key={estado.valores?.clasificacion ?? 'inicial'}
          ref={clasificacionRef}
          id="clasificacion"
          name="clasificacion"
          defaultValue={
            estado.valores?.clasificacion ?? base.clasificacion ?? deRubro(rubroInicial)
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
          key={estado.valores?.proveedor ?? 'inicial'}
          id="proveedor"
          name="proveedor"
          defaultValue={estado.valores?.proveedor ?? base.proveedor ?? ''}
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
          defaultValue={estado.valores?.importe ?? base.importe ?? ''}
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
          defaultValue={estado.valores?.fecha ?? base.fecha ?? ''}
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
          defaultValue={estado.valores?.descripcion ?? base.descripcion ?? ''}
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
          {gasto
            ? enviando
              ? 'Guardando…'
              : 'Guardar cambios'
            : enviando
              ? 'Registrando…'
              : 'Registrar'}
        </button>
        {accionesExtra}
      </div>
    </form>
  )
}
