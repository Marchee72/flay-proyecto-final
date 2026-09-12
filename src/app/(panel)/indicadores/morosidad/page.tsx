import type { Metadata } from 'next'
import Link from 'next/link'

import { importeParaMostrar } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verMorosidad } from '@/aplicacion/indicadores/indicadores'

import { AvisoDeError, conConsorcio } from '../../con-consorcio'
import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'
import { Alertas, etiquetaDePeriodo } from '../alertas'
import { SerieDeMorosidad } from '../graficos'

export const metadata: Metadata = { title: 'I-1 Morosidad — Flay' }

/** I-1 (`RF-22`): serie mensual con la meta del 12 %. El detalle nominado es la morosidad de 003, con RN-13. */
export default async function MorosidadPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string }>
}) {
  const parametros = await searchParams
  const pantalla = await conConsorcio(parametros, '/indicadores/morosidad', 'I-1 Morosidad')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const { serie, meta, alertas } = await verMorosidad(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })
    const puntos = serie.map((m) => ({
      etiqueta: etiquetaDePeriodo(m.anio, m.mes),
      porcentaje: m.porcentaje,
    }))

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref={`/indicadores?consorcio=${activo.id}`}
          volverTexto="Volver a indicadores"
        />
        <h1>I-1 · Morosidad</h1>
        <p className="apagado">
          Deuda vencida sobre lo liquidado en cada período. Meta: {meta} %. La nómina de unidades en
          mora está en <Link href={`/morosidad?consorcio=${activo.id}`}>Morosidad</Link>.
        </p>
        <Alertas alertas={alertas} />
        {serie.length === 0 ? (
          <div className="vacio">
            <p>Sin períodos liquidados todavía, o sin actualizar los indicadores.</p>
          </div>
        ) : (
          <>
            <SerieDeMorosidad serie={puntos} meta={meta} />
            <div
              className="tabla-desplazable"
              tabIndex={0}
              role="region"
              aria-label="Morosidad por período"
            >
              <table>
                <caption className="ayuda">
                  Los mismos datos del gráfico, período por período
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Período</th>
                    <th scope="col" className="numero">
                      Liquidado
                    </th>
                    <th scope="col" className="numero">
                      Deuda vencida
                    </th>
                    <th scope="col" className="numero">
                      Unidades en mora
                    </th>
                    <th scope="col" className="numero">
                      Morosidad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {serie.map((m) => (
                    <tr key={`${m.anio}-${m.mes}`}>
                      <td>{etiquetaDePeriodo(m.anio, m.mes)}</td>
                      <td className="numero cifra">{importeParaMostrar(m.masaLiquidada)}</td>
                      <td className="numero cifra">{importeParaMostrar(m.deudaVencida)}</td>
                      <td className="numero cifra">
                        {m.unidadesEnMora} de {m.unidades}
                      </td>
                      <td className="numero cifra">
                        {m.porcentaje !== null ? `${m.porcentaje} %` : '—'}
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
