'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BadgeCheck, Bell, Siren, X } from 'lucide-react'

import { HECHO } from './aviso-en-url'

export type Tono = 'exito' | 'problema' | 'novedad'

type Aviso = {
  id: number
  texto: string
  tono: Tono
  accion?: { etiqueta: string; alHacerClic: () => void }
}

const TEXTOS: Record<string, string | undefined> = HECHO

const TONOS: Record<Tono, { clase: string; Icono: typeof Bell }> = {
  exito: { clase: 'aviso-tono--verde', Icono: BadgeCheck },
  problema: { clase: 'aviso-tono--rojo', Icono: Siren },
  novedad: { clase: 'aviso-tono--azul', Icono: Bell },
}

const DURACION_MS = 8000

let ultimo = 0
const oyentes = new Set<(aviso: Aviso) => void>()

/**
 * Avisar desde un componente cliente que no navega: las subidas de archivo y la
 * campana. Es un emisor de modulo a proposito, no un contexto: asi se importa
 * desde cualquier componente cliente sin envolver el arbol.
 *
 * Lo que sale de una Server Action no pasa por aca: viaja en la direccion
 * (`?hecho=` / `?error=`) y lo levanta `PilaDeAvisos`.
 */
export function avisar(texto: string, tono: Tono = 'exito', accion?: Aviso['accion']): void {
  const aviso: Aviso = { id: ++ultimo, texto, tono, ...(accion ? { accion } : {}) }
  oyentes.forEach((oyente) => oyente(aviso))
}

/**
 * La unica pila de avisos de la aplicacion, abajo a la derecha. Se monta una
 * sola vez en el layout raiz, asi tambien alcanza a la landing y al ingreso.
 *
 * Lo que es resultado de una accion sale por aca y se va; lo que describe el
 * estado de la pantalla —«el periodo esta abierto», «esta liquidacion fue
 * anulada»— o le dice a un campo que le falta sigue siendo un `.aviso` o un
 * `.error` dentro de la pagina, porque tiene que seguir ahi despues de leerse.
 */
export function PilaDeAvisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const consulta = useSearchParams().toString()

  const cerrar = useCallback((id: number) => {
    setAvisos((previos) => previos.filter((aviso) => aviso.id !== id))
  }, [])

  const agregar = useCallback(
    (aviso: Aviso) => {
      setAvisos((previos) => [...previos, aviso])
      // El exito se va solo a los 8 s, como el aviso de la campana. El problema
      // queda hasta que se lo cierra: hay que poder leerlo dos veces.
      if (aviso.tono !== 'problema') setTimeout(() => cerrar(aviso.id), DURACION_MS)
    },
    [cerrar],
  )

  useEffect(() => {
    oyentes.add(agregar)
    return () => {
      oyentes.delete(agregar)
    }
  }, [agregar])

  // El resultado de una Server Action llega en la direccion. La dependencia es
  // la cadena y no el objeto: su identidad cambia en cada dibujado y el aviso
  // saldria repetido.
  //
  // El `?hecho=` se queda ahi, como se quedaba el `?registrado=1` que habia
  // antes. Sacarlo con `history.replaceState` pisa cualquier navegacion que el
  // router tenga en vuelo: Next vuelve a aplicar su URL y el arbol queda
  // suspendido con la pantalla en blanco. Pasa igual al mostrar el aviso que al
  // cerrarlo ocho segundos despues, porque el momento no se puede elegir desde
  // aca. Y `router.replace` pediria el arbol de servidor entero solo por sacar
  // un parametro.
  useEffect(() => {
    const dentro = new URLSearchParams(consulta)
    const problema = dentro.get('error')
    const clave = dentro.get('hecho')
    const texto = problema ?? (clave ? TEXTOS[clave] : undefined)
    if (!texto) return
    agregar({ id: ++ultimo, texto, tono: problema ? 'problema' : 'exito' })
  }, [consulta, agregar])

  // El contenedor se dibuja siempre: una region viva tiene que existir antes de
  // que le entre el texto para que el lector de pantalla lo anuncie.
  return (
    <div className="pila-avisos">
      {avisos.map((aviso) => {
        const { clase, Icono } = TONOS[aviso.tono]
        return (
          <div
            key={aviso.id}
            className="emergente"
            role={aviso.tono === 'problema' ? 'alert' : 'status'}
          >
            <span className={`aviso-tono ${clase}`}>
              <Icono className="icono" aria-hidden="true" />
            </span>
            <span className="emergente__texto">
              <strong>{aviso.texto}</strong>
            </span>
            {aviso.accion && (
              <button
                type="button"
                className="boton boton--terciario"
                onClick={() => {
                  cerrar(aviso.id)
                  aviso.accion?.alHacerClic()
                }}
              >
                {aviso.accion.etiqueta}
              </button>
            )}
            <button
              type="button"
              className="panel__icono"
              aria-label="Cerrar aviso"
              onClick={() => cerrar(aviso.id)}
            >
              <X className="icono" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
