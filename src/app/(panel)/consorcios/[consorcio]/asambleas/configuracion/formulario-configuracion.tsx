'use client'

import { useActionState } from 'react'

import { accionGuardarConfiguracion, type Resultado } from '../acciones'

const SIN_RESULTADO: Resultado = { mensaje: '' }

/** Reglas de asamblea del consorcio (FR-035). Rigen para las próximas convocatorias. */
export function FormularioConfiguracion({
  consorcioId,
  valores,
}: {
  consorcioId: string
  valores: {
    reglaMayoria: 'presentes' | 'totalidad'
    anticipacionDias: number
    topeApoderado: number
    umbralSinVoto: number
  }
}) {
  const [estado, accion, enviando] = useActionState(accionGuardarConfiguracion, SIN_RESULTADO)
  return (
    <form action={accion} className="tarjeta" noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <fieldset className="campo">
        <legend>Cómo se cuenta la mayoría</legend>
        <label>
          <input
            type="radio"
            name="reglaMayoria"
            value="presentes"
            defaultChecked={valores.reglaMayoria === 'presentes'}
          />{' '}
          Sobre los presentes (reglamento): la decisión queda firme al cerrar el punto.
        </label>
        <label>
          <input
            type="radio"
            name="reglaMayoria"
            value="totalidad"
            defaultChecked={valores.reglaMayoria === 'totalidad'}
          />{' '}
          Sobre el total de propietarios (CCyC art. 2060): lo que aprueban solo los presentes queda
          provisorio y los ausentes tienen 15 días para oponerse.
        </label>
      </fieldset>
      <div className="campo">
        <label htmlFor="anticipacionDias">Anticipación mínima de la convocatoria (días)</label>
        <input
          id="anticipacionDias"
          name="anticipacionDias"
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          defaultValue={valores.anticipacionDias}
        />
      </div>
      <div className="campo">
        <label htmlFor="topeApoderado">Máximo de unidades por apoderado</label>
        <input
          id="topeApoderado"
          name="topeApoderado"
          type="number"
          inputMode="numeric"
          min={1}
          max={10}
          defaultValue={valores.topeApoderado}
        />
      </div>
      <div className="campo">
        <label htmlFor="umbralSinVoto">Pierde el voto quien adeuda más de (expensas)</label>
        <input
          id="umbralSinVoto"
          name="umbralSinVoto"
          type="number"
          inputMode="numeric"
          min={0}
          max={24}
          defaultValue={valores.umbralSinVoto}
        />
      </div>
      {estado.mensaje &&
        (estado.ok ? (
          <p className="aviso aviso--exito" role="status">
            {estado.mensaje}
          </p>
        ) : (
          <p className="error" role="alert">
            {estado.mensaje}
          </p>
        ))}
      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
