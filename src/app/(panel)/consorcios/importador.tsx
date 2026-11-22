'use client'

import { startTransition, useActionState, useId, useState, type FormEvent } from 'react'
import { Download, FileUp, Info } from 'lucide-react'

import { plural } from '@/compartido/formato'
import type { ResultadoImportacion } from '@/aplicacion/importacion/importar-padron'

import { accionImportarPadron } from './acciones'
import { accionImportarOcupantes } from './[consorcio]/usuarios/acciones'
import { BotonModal } from '../modal'
import { TablaDesplazable } from '../tabla-desplazable'

export type EstadoImportacion = { mensaje: string; resultado?: ResultadoImportacion<unknown> }

const INICIAL: EstadoImportacion = { mensaje: '' }
const TOPE_DE_ERRORES = 50
// El servidor también lo rechaza; esto evita mandar algo que excede el cuerpo de la acción.
const MAX_BYTES = 500 * 1024

/**
 * Importar desde planilla (RF-02, RF-03): bajar la plantilla, elegir el
 * archivo, «Revisar» (lee y valida, no escribe) y «Confirmar» (relee,
 * revalida y escribe).
 *
 * React 19 vacía los campos de un `<form action>` al terminar la acción: con
 * eso, «Confirmar» llegaría sin archivo. Por eso el `File` vive en el estado y
 * el envío arma el `FormData` a mano dentro de una transición.
 */
