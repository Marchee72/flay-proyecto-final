import type { Metadata } from 'next'

import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verCargaAdministrativa } from '@/aplicacion/indicadores/indicadores'

import { AvisoDeError, conConsorcio } from '../../con-consorcio'
import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'
import { etiquetaDePeriodo } from '../alertas'
import { SerieDeCarga } from '../graficos'

export const metadata: Metadata = { title: 'I-5 Carga administrativa — Flay' }

/**
 * I-5 (OBJ-1): horas entre la apertura y la liquidación de cada período contra
 * la línea de base de 38 h mensuales del punto 2.7, y la proporción de gastos
 * cargados con asistencia sin corrección. Es la verificación del supuesto
 * crítico del riesgo RN-01.
 */
export default async function CargaPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string }>
}) {
  const parametros = await searchParams
  const pantalla = await conConsorcio(parametros, '/indicadores/carga', 'I-5 Carga administrativa')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const { serie, lineaBaseHoras } = await verCargaAdministrativa(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref={`/indicadores?consorcio=${activo.id}`}
          volverTexto="Volver a indicadores"
        />
        <h1>I-5 · Carga administrativa</h1>
        <p className="apagado">
          Horas entre la apertura del período y su liquidación, contra la línea de base de{' '}
          {lineaBaseHoras} h mensuales relevadas antes del sistema. Y cuántos gastos cargados con
          asistencia se confirmaron sin corregir nada.
        </p>
        {serie.length === 0 ? (
          <div className="vacio">
            <p>
              Sin períodos liquidados ni extracciones todavía, o sin actualizar los indicadores.
            </p>
          </div>
        ) : (
          <>
            <SerieDeCarga
              serie={serie.map((s) => ({
                etiqueta: etiquetaDePeriodo(s.anio, s.mes),
                horas: s.horasAperturaALiquidacion,
              }))}
              lineaBase={lineaBaseHoras}
            />
            <div
              className="tabla-desplazable"
              tabIndex={0}
              role="region"
              aria-label="Carga administrativa por mes"
            >
              <table>
                <caption className="ayuda">
                  Los mismos datos del gráfico, más la precisión de la asistencia
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Mes</th>
                    <th scope="col" className="numero">
                      Horas hasta liquidar
                    </th>
                    <th scope="col" className="numero">
                      Extracciones confirmadas
                    </th>
                    <th scope="col" className="numero">
                      Sin corrección
                    </th>
                    <th scope="col" className="numero">
                      Sugerencias aceptadas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {serie.map((s) => (
                    <tr key={`${s.anio}-${s.mes}`}>
                      <td>{etiquetaDePeriodo(s.anio, s.mes)}</td>
                      <td className="numero cifra">
                        {s.horasAperturaALiquidacion !== null
                          ? `${s.horasAperturaALiquidacion} h`
                          : '—'}
                      </td>
                      <td className="numero cifra">{s.extraccionesConfirmadas}</td>
                      <td className="numero cifra">
                        {s.sinCorreccion}
                        {s.proporcionSinCorreccion !== null && ` (${s.proporcionSinCorreccion} %)`}
                      </td>
                      <td className="numero cifra">
                        {s.aceptadas} de {s.sugerencias}
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
