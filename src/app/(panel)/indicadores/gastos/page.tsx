import type { Metadata } from 'next'
import { TriangleAlert } from 'lucide-react'

import { importeParaMostrar } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verGastoPorRubro } from '@/aplicacion/indicadores/indicadores'

import { AvisoDeError, conConsorcio } from '../../con-consorcio'
import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'
import { Alertas, etiquetaDePeriodo } from '../alertas'
import { BarrasDeGasto } from '../graficos'

export const metadata: Metadata = { title: 'I-2 Gasto por rubro — Flay' }

/** I-2 (`RF-23`, `FR-019`): barras apiladas por rubro y período; desvíos > 30 % destacados. */
export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string }>
}) {
  const parametros = await searchParams
  const pantalla = await conConsorcio(parametros, '/indicadores/gastos', 'I-2 Gasto por rubro')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const { filas, alertas } = await verGastoPorRubro(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })
    // Los ultimos doce periodos alcanzan para el dibujo; la tabla trae todo.
    const periodos = [...new Set(filas.map((f) => etiquetaDePeriodo(f.anio, f.mes)))].slice(-12)
    const paraDibujar = filas
      .filter((f) => periodos.includes(etiquetaDePeriodo(f.anio, f.mes)))
      .map((f) => ({
        etiqueta: etiquetaDePeriodo(f.anio, f.mes),
        rubro: f.rubro,
        importe: f.importe,
        desviado: f.desviado,
      }))

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref={`/indicadores?consorcio=${activo.id}`}
          volverTexto="Volver a indicadores"
        />
        <h1>I-2 · Gasto por rubro</h1>
        <p className="apagado">
          Cada período contra el promedio móvil de los doce anteriores del mismo consorcio, nunca
          contra un valor fijo: en contexto inflacionario un valor fijo señalaría desvíos donde sólo
          hay actualización de precios.
        </p>
        <Alertas alertas={alertas} />
        {filas.length === 0 ? (
          <div className="vacio">
            <p>Sin gastos por período todavía, o sin actualizar los indicadores.</p>
          </div>
        ) : (
          <>
            <BarrasDeGasto filas={paraDibujar} />
            <div
              className="tabla-desplazable"
              tabIndex={0}
              role="region"
              aria-label="Gasto por rubro y período"
            >
              <table>
                <caption className="ayuda">
                  Los mismos datos del gráfico. «Historia insuficiente»: menos de doce períodos con
                  gasto en el rubro
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Período</th>
                    <th scope="col">Rubro</th>
                    <th scope="col" className="numero">
                      Importe
                    </th>
                    <th scope="col" className="numero">
                      Promedio 12
                    </th>
                    <th scope="col" className="numero">
                      Desvío
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={`${f.anio}-${f.mes}-${f.rubroId}`}>
                      <td>{etiquetaDePeriodo(f.anio, f.mes)}</td>
                      <td>{f.rubro}</td>
                      <td className="numero cifra">{importeParaMostrar(f.importe)}</td>
                      <td className="numero cifra">
                        {f.promedioMovil12 !== null
                          ? importeParaMostrar(f.promedioMovil12)
                          : 'Historia insuficiente'}
                      </td>
                      <td className="numero cifra">
                        {f.desvioPorcentual !== null ? `${f.desvioPorcentual} %` : '—'}
                        {f.desviado && (
                          <>
                            {' '}
                            <TriangleAlert className="icono" aria-label="Desvío mayor al 30 %" />
                          </>
                        )}
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
