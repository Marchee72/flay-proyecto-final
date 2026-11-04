import type { VistaAsamblea } from '@/aplicacion/asambleas/ver'

import { accionOtorgarPoder, accionPoderEnPapel, accionRevocarPoder } from './acciones'
import { Ocultos } from './comunes'

/**
 * Poderes de una asamblea convocada (RF-30). El propietario otorga sobre sus
 * unidades; quien puede dirigir carga además el poder que llegó en papel.
 */
export function Poderes({
  vista,
  apoderados,
}: {
  vista: VistaAsamblea
  apoderados: { id: string; nombre: string }[]
}) {
  const vigentes = vista.poderes.filter((p) => !p.revocado)
  const misUnidades = new Set(vista.yo.unidadesPropias.map((u) => u.unidadId))
  const libres = vista.yo.unidadesPropias.filter(
    (u) => !vigentes.some((p) => p.unidadId === u.unidadId),
  )
  const sinCuentaLibres = vista.propietariosSinCuenta.filter(
    (p) => !vigentes.some((v) => v.unidadId === p.unidadId),
  )
  const visibles = vigentes.filter(
    (p) =>
      misUnidades.has(p.unidadId) || p.apoderadoId === vista.yo.usuarioId || vista.yo.puedeDirigir,
  )

  if (vista.yo.unidadesPropias.length === 0 && visibles.length === 0 && !vista.yo.puedeDirigir) {
    return null
  }

  return (
    <section className="tarjeta" aria-labelledby="poderes-titulo">
      <h2 id="poderes-titulo">Poderes</h2>
      <p className="apagado">
        Si no podés ir, otra persona del consorcio puede votar por tu unidad. El poder vale solo
        para esta asamblea y se revoca hasta que se abre. Cada apoderado representa hasta{' '}
        {vista.topeApoderado ?? 3} unidades.
      </p>

      {visibles.length > 0 && (
        <ul className="lista-simple">
          {visibles.map((p) => (
            <li key={p.id}>
              <span>
                Unidad {p.designacion}: {p.otorgante} → {p.apoderado}
                {p.papel && ' (en papel)'}
                {p.sinEfecto && (
                  <span className="etiqueta etiqueta--vencido">
                    Sin efecto: ya no es propietario
                  </span>
                )}
              </span>
              {misUnidades.has(p.unidadId) && (
                <form action={accionRevocarPoder}>
                  <Ocultos vista={vista} />
                  <input type="hidden" name="poder" value={p.id} />
                  <button className="boton boton--fantasma" type="submit">
                    Revocar
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {libres.length > 0 && apoderados.length === 0 && (
        <p className="apagado">
          Todavía no hay otra persona con usuario en este consorcio para recibir un poder.
        </p>
      )}

      {libres.length > 0 && apoderados.length > 0 && (
        <form action={accionOtorgarPoder} className="fila-de-filtros">
          <Ocultos vista={vista} />
          <div className="campo">
            <label htmlFor="poder-unidad">Unidad</label>
            <select id="poder-unidad" name="unidad" required>
              {libres.map((u) => (
                <option key={u.unidadId} value={u.unidadId}>
                  {u.designacion}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="poder-apoderado">Apoderado</label>
            <select id="poder-apoderado" name="apoderado" required>
              {apoderados.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>
          <button className="boton boton--primario" type="submit">
            Otorgar poder
          </button>
        </form>
      )}

      {vista.yo.puedeDirigir && sinCuentaLibres.length > 0 && apoderados.length > 0 && (
        <form action={accionPoderEnPapel} className="fila-de-filtros">
          <Ocultos vista={vista} />
          <div className="campo">
            <label htmlFor="papel-otorgante">Poder recibido en papel de</label>
            <select id="papel-otorgante" name="otorgante" required>
              {sinCuentaLibres.map((p) => (
                <option key={`${p.unidadId}-${p.personaId}`} value={`${p.unidadId}|${p.personaId}`}>
                  {p.designacion} — {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="papel-apoderado">A favor de</label>
            <select id="papel-apoderado" name="apoderado" required>
              {apoderados.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>
          <button className="boton boton--fantasma" type="submit">
            Registrar poder en papel
          </button>
        </form>
      )}
    </section>
  )
}