export function Importador({
  accion,
  consorcioId,
  plantillaHref,
  titulo,
  textoConfirmar,
}: {
  accion: (previo: EstadoImportacion, datos: FormData) => Promise<EstadoImportacion>
  consorcioId: string
  plantillaHref: string
  titulo: string
  textoConfirmar: (resumen: unknown) => string
}) {
  const id = useId()
  const [archivo, setArchivo] = useState<File | null>(null)
  // El resultado es de un archivo: si se elige otro, el anterior ya no vale.
  const [enviadoCon, setEnviadoCon] = useState<File | null>(null)
  const [estado, despachar, enviando] = useActionState(accion, INICIAL)
  const [aviso, setAviso] = useState('')

  const vigente = enviadoCon !== null && enviadoCon === archivo
  const resultado = vigente ? estado.resultado : undefined
  const mensaje = aviso || (vigente ? estado.mensaje : '')
  const errores = resultado?.estado === 'errores' ? resultado.errores : []
  const hayError = mensaje !== '' || errores.length > 0

  const enviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const submitter = (evento.nativeEvent as SubmitEvent).submitter
    if (!archivo) return setAviso('Elegí un archivo .xlsx o .csv.')
    if (archivo.size > MAX_BYTES) return setAviso('El archivo pesa más de 500 KB.')
    setAviso('')
    const datos = new FormData()
    datos.set('archivo', archivo)
    datos.set('consorcio', consorcioId)
    if (submitter?.getAttribute('name') === 'confirmar') datos.set('confirmar', '1')
    setEnviadoCon(archivo)
    startTransition(() => despachar(datos))
  }

  const idError = `${id}-error`

  return (
    <form onSubmit={enviar} noValidate>
      <p>
        <a className="boton boton--fantasma" href={plantillaHref} download>
          <Download className="icono" aria-hidden="true" />
          Bajar plantilla
        </a>
      </p>

      <div className="campo">
        <label htmlFor={`${id}-archivo`}>{titulo}</label>
        <input
          id={`${id}-archivo`}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(evento) => {
            setArchivo(evento.target.files?.[0] ?? null)
            setAviso('')
          }}
          aria-invalid={hayError || undefined}
          aria-describedby={hayError ? `${idError} ${id}-ayuda` : `${id}-ayuda`}
        />
        <p className="ayuda" id={`${id}-ayuda`}>
          Excel (.xlsx) o CSV, hasta 500 KB. Todo o nada: con un solo error no se carga ninguna
          fila.
        </p>
      </div>

      <button
        className={`boton ${resultado?.estado === 'revisado' ? 'boton--fantasma' : 'boton--primario'}`}
        type="submit"
        disabled={enviando}
      >
        <FileUp className="icono" aria-hidden="true" />
        {enviando ? 'Revisando…' : 'Revisar'}
      </button>

      {resultado?.estado === 'revisado' && (
        <>
          <p className="aviso">
            <Info className="icono" aria-hidden="true" />
            <span>{textoConfirmar(resultado.resumen)}</span>
          </p>
          <TablaDesplazable tabIndex={0} role="region" aria-label="Vista previa de la importación">
            <table>
              <caption className="ayuda">Vista previa: así se va a cargar</caption>
              <thead>
                <tr>
                  <th scope="col" className="numero">
                    Fila
                  </th>
                  {resultado.columnas.map((columna) => (
                    <th scope="col" key={columna}>
                      {columna}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultado.vista.map((fila) => (
                  <tr key={fila.fila}>
                    <td className="numero cifra">{fila.fila}</td>
                    {fila.celdas.map((celda, i) => (
                      <td key={i}>{celda || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaDesplazable>
          <button
            className="boton boton--primario"
            type="submit"
            name="confirmar"
            disabled={enviando}
          >
            Confirmar
          </button>
        </>
      )}

      {hayError && (
        <div className="error" id={idError} role="alert">
          {errores.length > 0 ? (
            <>
              <p>
                {errores.length === 1
                  ? 'El archivo tiene un error: no se cargó nada.'
                  : `El archivo tiene ${errores.length} errores: no se cargó nada.`}{' '}
                Corregilo y volvé a subirlo.
              </p>
              <ul>
                {errores.slice(0, TOPE_DE_ERRORES).map((error, i) => (
                  <li key={i}>
                    {error.fila !== null ? `Fila ${error.fila}: ${error.mensaje}` : error.mensaje}
                  </li>
                ))}
              </ul>
              {errores.length > TOPE_DE_ERRORES && <p>y {errores.length - TOPE_DE_ERRORES} más</p>}
            </>
          ) : (
            mensaje
          )}
        </div>
      )}
    </form>
  )
}

const coma = (n: string) => n.replace('.', ',')

const sinIdentificar = (n: number) =>
  n > 0
    ? ` (${plural(n, 'persona', 'personas')} sin correo ni DNI: volver a importar las duplicaría)`
    : ''

type ResumenPadron = { unidades: number; suma: string; duenos: number; sinIdentificar: number }
type ResumenOcupantes = {
  propietarios: number
  inquilinos: number
  yaEstaban: number
  sinIdentificar: number
}

/** Las funciones no cruzan de servidor a cliente: estos envoltorios fijan acción y textos. */
export function ImportadorDePadron({ consorcioId }: { consorcioId: string }) {
  return (
    <Importador
      accion={accionImportarPadron}
      consorcioId={consorcioId}
      plantillaHref={`/api/plantillas/${consorcioId}/padron.xlsx`}
      titulo="Archivo del padrón"
      textoConfirmar={(resumen) => {
        const r = resumen as ResumenPadron
        return `${plural(r.unidades, 'unidad', 'unidades')} · suma ${coma(r.suma)} % · ${plural(r.duenos, 'dueño', 'dueños')}${sinIdentificar(r.sinIdentificar)}. Confirmá para cargarlo.`
      }}
    />
  )
}

export function ModalImportarOcupantes({ consorcioId }: { consorcioId: string }) {
  return (
    <BotonModal
      etiqueta={
        <>
          <FileUp className="icono" aria-hidden="true" />
          Importar ocupantes
        </>
      }
      titulo="Importar ocupantes"
      variante="boton--fantasma"
    >
      <p className="apagado">
        Propietarios e inquilinos de unidades que ya están en el padrón. Importar los registra, no
        les da acceso ni les manda correos.
      </p>
      <Importador
        accion={accionImportarOcupantes}
        consorcioId={consorcioId}
        plantillaHref={`/api/plantillas/${consorcioId}/ocupantes.xlsx`}
        titulo="Archivo de ocupantes"
        textoConfirmar={(resumen) => {
          const r = resumen as ResumenOcupantes
          return `${plural(r.propietarios, 'propietario', 'propietarios')}, ${plural(r.inquilinos, 'inquilino', 'inquilinos')}, ${r.yaEstaban} ya estaban${sinIdentificar(r.sinIdentificar)}. Confirmá para cargarlos.`
        }}
      />
    </BotonModal>
  )
}
