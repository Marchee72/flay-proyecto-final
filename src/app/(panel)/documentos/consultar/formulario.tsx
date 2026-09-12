'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { BookOpen, SearchX, TriangleAlert } from 'lucide-react'

import {
  accionConsultar,
  accionValorar,
  type ResultadoDeConsultaVisible,
} from '../../comunicacion/acciones'

const INICIAL: ResultadoDeConsultaVisible = { modo: 'inicial' }

/**
 * La pregunta y su respuesta con citas (`CU-10`). «No lo encontramos» es una
 * respuesta legitima, no un error; el modo degradado se dice con sus palabras.
 */
export function FormularioDeConsulta({ consorcioId }: { consorcioId: string }) {
  const [estado, accion, enviando] = useActionState(accionConsultar, INICIAL)

  return (
    <>
      <form action={accion} noValidate>
        <input type="hidden" name="consorcio" value={consorcioId} />
        <div className="campo campo--ancho">
          <label htmlFor="pregunta">Tu pregunta</label>
          <input
            id="pregunta"
            name="pregunta"
            required
            placeholder="¿Hasta qué hora puedo usar el SUM?"
            aria-describedby="ayuda-pregunta"
          />
          <p className="ayuda" id="ayuda-pregunta">
            Se responde solo con lo que dicen los documentos cargados, citando de dónde sale.
          </p>
        </div>
        <button className="boton boton--primario" type="submit" disabled={enviando}>
          {enviando ? 'Buscando…' : 'Preguntar'}
        </button>
      </form>

      {estado.modo === 'error' && (
        <p className="error" role="alert">
          {estado.mensaje}
        </p>
      )}

      {estado.modo === 'respuesta' && (
        <section className="tarjeta" aria-live="polite">
          <p style={{ whiteSpace: 'pre-line' }}>{estado.respuesta}</p>
          <h2>Fuentes</h2>
          <ul>
            {estado.citas.map((c) => (
              <li key={`${c.documentoId}-${c.numero}`}>
                <Link href={`/documentos/${c.documentoId}?consorcio=${consorcioId}`}>
                  {c.documento}
                </Link>
                {c.pagina ? `, página ${c.pagina}` : ''} · fragmento {c.numero}
              </li>
            ))}
          </ul>
          <form action={accionValorar} className="fila-acciones">
            <input type="hidden" name="consorcio" value={consorcioId} />
            <input type="hidden" name="consulta" value={estado.consultaId} />
            <span className="ayuda">¿Te sirvió?</span>
            <button className="boton boton--fantasma" type="submit" name="util" value="si">
              Sí
            </button>
            <button className="boton boton--fantasma" type="submit" name="util" value="no">
              No
            </button>
          </form>
        </section>
      )}

      {estado.modo === 'sin_respaldo' && (
        <p className="aviso aviso--atencion" role="status">
          <SearchX className="icono" aria-hidden="true" />
          <span>
            No lo encontramos en la documentación cargada. Si creés que debería estar, avisale a la
            administración.
          </span>
        </p>
      )}

      {estado.modo === 'degradado' && (
        <section className="tarjeta" role="status">
          <p className="aviso aviso--atencion">
            <TriangleAlert className="icono" aria-hidden="true" />
            <span>{estado.motivo}</span>
          </p>
          <h2>Documentos para abrir</h2>
          <ul>
            {estado.documentos.map((d) => (
              <li key={d.id}>
                <BookOpen className="icono" aria-hidden="true" />{' '}
                <Link href={`/documentos/${d.id}?consorcio=${consorcioId}`}>{d.titulo}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
