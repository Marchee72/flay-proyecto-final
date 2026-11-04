'use client'

import { useActionState, useEffect, useState } from 'react'

import { avisar } from '@/app/avisos'

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
  const [reglaMayoria, setReglaMayoria] = useState<'presentes' | 'totalidad'>(valores.reglaMayoria)
  const [anticipacionDias, setAnticipacionDias] = useState(String(valores.anticipacionDias))
  const [topeApoderado, setTopeApoderado] = useState(String(valores.topeApoderado))
  const [umbralSinVoto, setUmbralSinVoto] = useState(String(valores.umbralSinVoto))

  // El rechazo queda escrito junto al formulario; el toast es solo para el éxito (nota 25).
  useEffect(() => {
    if (estado.ok) avisar(estado.mensaje, 'exito')
  }, [estado])

  return (
    <form action={accion} className="tarjeta configuracion-asamblea" noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <fieldset className="configuracion-asamblea__mayoria">
        <legend>Cómo se cuenta la mayoría</legend>
        <label className="configuracion-asamblea__opcion">
          <input
            type="radio"
            name="reglaMayoria"
            value="presentes"
            checked={reglaMayoria === 'presentes'}
            onChange={() => setReglaMayoria('presentes')}
          />
          <span>
            <strong>Sobre los presentes (reglamento)</strong>
            La decisión queda firme al cerrar el punto.
          </span>
        </label>
        <label className="configuracion-asamblea__opcion">
          <input
            type="radio"
            name="reglaMayoria"
            value="totalidad"
            checked={reglaMayoria === 'totalidad'}
            onChange={() => setReglaMayoria('totalidad')}
          />
          <span>
            <strong>Sobre el total de propietarios (CCyC art. 2060)</strong>
            Lo que aprueban solo los presentes queda provisorio y los ausentes tienen 15 días para
            oponerse.
          </span>
        </label>
      </fieldset>
      <div className="configuracion-asamblea__numeros">
        <div className="campo">
          <label htmlFor="anticipacionDias">Anticipación mínima de la convocatoria (días)</label>
          <input
            id="anticipacionDias"
            name="anticipacionDias"
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={anticipacionDias}
            onChange={(e) => setAnticipacionDias(e.target.value)}
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
            value={topeApoderado}
            onChange={(e) => setTopeApoderado(e.target.value)}
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
            value={umbralSinVoto}
            onChange={(e) => setUmbralSinVoto(e.target.value)}
          />
        </div>
      </div>
      {estado.mensaje && !estado.ok && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}
      <div className="configuracion-asamblea__pie">
        <button className="boton boton--primario" type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
