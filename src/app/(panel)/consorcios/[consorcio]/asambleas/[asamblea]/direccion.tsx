import type { VistaAsamblea } from '@/aplicacion/asambleas/ver'

import {
  accionAbrirPunto,
  accionAcreditar,
  accionAutoridades,
  accionCargarVoto,
  accionCerrarPunto,
  accionConstituir,
  accionFinalizar,
  accionTomarDireccion,
} from './acciones'
import { opcionesDe, Ocultos } from './comunes'

/**
 * El panel de quien dirige (FR-015 a FR-021). Acreditar a quien no puede
 * solo, designar autoridades, constituir, abrir y cerrar los puntos en orden,
 * cargar el voto de quien no tiene teléfono y finalizar.
 */
export function Direccion({ vista }: { vista: VistaAsamblea }) {
  if (!vista.yo.puedeDirigir) return null
  if (!vista.yo.dirige) {
    return (
      <section className="tarjeta" aria-labelledby="direccion-titulo">
        <h2 id="direccion-titulo">Dirección</h2>
        <p className="apagado">
          Dirige {vista.dirige?.nombre ?? 'nadie todavía'}. Si se desconectó, podés tomar la
          dirección: los votos ya emitidos no se pierden.
        </p>
        <form action={accionTomarDireccion}>
          <Ocultos vista={vista} />
          <button className="boton boton--fantasma" type="submit">
            Tomar la dirección
          </button>
        </form>
      </section>
    )
  }

  const ausentes = vista.padron.filter((u) => !u.presente)
  // Una persona que representa varias unidades se elige una sola vez.
  const conUsuario = [
    ...new Map(
      vista.padron
        .filter((u) => u.presente && u.representanteId)
        .map((u) => [u.representanteId!, u]),
    ).values(),
  ]
  const abierto = vista.puntos.find((p) => p.estado === 'abierto')
  const siguiente = vista.puntos.find((p) => p.estado === 'pendiente')
  const votaron = new Set(abierto?.votos.map((v) => v.unidadId) ?? [])
  const sinVotar = vista.padron.filter((u) => u.presente && !u.sinVoto && !votaron.has(u.unidadId))

  return (
    <section className="tarjeta direccion" aria-labelledby="direccion-titulo">
      <h2 id="direccion-titulo">Dirección</h2>

      {ausentes.length > 0 && (
        <form action={accionAcreditar} className="fila-de-filtros">
          <Ocultos vista={vista} />
          <div className="campo">
            <label htmlFor="acreditar-unidad">Acreditar unidad</label>
            <select id="acreditar-unidad" name="unidad" required>
              {ausentes.map((u) => (
                <option key={u.unidadId} value={u.unidadId}>
                  {u.designacion}
                  {u.sinVoto ? ' (sin voto)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="acreditar-nombre">Presente</label>
            <input id="acreditar-nombre" name="nombre" required placeholder="Nombre y apellido" />
          </div>
          <div className="campo">
            <label htmlFor="acreditar-como">Como</label>
            <select id="acreditar-como" name="representacion">
              <option value="propietario">Propietario</option>
              <option value="apoderado">Apoderado</option>
            </select>
          </div>
          <button className="boton boton--fantasma" type="submit">
            Acreditar
          </button>
        </form>
      )}

      {!vista.constituida && (
        <>
          <form action={accionAutoridades} className="fila-de-filtros">
            <Ocultos vista={vista} />
            {(['presidente', 'secretario'] as const).map((cargo) => (
              <div key={cargo} className="campo">
                <label htmlFor={`autoridad-${cargo}`}>
                  {cargo === 'presidente' ? 'Presidente' : 'Secretario/a'}
                </label>
                <select
                  id={`autoridad-${cargo}`}
                  name={cargo}
                  required
                  defaultValue={vista[cargo]?.id ?? ''}
                >
                  <option value="" disabled>
                    Elegí entre los presentes
                  </option>
                  {conUsuario.map((u) => (
                    <option key={`${cargo}-${u.representanteId}`} value={u.representanteId!}>
                      {u.representante}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button className="boton boton--fantasma" type="submit">
              Designar
            </button>
          </form>
          <form action={accionConstituir}>
            <Ocultos vista={vista} />
            <button className="boton boton--primario" type="submit">
              Verificar quórum y constituir
            </button>
          </form>
        </>
      )}

      {vista.constituida && abierto && (
        <>
          {sinVotar.length > 0 && (
            <form action={accionCargarVoto} className="fila-de-filtros">
              <Ocultos vista={vista} />
              <input type="hidden" name="punto" value={abierto.id} />
              <div className="campo">
                <label htmlFor="manual-unidad">Cargar voto de</label>
                <select id="manual-unidad" name="unidad" required>
                  {sinVotar.map((u) => (
                    <option key={u.unidadId} value={u.unidadId}>
                      {u.designacion} — {u.representante}
                    </option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="manual-eleccion">Voto</label>
                <select
                  id="manual-eleccion"
                  name={abierto.modalidad === 'binaria' ? 'sentido' : 'opcion'}
                  required
                >
                  {opcionesDe(abierto).map(({ clave, texto }) => (
                    <option key={clave} value={clave}>
                      {texto}
                    </option>
                  ))}
                </select>
              </div>
              <button className="boton boton--fantasma" type="submit">
                Cargar voto
              </button>
            </form>
          )}
          <form action={accionCerrarPunto}>
            <Ocultos vista={vista} />
            <input type="hidden" name="punto" value={abierto.id} />
            <button className="boton boton--primario" type="submit">
              Cerrar el punto {abierto.orden} y contar
            </button>
          </form>
        </>
      )}

      {vista.constituida && !abierto && siguiente && (
        <form action={accionAbrirPunto}>
          <Ocultos vista={vista} />
          <input type="hidden" name="punto" value={siguiente.id} />
          <button className="boton boton--primario" type="submit">
            Abrir el punto {siguiente.orden}: {siguiente.titulo}
          </button>
        </form>
      )}

      {vista.constituida && !abierto && !siguiente && (
        <form action={accionFinalizar}>
          <Ocultos vista={vista} />
          <p className="apagado">
            Se trató todo el orden del día. Al finalizar, la asistencia y los votos quedan fijos.
          </p>
          <button className="boton boton--primario" type="submit">
            Finalizar la asamblea
          </button>
        </form>
      )}
    </section>
  )
}
