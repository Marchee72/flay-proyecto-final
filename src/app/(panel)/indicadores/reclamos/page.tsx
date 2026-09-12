import type { Metadata } from 'next'
import { TriangleAlert } from 'lucide-react'

import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verResolucionReclamos } from '@/aplicacion/indicadores/indicadores'

import { AvisoDeError, conConsorcio } from '../../con-consorcio'
import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'
import { Alertas } from '../alertas'
import { BarrasDeResolucion } from '../graficos'

export const metadata: Metadata = { title: 'I-4 Reclamos — Flay' }

const URGENCIA: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
}

/** I-4 (`RF-25`, `FR-020`): mediana y percentil 90, no promedio. */
export default async function ReclamosIndicadorPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string }>
}) {
  const parametros = await searchParams
  const pantalla = await conConsorcio(parametros, '/indicadores/reclamos', 'I-4 Reclamos')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const { filas, metaHoras, alertas } = await verResolucionReclamos(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })
    const etiqueta = (f: (typeof filas)[number]) =>
      `${f.rubro ?? 'Sin rubro'} · ${URGENCIA[f.urgencia] ?? f.urgencia}`

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref={`/indicadores?consorcio=${activo.id}`}
          volverTexto="Volver a indicadores"
        />
        <h1>I-4 · Tiempo de resolución de reclamos</h1>
        <p className="apagado">
          Mediana y percentil 90 de las horas entre apertura y resolución, por rubro y urgencia.
          Mediana y no promedio: unos pocos reclamos muy largos distorsionan el promedio y ocultan
          el comportamiento habitual. Meta para urgencias: {metaHoras} h.
        </p>
        <Alertas alertas={alertas} />
        {filas.length === 0 ? (
          <div className="vacio">
            <p>Sin reclamos resueltos todavía, o sin actualizar los indicadores.</p>
          </div>
        ) : (
          <>
            <BarrasDeResolucion
              filas={filas.map((f) => ({
                etiqueta: etiqueta(f),
                mediana: f.medianaHoras,
                p90: f.p90Horas,
                fueraDeMeta: f.fueraDeMeta,
              }))}
              metaHoras={metaHoras}
            />
            <div
              className="tabla-desplazable"
              tabIndex={0}
              role="region"
              aria-label="Resolución por rubro y urgencia"
            >
              <table>
                <caption className="ayuda">Los mismos datos del gráfico</caption>
                <thead>
                  <tr>
                    <th scope="col">Rubro</th>
                    <th scope="col">Urgencia</th>
                    <th scope="col" className="numero">
                      Reclamos
                    </th>
                    <th scope="col" className="numero">
                      Mediana
                    </th>
                    <th scope="col" className="numero">
                      Percentil 90
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={`${f.rubroId}-${f.urgencia}`}>
                      <td>{f.rubro ?? 'Sin rubro'}</td>
                      <td>{URGENCIA[f.urgencia] ?? f.urgencia}</td>
                      <td className="numero cifra">{f.cantidad}</td>
                      <td className="numero cifra">
                        {f.medianaHoras} h
                        {f.fueraDeMeta && (
                          <>
                            {' '}
                            <TriangleAlert
                              className="icono"
                              aria-label="Sobre la meta de 72 horas"
                            />
                          </>
                        )}
                      </td>
                      <td className="numero cifra">{f.p90Horas} h</td>
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
