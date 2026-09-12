import type { Metadata } from 'next'

import { importeParaMostrar } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verProveedores } from '@/aplicacion/indicadores/indicadores'

import { AvisoDeError, conConsorcio } from '../../con-consorcio'
import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'
import { DispersionDeProveedores } from '../graficos'

export const metadata: Metadata = { title: 'I-3 Proveedores — Flay' }

/** I-3 (`RF-24`): tabla ordenable y dispersión de costo promedio contra tiempo de resolución. */
export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string; orden?: string }>
}) {
  const parametros = await searchParams
  const pantalla = await conConsorcio(parametros, '/indicadores/proveedores', 'I-3 Proveedores')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const filas = await verProveedores(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id })
    const orden =
      parametros.orden === 'horas' ? 'horas' : parametros.orden === 'costo' ? 'costo' : 'nombre'
    // Ordenar cadenas numericas por su valor decimal: comparacion, no aritmetica.
    const ordenadas = [...filas].sort((a, b) => {
      if (orden === 'costo') return Number(b.costoAcumulado) - Number(a.costoAcumulado)
      if (orden === 'horas')
        return (
          Number(a.horasMediasResolucion ?? Infinity) - Number(b.horasMediasResolucion ?? Infinity)
        )
      return a.proveedor.localeCompare(b.proveedor)
    })

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref={`/indicadores?consorcio=${activo.id}`}
          volverTexto="Volver a indicadores"
        />
        <h1>I-3 · Desempeño y costo por proveedor</h1>
        <p className="apagado">
          A quién contratar para cada tipo de trabajo: costo acumulado, contrataciones y tiempo
          medio entre asignación y resolución de los reclamos que atendió. Sin reclamos, la columna
          queda vacía: cero sería resolución instantánea.
        </p>
        <form className="fila-de-filtros" aria-label="Ordenar">
          <input type="hidden" name="consorcio" value={activo.id} />
          <div className="campo">
            <label htmlFor="orden">Ordenar por</label>
            <select id="orden" name="orden" defaultValue={orden}>
              <option value="nombre">Proveedor</option>
              <option value="costo">Costo acumulado</option>
              <option value="horas">Horas de resolución</option>
            </select>
          </div>
          <button className="boton boton--fantasma" type="submit">
            Ordenar
          </button>
        </form>
        {filas.length === 0 ? (
          <div className="vacio">
            <p>Sin gastos con proveedor todavía, o sin actualizar los indicadores.</p>
          </div>
        ) : (
          <>
            <DispersionDeProveedores
              puntos={filas.map((f) => ({
                proveedor: f.proveedor,
                costoPromedio: f.costoPromedio,
                horas: f.horasMediasResolucion,
              }))}
            />
            <div
              className="tabla-desplazable"
              tabIndex={0}
              role="region"
              aria-label="Desempeño por proveedor"
            >
              <table>
                <caption className="ayuda">Un renglón por proveedor y rubro</caption>
                <thead>
                  <tr>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Rubro</th>
                    <th scope="col" className="numero">
                      Contrataciones
                    </th>
                    <th scope="col" className="numero">
                      Costo acumulado
                    </th>
                    <th scope="col" className="numero">
                      Costo promedio
                    </th>
                    <th scope="col" className="numero">
                      Reclamos resueltos
                    </th>
                    <th scope="col" className="numero">
                      Horas medias
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ordenadas.map((f) => (
                    <tr key={`${f.proveedorId}-${f.rubroId}`}>
                      <td>{f.proveedor}</td>
                      <td>{f.rubro ?? '—'}</td>
                      <td className="numero cifra">{f.contrataciones}</td>
                      <td className="numero cifra">{importeParaMostrar(f.costoAcumulado)}</td>
                      <td className="numero cifra">
                        {f.costoPromedio !== null ? importeParaMostrar(f.costoPromedio) : '—'}
                      </td>
                      <td className="numero cifra">{f.reclamosResueltos}</td>
                      <td className="numero cifra">
                        {f.horasMediasResolucion !== null ? `${f.horasMediasResolucion} h` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
