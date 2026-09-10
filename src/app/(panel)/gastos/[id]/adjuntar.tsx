'use client'

import { put } from '@vercel/blob/client'
import { useState } from 'react'

import { accionConfirmarComprobante } from '../acciones'

/**
 * Subida directa del comprobante (FR-018b).
 *
 * El archivo va del navegador al almacenamiento y **no pasa por el servidor**:
 * la plataforma limita el cuerpo de un pedido muy por debajo de los 25 MB que
 * admite un comprobante. Lo que pasa por el servidor es el permiso, y la
 * verificacion de tipo y tamano ocurre ahi, antes de transferir un byte.
 */
export function AdjuntarComprobante({
  consorcioId,
  gastoId,
}: {
  consorcioId: string
  gastoId: string
}) {
  const [mensaje, setMensaje] = useState('')
  const [subiendo, setSubiendo] = useState(false)

  async function subir(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const archivo = new FormData(evento.currentTarget).get('archivo')

    if (!(archivo instanceof File) || archivo.size === 0) {
      setMensaje('Elegí un archivo.')
      return
    }

    setSubiendo(true)
    setMensaje('')

    try {
      const respuesta = await fetch('/api/comprobantes/permiso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          consorcio: consorcioId,
          gasto: gastoId,
          tipoContenido: archivo.type,
          bytes: archivo.size,
          nombre: archivo.name,
        }),
      })

      const cuerpo = await respuesta.json()

      // El rechazo llega antes de subir nada: 26 MB no viajan (SC-006c).
      if (!respuesta.ok) {
        setMensaje(cuerpo.mensaje ?? 'No pudimos preparar la subida.')
        return
      }

      await put(cuerpo.clave, archivo, {
        access: 'public',
        token: cuerpo.credencial,
        contentType: archivo.type,
      })

      const confirmacion = await accionConfirmarComprobante({
        consorcioId,
        gastoId,
        clave: cuerpo.clave,
      })

      setMensaje(confirmacion.mensaje || 'Comprobante subido.')
      if (!confirmacion.mensaje) location.reload()
    } catch {
      // Si la confirmacion no llegó, el trabajo pendiente la reintenta (FR-006b).
      setMensaje('La subida falló. Volvé a intentar; el gasto ya quedó registrado.')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <form onSubmit={subir}>
      <div className="campo">
        <label htmlFor="archivo">Comprobante</label>
        <input
          id="archivo"
          name="archivo"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/tiff"
        />
        <p className="ayuda">PDF, JPEG, PNG, WebP, HEIC o TIFF, hasta 25 MB.</p>
      </div>

      {mensaje && (
        <p className="error" role="alert">
          {mensaje}
        </p>
      )}

      <button className="boton boton--primario" type="submit" disabled={subiendo}>
        {subiendo ? 'Subiendo…' : 'Subir comprobante'}
      </button>
    </form>
  )
}
