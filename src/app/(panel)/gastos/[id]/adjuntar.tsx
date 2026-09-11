'use client'

import { put } from '@vercel/blob/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'

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
  const [subido, setSubido] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const router = useRouter()

  async function subir(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const archivo = new FormData(evento.currentTarget).get('archivo')

    if (!(archivo instanceof File) || archivo.size === 0) {
      setSubido(false)
      setMensaje('Falta el archivo: seleccionar un comprobante para subir.')
      return
    }

    setSubiendo(true)
    setSubido(false)
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
        setSubido(false)
        setMensaje(cuerpo.mensaje ?? 'No se pudo preparar la subida.')
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
      setSubido(!confirmacion.mensaje)
      // Sin recarga completa: se revalida el detalle (Server Component) para
      // mostrar el comprobante nuevo y se anuncia con `role="status"`.
      if (!confirmacion.mensaje) router.refresh()
    } catch {
      // Si la confirmacion no llegó, el trabajo pendiente la reintenta (FR-006b).
      setSubido(false)
      setMensaje('La subida falló. Volver a intentar; el gasto ya quedó registrado.')
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

      {mensaje &&
        (subido ? (
          <p className="aviso aviso--atencion" role="status">
            <TriangleAlert className="icono" aria-hidden="true" />
            <span>{mensaje}</span>
          </p>
        ) : (
          <p className="error" role="alert">
            {mensaje}
          </p>
        ))}

      <button className="boton boton--primario" type="submit" disabled={subiendo}>
        {subiendo ? 'Subiendo…' : 'Subir comprobante'}
      </button>
    </form>
  )
}
