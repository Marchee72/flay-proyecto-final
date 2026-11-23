'use client'

import { useActionState, useState } from 'react'
import { Send } from 'lucide-react'

import type { Registrado } from '@/aplicacion/identidad/registrados'
import { errorDeCorreo } from '@/aplicacion/identidad/correo-reglas'

import { BotonModal } from '../../../modal'
import { TablaDesplazable } from '../../../tabla-desplazable'
import { BotonEnviar } from '../asambleas/[asamblea]/boton-enviar'
import { accionInvitarRegistrado, accionInvitarRegistrados, type Resultado } from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

/**
 * Quienes ocupan una unidad y no tienen acceso a este consorcio (RF-03).
 * Importar registra, no invita: el acceso se da acá, a propósito. Con el
 * consorcio archivado la lista se ve, pero sin los controles.
 */
export function RegistradosSinAcceso({
  consorcioId,
  registrados,
  puedeInvitar,
}: {
  consorcioId: string
  registrados: Registrado[]
  puedeInvitar: boolean
}) {
  if (registrados.length === 0) return null
  const conCorreo = registrados.some((r) => r.correo !== null)

  return (
    <section aria-labelledby="titulo-registrados">
      <h2 id="titulo-registrados">Registrados sin acceso</h2>
      <p className="apagado">Ocupan una unidad pero todavía no pueden entrar a este consorcio.</p>

      {puedeInvitar && conCorreo && (
        <form action={accionInvitarRegistrados} className="fila-acciones">
          <input type="hidden" name="consorcio" value={consorcioId} />
          <BotonEnviar
            texto="Invitar a todos los que tienen correo"
            enviando="Invitando…"
            clase="boton boton--fantasma"
          />
        </form>
      )}

      <TablaDesplazable tabIndex={0} role="region" aria-label="Registrados sin acceso">
        <table>
          <caption className="ayuda">Personas que ocupan una unidad y no tienen acceso</caption>
          <thead>
            <tr>
              <th scope="col">Persona</th>
              <th scope="col">DNI</th>
              <th scope="col">Correo</th>
              <th scope="col">Unidades</th>
              {puedeInvitar && <th scope="col">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {registrados.map((r) => (
              <tr key={r.personaId}>
                <td>{r.nombre}</td>
                <td>{r.dni ?? '—'}</td>
                <td>{r.correo ?? '—'}</td>
                <td>{r.unidades.map((u) => `${u.designacion} · ${u.tipo}`).join(', ')}</td>
                {puedeInvitar && (
                  <td>
                    <BotonModal
                      etiqueta={
                        <>
                          <Send className="icono" aria-hidden="true" />
                          Invitar
                        </>
                      }
                      nombre={`Invitar a ${r.nombre}`}
                      titulo={`Invitar a ${r.nombre}`}
                      variante="boton--fantasma"
                    >
                      <FormularioInvitarRegistrado consorcioId={consorcioId} registrado={r} />
                    </BotonModal>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TablaDesplazable>
    </section>
  )
}

function FormularioInvitarRegistrado({
  consorcioId,
  registrado,
}: {
  consorcioId: string
  registrado: Registrado
}) {
  const [estado, accion, enviando] = useActionState(accionInvitarRegistrado, SIN_ERROR)
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null)
  const hayError = estado.mensaje !== ''
  // Un diálogo por fila: los ids llevan la persona para no repetirse en la página.
  const idDe = (campo: string) => `${campo}-${registrado.personaId}`
  const pideCorreo = registrado.correo === null

  return (
    <form action={accion} noValidate>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="persona" value={registrado.personaId} />

      {pideCorreo ? (
        <div className="campo">
          <label htmlFor={idDe('correo')}>Correo electrónico</label>
          <input
            id={idDe('correo')}
            name="correo"
            type="email"
            defaultValue={estado.valores?.correo}
            required
            autoComplete="off"
            aria-invalid={hayError || errorCorreo !== null || undefined}
            aria-describedby={[
              errorCorreo ? idDe('error-correo') : hayError ? idDe('error-invitar') : '',
              idDe('ayuda-correo'),
            ]
              .filter(Boolean)
              .join(' ')}
            onChange={(e) =>
              setErrorCorreo(e.target.value === '' ? null : errorDeCorreo(e.target.value))
            }
            onBlur={(e) => setErrorCorreo(errorDeCorreo(e.target.value))}
          />
          {errorCorreo && (
            <p className="error" id={idDe('error-correo')}>
              {errorCorreo}
            </p>
          )}
          <p className="ayuda" id={idDe('ayuda-correo')}>
            No tiene correo cargado: queda guardado y ahí va el enlace para fijar la contraseña.
          </p>
        </div>
      ) : registrado.tieneUsuario ? (
        <p>Ya tiene cuenta en Flay: le damos acceso a este consorcio, sin correo de invitación.</p>
      ) : (
        <p>Le mandamos a {registrado.correo} el enlace para fijar la contraseña.</p>
      )}

      {hayError && (
        <p className="error" id={idDe('error-invitar')} role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? 'Invitando…' : 'Invitar'}
      </button>
    </form>
  )
}
