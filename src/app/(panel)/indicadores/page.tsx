import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, Gauge, RefreshCw, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { momentoParaMostrar } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verPanel } from '@/aplicacion/indicadores/indicadores'

import { AvisoDeError, conConsorcio } from '../con-consorcio'
import { EncabezadoDeConsorcio } from '../encabezado-consorcio'
import { accionRefrescar } from './acciones'

export const metadata: Metadata = { title: 'Indicadores — Flay' }

const PAGINAS = [
  {
    href: 'morosidad',
    titulo: 'I-1 Morosidad',
    texto: 'Evolución mensual contra la meta del 12 %',
  },
  {
    href: 'gastos',
    titulo: 'I-2 Gasto por rubro',
    texto: 'Desvíos contra el promedio de doce períodos',
  },
  { href: 'proveedores', titulo: 'I-3 Proveedores', texto: 'Costo y tiempo de resolución' },
  {
    href: 'reclamos',
    titulo: 'I-4 Reclamos',
    texto: 'Mediana y percentil 90 por rubro y urgencia',
  },
  {
    href: 'carga',
    titulo: 'I-5 Carga administrativa',
    texto: 'Horas de apertura a liquidación y precisión de la asistencia',
  },
] as const

/**
 * Panel consolidado de la cartera, I-6 (`RF-21`, `CU-11`): dónde poner la
 * atención hoy. Sobre las vistas materializadas; cero consultas a tablas base
 * salvo el conteo de reclamos abiertos.
 */
export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string; actualizado?: string; error?: string }>
}) {
  const parametros = await searchParams
  const pantalla = await conConsorcio(parametros, '/indicadores', 'Indicadores')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const panel = await verPanel(HABILITACIONES, RELOJ, { usuarioId })

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref="/consorcios"
          volverTexto="Volver a consorcios"
        />
        <h1>Indicadores</h1>
        <p className="apagado">
          La cartera completa, sobre datos del propio sistema. Última actualización:{' '}
          {panel.refrescadoEn ? momentoParaMostrar(panel.refrescadoEn) : 'todavía no se actualizó'}.
        </p>

        {parametros.actualizado && (
          <p className="aviso aviso--atencion" role="status">
            <BadgeCheck className="icono" aria-hidden="true" />
            <span>Indicadores actualizados.</span>
          </p>
        )}
        {parametros.error && (
          <AvisoDeError error={new ErrorDeAplicacion(parametros.error, 'FR-018')} />
        )}

        <div className="kpi">
          <span className="kpi__icono">
            <Gauge className="icono" aria-hidden="true" />
          </span>
          <div>
            <div className="kpi__rotulo">Morosidad de la cartera</div>
            <div className="kpi__cifra cifra">
              {panel.morosidadCartera !== null ? `${panel.morosidadCartera} %` : '—'}
            </div>
            <div className="kpi__detalle">
              Meta {panel.meta} % · último período liquidado de cada consorcio
            </div>
          </div>
        </div>

        <form action={accionRefrescar} className="fila-acciones">
          <input type="hidden" name="consorcio" value={activo.id} />
          <button className="boton boton--fantasma" type="submit">
            <RefreshCw className="icono" aria-hidden="true" />
            Actualizar ahora
          </button>
        </form>

        <div
          className="tabla-desplazable"
          tabIndex={0}
          role="region"
          aria-label="Estado por consorcio"
        >
          <table>
            <caption className="ayuda">Un renglón por consorcio administrado</caption>
            <thead>
              <tr>
                <th scope="col">Consorcio</th>
                <th scope="col">Último período</th>
                <th scope="col" className="numero">
                  Morosidad
                </th>
                <th scope="col" className="numero">
                  Unidades en mora
                </th>
                <th scope="col" className="numero">
                  Reclamos abiertos
                </th>
                <th scope="col" className="numero">
                  Críticos
                </th>
                <th scope="col" className="numero">
                  Desvíos de gasto
                </th>
              </tr>
            </thead>
            <tbody>
              {panel.consorcios.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/indicadores/morosidad?consorcio=${c.id}`}>{c.nombre}</Link>
                  </td>
                  <td>{c.ultimoPeriodo ?? 'Sin liquidar'}</td>
                  <td className="numero cifra">
                    {c.morosidad !== null ? `${c.morosidad} %` : '—'}
                    {c.morosidad !== null && Number(c.morosidad) > 15 && (
                      <>
                        {' '}
                        <TriangleAlert className="icono" aria-label="Por encima del 15 %" />
                      </>
                    )}
                  </td>
                  <td className="numero cifra">{c.unidadesEnMora}</td>
                  <td className="numero cifra">{c.reclamosAbiertos}</td>
                  <td className="numero cifra">{c.reclamosCriticos}</td>
                  <td className="numero cifra">{c.alertasDeGasto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Por indicador</h2>
        <div className="rejilla">
          {PAGINAS.map((p) => (
            <article className="tarjeta" key={p.href}>
              <h3>
                <Link href={`/indicadores/${p.href}?consorcio=${activo.id}`}>{p.titulo}</Link>
              </h3>
              <p className="apagado">{p.texto}</p>
            </article>
          ))}
        </div>
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
