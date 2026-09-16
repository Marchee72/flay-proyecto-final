'use client'

import { put } from '@vercel/blob/client'
import { useRouter } from 'next/navigation'
import { useRef, useState, type ReactNode } from 'react'
import { BadgeCheck, CloudUpload, FileText, TriangleAlert, X } from 'lucide-react'

import { pesoParaMostrar } from '@/compartido/formato'

/**
 * Subida directa reutilizable (guia § 3.4): el archivo va del navegador al
 * almacen con un permiso de corta duracion, y recien despues se confirma con
 * la accion que recibe la clave y el resto del formulario. Misma mecanica que
 * el comprobante de 002 (`adjuntar.tsx`), generalizada para documentos y
 * comprobantes sueltos (`004-servicios` T058).
 *
 * La zona de arrastre es la etiqueta del `<input type=file>`, que sigue
 * adentro oculto: soltar, hacer clic o llegar con el teclado abren el mismo
 * selector. El archivo elegido se ve (nombre y peso) antes de subir, y la
 * subida muestra la magnitud exacta (RNF-10).
 */
export function SubidaDirecta({
  consorcioId,
  prefijo,
  accept,
  objeto,
  ayuda,
  etiquetaBoton,
  children,
  confirmar,
  exito,
}: {
  consorcioId: string
  prefijo: 'documentos' | 'extracciones'
  accept: string
  /** Lo que se arrastra: «el comprobante», «el documento». */
  objeto: string
  /** Formatos y tope, debajo de la invitacion. */
  ayuda: string
  etiquetaBoton: string
  /** Campos adicionales del formulario, que viajan a `confirmar` junto con la clave. */
  children?: ReactNode
  confirmar: (datos: FormData) => Promise<{ mensaje: string; destino?: string }>
  /** Si la confirmacion no navega, esto se anuncia y el formulario queda listo para el siguiente. */
  exito?: string
}) {
  const [mensaje, setMensaje] = useState('')
  const [logrado, setLogrado] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [progreso, setProgreso] = useState<{ cargado: number; total: number } | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const entrada = useRef<HTMLInputElement | null>(null)
  const router = useRouter()
  const id = `archivo-${prefijo}`

  function elegir(lista: FileList | null) {
    const elegido = lista?.[0]
    setArchivo(elegido && elegido.size > 0 ? elegido : null)
    setMensaje('')
    setLogrado(false)
  }

  function quitar() {
    if (entrada.current) entrada.current.value = ''
    setArchivo(null)
  }

  function soltar(evento: React.DragEvent<HTMLLabelElement>) {
    evento.preventDefault()
    setArrastrando(false)
    if (!entrada.current || evento.dataTransfer.files.length === 0) return
    // El `FileList` soltado pasa a ser el del input: el envio lo lee de ahi.
    entrada.current.files = evento.dataTransfer.files
    elegir(entrada.current.files)
  }

  async function subir(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    // `currentTarget` no sobrevive al primer `await`: se retiene para el reset.
    const elemento = evento.currentTarget
    const formulario = new FormData(elemento)
    if (!archivo) {
      setMensaje('Falta el archivo.')
      return
    }
    setSubiendo(true)
    setMensaje('')
    setLogrado(false)
    setProgreso({ cargado: 0, total: archivo.size })
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
        onUploadProgress: ({ loaded, total }) => setProgreso({ cargado: loaded, total }),
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
      if (resultado.destino) {
        router.push(resultado.destino)
        return
      }
      // El selector queda vacio: `formulario.delete` limpio el FormData, no el <input>.
      elemento.reset()
      setArchivo(null)
      setLogrado(true)
      router.refresh()
    } catch {
      setMensaje('La subida no terminó. Revisá la conexión y probá de nuevo.')
    } finally {
      setSubiendo(false)
      setProgreso(null)
    }
  }

  return (
    <form onSubmit={subir} noValidate>
      {children}
      <label
        htmlFor={id}
        className={`zona-soltar${arrastrando ? ' zona-soltar--activa' : ''}`}
        onDragOver={(evento) => {
          evento.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={soltar}
      >
        <input
          id={id}
          ref={entrada}
          name="archivo"
          type="file"
          accept={accept}
          required
          className="oculto"
          onChange={(evento) => elegir(evento.target.files)}
        />
        <CloudUpload aria-hidden="true" />
        {arrastrando ? (
          <span>Soltá para elegirlo</span>
        ) : (
          <span>
            {/* En telefono no se arrastra: el selector nativo ya ofrece la camara. */}
            <span className="solo-escritorio">Arrastrá {objeto} acá o </span>
            <span className="solo-telefono">
              {accept.includes('image/') ? 'Sacá una foto o ' : ''}
            </span>
            <u>elegí un archivo</u>
          </span>
        )}
        <span className="ayuda">{ayuda}</span>
      </label>

      {archivo && (
        <div className="archivo-elegido">
          <FileText className="icono apagado" aria-hidden="true" />
          <span className="archivo-elegido__nombre">{archivo.name}</span>
          <span className="ayuda">{pesoParaMostrar(archivo.size)}</span>
          {!subiendo && (
            <button
              type="button"
              className="boton boton--cerrar"
              onClick={quitar}
              aria-label="Quitar el archivo"
            >
              <X className="icono" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {progreso && (
        <div className="progreso" role="status">
          <div className="progreso__barra">
            <div
              className="progreso__relleno"
              style={{ width: `${Math.round((progreso.cargado / progreso.total) * 100)}%` }}
            />
          </div>
          <span className="progreso__texto">
            Subiendo… {pesoParaMostrar(progreso.cargado)} de {pesoParaMostrar(progreso.total)}
          </span>
        </div>
      )}

      {mensaje && (
        <p className="error" role="alert">
          <TriangleAlert className="icono" aria-hidden="true" /> {mensaje}
        </p>
      )}
      {logrado && exito && (
        <p className="aviso aviso--exito" role="status">
          <BadgeCheck className="icono" aria-hidden="true" />
          <span>{exito}</span>
        </p>
      )}
      <button className="boton boton--primario" type="submit" disabled={subiendo}>
        {subiendo ? 'Subiendo…' : etiquetaBoton}
      </button>
    </form>
  )
}
