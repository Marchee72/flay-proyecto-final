'use client'

import { useActionState } from 'react'

import { accionPublicarNovedad, type Resultado } from '../comunicacion/acciones'
import { BotonModal } from '../modal'

const SIN_ERROR: Resultado = { mensaje: '' }

/** Publicacion de una novedad en modal (`CU-12`). */
export function ModalNovedad({ consorcioId }: { consorcioId: string }) {
  return (
    <BotonModal etiqueta="Publicar novedad" titulo="Publicar una novedad">
      <FormularioNovedad consorcioId={consorcioId} />
    </BotonModal>
  )
}

function FormularioNovedad({ consorcioId }: { consorcioId: string }) {
  const [estado, accion, enviando] = useActionState(accionPublicarNovedad, SIN_ERROR)
  const hayError = estado.mensaje !== ''
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
          aria-describedby={hayError ? 'error-novedad' : undefined}
        />
      </div>
      <div className="campo">
        <label htmlFor="cuerpo">Texto</label>
        <textarea id="cuerpo" name="cuerpo" rows={5} required />
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
      <p className="ayuda">Cada consorcista habilitado recibe un aviso por correo.</p>
    </form>
  )
}
