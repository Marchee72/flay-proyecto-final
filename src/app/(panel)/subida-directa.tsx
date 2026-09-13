'use client'

import { put } from '@vercel/blob/client'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'

/**
 * Subida directa reutilizable (guia § 3.4): el archivo va del navegador al
 * almacen con un permiso de corta duracion, y recien despues se confirma con
 * la accion que recibe la clave y el resto del formulario. Misma mecanica que
 * el comprobante de 002 (`adjuntar.tsx`), generalizada para documentos y
 * comprobantes sueltos (`004-servicios` T058).
 */
export function SubidaDirecta({
  consorcioId,
  prefijo,
  accept,
  etiquetaArchivo,
  etiquetaBoton,
  children,
  confirmar,
}: {
  consorcioId: string
  prefijo: 'documentos' | 'extracciones'
  accept: string
  etiquetaArchivo: string
  etiquetaBoton: string
  /** Campos adicionales del formulario, que viajan a `confirmar` junto con la clave. */
  children?: ReactNode
  confirmar: (datos: FormData) => Promise<{ mensaje: string; destino?: string }>
}) {
  const [mensaje, setMensaje] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const router = useRouter()

  async function subir(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const formulario = new FormData(evento.currentTarget)
    const archivo = formulario.get('archivo')
    if (!(archivo instanceof File) || archivo.size === 0) {
      setMensaje('Falta el archivo.')
      return
    }
    setSubiendo(true)
    setMensaje('')
    try {
      const respuesta = await fetch('/api/objetos/permiso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          consorcio: consorcioId,
          prefijo,
          tipoContenido: archivo.type,
          bytes: archivo.size,
          nombre: archivo.name,
        }),
      })
      const cuerpo = await respuesta.json()
      if (!respuesta.ok) {
        setMensaje(cuerpo.mensaje ?? 'No se pudo preparar la subida.')
        return
      }
      await put(cuerpo.clave, archivo, {
        access: 'public',
        token: cuerpo.credencial,
        contentType: archivo.type,
      })
      formulario.delete('archivo')
      formulario.set('consorcio', consorcioId)
      formulario.set('clave', cuerpo.clave)
      formulario.set('tipoContenido', archivo.type)
      const resultado = await confirmar(formulario)
      if (resultado.mensaje) {
        setMensaje(resultado.mensaje)
        return
      }
      if (resultado.destino) router.push(resultado.destino)
      else router.refresh()
    } catch {
      setMensaje('La subida no terminó. Revisá la conexión y probá de nuevo.')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <form onSubmit={subir} noValidate>
      {children}
      <div className="campo">
        <label htmlFor={`archivo-${prefijo}`}>{etiquetaArchivo}</label>
        <input id={`archivo-${prefijo}`} name="archivo" type="file" accept={accept} required />
      </div>
      {mensaje && (
        <p className="error" role="alert">
          <TriangleAlert className="icono" aria-hidden="true" /> {mensaje}
        </p>
      )}
      <button className="boton boton--primario" type="submit" disabled={subiendo}>
        {subiendo ? 'Subiendo…' : etiquetaBoton}
      </button>
    </form>
  )
}
