'use client'

import { useActionState } from 'react'
import { Check, Key, Loader2, ShieldCheck } from 'lucide-react'

import { BotonModal } from '../../../modal'
import { accionGuardarCredencialesPago, type Resultado } from './acciones'

const SIN_ERROR: Resultado = { mensaje: '' }

interface PropsModalPasarela {
  consorcioId: string
  configurada: boolean
  ultimosCuatro?: string
}

export function ModalConfiguracionPasarela({
  consorcioId,
  configurada,
  ultimosCuatro,
}: PropsModalPasarela) {
  const etiqueta = configurada ? (
    <>
      <ShieldCheck className="icono" aria-hidden="true" />
      <span>Pasarela configurada (••••{ultimosCuatro})</span>
    </>
  ) : (
    <>
      <Key className="icono" aria-hidden="true" />
      <span>Configurar pasarela de pagos</span>
    </>
  )

  return (
    <BotonModal
      etiqueta={etiqueta}
      titulo="Configuración de pasarela de pagos (Mercado Pago)"
      variante="boton--fantasma"
    >
      <FormularioCredenciales
        consorcioId={consorcioId}
        configurada={configurada}
        ultimosCuatro={ultimosCuatro}
      />
    </BotonModal>
  )
}

function FormularioCredenciales({
  consorcioId,
  configurada,
  ultimosCuatro,
}: {
  consorcioId: string
  configurada: boolean
  ultimosCuatro?: string
}) {
  const [estado, accion, enviando] = useActionState(accionGuardarCredencialesPago, SIN_ERROR)
  const hayError = estado.mensaje !== ''

  return (
    <form action={accion} noValidate className="formulario-credenciales">
      <input type="hidden" name="consorcio" value={consorcioId} />

      {configurada && (
        <p className="aviso aviso--exito" role="status">
          <Check className="icono" aria-hidden="true" />
          <span>
            La pasarela ya se encuentra activa con credenciales vigentes (terminadas en ••••
            {ultimosCuatro}). Puedes ingresar nuevas credenciales para actualizarlas.
          </span>
        </p>
      )}

      <div className="campo">
        <label htmlFor="accessToken">Access Token (Producción o Sandbox)</label>
        <input
          id="accessToken"
          name="accessToken"
          type="password"
          placeholder="TEST-... o APP_USR-..."
          required
          autoComplete="off"
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-credenciales ayuda-token' : 'ayuda-token'}
        />
        <p className="ayuda" id="ayuda-token">
          Credencial privada provista por Mercado Pago Developers. Se almacena con cifrado simétrico
          AES-256-GCM.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="secretoWebhook">Clave secreta de Webhook</label>
        <input
          id="secretoWebhook"
          name="secretoWebhook"
          type="password"
          placeholder="Secreto de firma de notificaciones"
          required
          autoComplete="off"
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? 'error-credenciales ayuda-webhook' : 'ayuda-webhook'}
        />
        <p className="ayuda" id="ayuda-webhook">
          Clave secreta utilizada para validar la firma digital HMAC-SHA256 de los webhooks de pago.
        </p>
      </div>

      {hayError && (
        <p className="error" id="error-credenciales" role="alert">
          {estado.mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={enviando}>
        {enviando ? (
          <>
            <Loader2 className="icono icono--girando" aria-hidden="true" />
            <span>Guardando credenciales…</span>
          </>
        ) : (
          'Guardar credenciales'
        )}
      </button>
    </form>
  )
}
