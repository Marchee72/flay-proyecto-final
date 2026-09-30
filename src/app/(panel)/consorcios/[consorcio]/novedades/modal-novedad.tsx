'use client'

import { useActionState, useState } from 'react'

import { accionPublicarNovedad, type Resultado } from '../../../comunicacion/acciones'
import { BotonModal } from '../../../modal'

const SIN_ERROR: Resultado = { mensaje: '' }

export interface Destinatarios {
  unidades: { id: string; designacion: string }[]
  divisiones: string[]
  pisos: string[]
}

/** Publicacion de una novedad en modal (`CU-12`): a quien va y entre que fechas rige. */
export function ModalNovedad({
  consorcioId,
  hoy,
  enUnMes,
  destinatarios,
}: {
  consorcioId: string
  hoy: string
  enUnMes: string
  destinatarios: Destinatarios
}) {
  return (
    <BotonModal etiqueta="Publicar novedad" titulo="Publicar una novedad">
      <FormularioNovedad
        consorcioId={consorcioId}
        hoy={hoy}
        enUnMes={enUnMes}
        destinatarios={destinatarios}
      />
    </BotonModal>
  )
}

function FormularioNovedad({
  consorcioId,
  hoy,
  enUnMes,
  destinatarios,
}: {
  consorcioId: string
  hoy: string
  enUnMes: string
  destinatarios: Destinatarios
}) {
  const [estado, accion, enviando] = useActionState(accionPublicarNovedad, SIN_ERROR)
  const [alcance, setAlcance] = useState<'general' | 'unidad' | 'division' | 'piso'>('general')
  const hayError = estado.mensaje !== ''
  const describe = hayError ? 'error-novedad' : undefined
  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <div className="campo">
        <label htmlFor="titulo">Título</label>
        <input
          id="titulo"
          name="titulo"
          maxLength={140}
          required
          aria-invalid={hayError || undefined}
          aria-describedby={describe}
        />
      </div>
      <div className="campo">
        <label htmlFor="cuerpo">Texto</label>
        <textarea id="cuerpo" name="cuerpo" rows={5} required />
      </div>
      <div className="campo">
        <label htmlFor="severidad">Severidad</label>
        <select id="severidad" name="severidad" defaultValue="baja">
          <option value="baja">Baja</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
        </select>
      </div>
      <div className="campo">
        <label htmlFor="alcance">Para</label>
        <select
          id="alcance"
          name="alcance"
          value={alcance}
          onChange={(e) => setAlcance(e.target.value as typeof alcance)}
        >
          <option value="general">Todo el consorcio</option>
          <option value="unidad">Una unidad</option>
          {destinatarios.divisiones.length > 0 && <option value="division">Una división</option>}
          {destinatarios.pisos.length > 0 && <option value="piso">Un piso</option>}
        </select>
      </div>
      {alcance === 'unidad' && (
        <div className="campo">
          <label htmlFor="unidad">Unidad</label>
          <select id="unidad" name="unidad" required aria-describedby={describe}>
            {destinatarios.unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.designacion}
              </option>
            ))}
          </select>
        </div>
      )}
      {alcance === 'division' && (
        <div className="campo">
          <label htmlFor="division">División</label>
          <select id="division" name="division" required aria-describedby="ayuda-division">
            {destinatarios.divisiones.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <p className="ayuda" id="ayuda-division">
            Los departamentos con esa letra en todos los pisos (por ejemplo, 1A, 2A, 3A).
          </p>
        </div>
      )}
      {alcance === 'piso' && (
        <div className="campo">
          <label htmlFor="piso">Piso</label>
          <select id="piso" name="piso" required aria-describedby="ayuda-piso">
            {destinatarios.pisos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <p className="ayuda" id="ayuda-piso">
            Todos los departamentos de ese piso (por ejemplo, 3A, 3B, 3C).
          </p>
        </div>
      )}
      <div className="campo">
        <label htmlFor="desde">Se muestra desde</label>
        <input id="desde" name="desde" type="date" defaultValue={hoy} required />
      </div>
      <div className="campo">
        <label htmlFor="hasta">Hasta</label>
        <input
          id="hasta"
          name="hasta"
          type="date"
          defaultValue={enUnMes}
          min={hoy}
          required
          aria-describedby="ayuda-hasta"
        />
        <p className="ayuda" id="ayuda-hasta">
          Después de esa fecha deja de aparecer en Novedades y en el inicio.
        </p>
      </div>
      <div className="campo">
        <label>
          <input type="checkbox" name="fijada" /> Fijar arriba del listado
        </label>
      </div>
      {hayError && (
        <p className="error" id="error-novedad" role="alert">
          {estado.mensaje}
        </p>
      )}
      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Publicando…' : 'Publicar'}
      </button>
      <p className="ayuda">Cada destinatario habilitado recibe un aviso por correo.</p>
    </form>
  )
}
