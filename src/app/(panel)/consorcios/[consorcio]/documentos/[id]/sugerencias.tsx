import { TriangleAlert } from 'lucide-react'

import { momentoParaMostrar, plural } from '@/compartido/formato'
import type { SugerenciaVisible } from '@/aplicacion/comunicacion/sugerencias'

import {
  accionAplicarSugerencia,
  accionDescartarSugerencia,
} from '../../../../comunicacion/acciones'
import { BotonModal } from '../../../../modal'
import { TablaDesplazable } from '../../../../tabla-desplazable'

const ESTADO = { pendiente: 'Pendiente', aplicada: 'Aplicada', descartada: 'Descartada' } as const

/**
 * Lo que el documento fija y difiere de la configuracion (`RF-19`): una tarjeta
 * por sugerencia pendiente, con lo vigente al lado de lo propuesto y la cita.
 * Nada se escribe sin el clic de «Aplicar» (RN-14); las resueltas quedan
 * plegadas como historia.
 */
export function Sugerencias({
  consorcioId,
  documentoId,
  sugerencias,
  analizando,
}: {
  consorcioId: string
  documentoId: string
  sugerencias: SugerenciaVisible[]
  analizando: boolean
}) {
  const pendientes = sugerencias.filter((s) => s.estado === 'pendiente')
  const resueltas = sugerencias.filter((s) => s.estado !== 'pendiente')
  const campos = (s: SugerenciaVisible) => (
    <>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="documento" value={documentoId} />
      <input type="hidden" name="sugerencia" value={s.id} />
    </>
  )

  return (
    <section className="sugerencias" id="sugerencias" aria-labelledby="titulo-sugerencias">
      <h2 id="titulo-sugerencias">Configuración que menciona este documento</h2>
      {analizando && (
        <p className="aviso aviso--atencion">
          Estamos leyendo el documento: las sugerencias aparecen acá en un momento.
        </p>
      )}
      {!analizando && pendientes.length === 0 && (
        <p className="apagado">No hay sugerencias para revisar.</p>
      )}
      {pendientes.map((s) => {
        // Pendiente pero ya igual a lo vigente (se cambio a mano): no hay nada que aplicar.
        const aplicable = s.aplicable && s.cambios.length > 0
        return (
          <article className="tarjeta" key={s.id} aria-labelledby={`sugerencia-${s.id}`}>
            <h3 id={`sugerencia-${s.id}`}>{s.titulo}</h3>
            {s.cambios.length > 0 && (
              <TablaDesplazable
                paginar={false}
                tabIndex={0}
                role="region"
                aria-label={`Cambios de «${s.titulo}»`}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Qué</th>
                      <th scope="col">Ahora</th>
                      <th scope="col">Propuesto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.cambios.map((c) => (
                      <tr key={c.campo}>
                        <th scope="row">{c.campo}</th>
                        <td>{c.actual}</td>
                        <td>{c.propuesto}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TablaDesplazable>
            )}
            {s.aplicable && s.cambios.length === 0 && (
              <p className="apagado">Ya coincide con la configuración.</p>
            )}
            <blockquote>{s.cita}</blockquote>
            {!s.aplicable && (
              <p className="aviso aviso--atencion">
                El espacio de esta sugerencia ya no existe o está deshabilitado: solo se puede
                descartar.
              </p>
            )}
            {aplicable && s.reservasAfectadas > 0 && (
              <p className="aviso aviso--atencion">
                <TriangleAlert className="icono" aria-hidden="true" />
                <span>
                  Aplicar cancela{' '}
                  {plural(s.reservasAfectadas, 'reserva confirmada', 'reservas confirmadas')}.
                </span>
              </p>
            )}
            <div className="fila-acciones">
              {aplicable &&
                (s.reservasAfectadas > 0 ? (
                  <BotonModal
                    etiqueta="Aplicar"
                    titulo={`Aplicar «${s.titulo}»`}
                    variante="boton--peligro"
                  >
                    <form action={accionAplicarSugerencia}>
                      {campos(s)}
                      <p className="ayuda">
                        Se cancelan{' '}
                        {plural(s.reservasAfectadas, 'reserva confirmada', 'reservas confirmadas')}{' '}
                        y se avisa a quienes las hicieron. No se puede deshacer.
                      </p>
                      <button className="boton boton--peligro" type="submit">
                        Aplicar
                      </button>
                    </form>
                  </BotonModal>
                ) : (
                  <form action={accionAplicarSugerencia}>
                    {campos(s)}
                    <button className="boton boton--primario" type="submit">
                      Aplicar
                    </button>
                  </form>
                ))}
              <form action={accionDescartarSugerencia}>
                {campos(s)}
                <button className="boton boton--terciario" type="submit">
                  Descartar
                </button>
              </form>
            </div>
          </article>
        )
      })}
      {resueltas.length > 0 && (
        <details className="sugerencias__historia">
          <summary>Ya revisadas ({resueltas.length})</summary>
          <ul>
            {resueltas.map((s) => (
              <li key={s.id}>
                <strong>{s.titulo}</strong>{' '}
                <span className="apagado">
                  · {ESTADO[s.estado]}
                  {s.resueltaEn && ` · ${momentoParaMostrar(s.resueltaEn)}`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
