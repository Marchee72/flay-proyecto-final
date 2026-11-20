import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowUpRight,
  MessageSquareWarning,
  Percent,
  RefreshCw,
  TriangleAlert,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { momentoParaMostrar } from '@/compartido/formato'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import {
  verCargaAdministrativa,
  verGastoPorRubro,
  verMorosidad,
  verPanel,
  verProveedores,
  verResolucionReclamos,
} from '@/aplicacion/indicadores/indicadores'

import { AvisoDeError, conConsorcio } from '../../../con-consorcio'
import { accionRefrescar } from './acciones'
import { etiquetaDePeriodo } from './alertas'
import {
  AreaDeCarga,
  BarrasHorizontalesDeResolucion,
  DispersionDeProveedores,
  DonaDeGasto,
  SerieDeMorosidad,
} from './graficos'

export const metadata: Metadata = { title: 'Indicadores — Flay' }

/** Un indicador que falla (o que el rol no alcanza) no tumba el tablero: queda sin tarjeta. */
const intentar = <T,>(pedido: Promise<T>) =>
  pedido.then(
    (v) => v,
    () => null,
  )

/**
 * Tablero del consorcio: todos los indicadores a la vez, cada uno con su
 * gráfico y un enlace al detalle con la tabla. Sobre las vistas materializadas.
 */
export default async function IndicadoresPage({
  params,
}: {
  params: Promise<{ consorcio: string }>
}) {
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Indicadores')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const roles = await rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id)
    const administra = roles.includes('administrador')
    const datos = { usuarioId, consorcioId: activo.id }
    const base = `/consorcios/${activo.id}/indicadores`

    // La morosidad la ven administrador y consejo: para cualquier otro rol lanza
    // y la pantalla dice que su rol no alcanza (RNF-03).
    const [morosidad, gasto, reclamos, proveedores, carga, panel] = await Promise.all([
      verMorosidad(HABILITACIONES, RELOJ, datos),
      intentar(verGastoPorRubro(HABILITACIONES, RELOJ, datos)),
      intentar(verResolucionReclamos(HABILITACIONES, RELOJ, datos)),
      administra ? intentar(verProveedores(HABILITACIONES, RELOJ, datos)) : null,
      administra ? intentar(verCargaAdministrativa(HABILITACIONES, RELOJ, datos)) : null,
      administra ? intentar(verPanel(HABILITACIONES, RELOJ, { usuarioId })) : null,
    ])
    const fila = panel?.consorcios.find((c) => c.id === activo.id) ?? null

    // Cada cifra lleva su estado (al día, atención, mora) para que el color solo diga eso.
    const morosidadNum = fila?.morosidad != null ? Number(fila.morosidad) : null
    const estadoMorosidad =
      morosidadNum === null
        ? 'sin'
        : morosidadNum > 15
          ? 'mora'
          : morosidadNum > Number(panel?.meta)
            ? 'atencion'
            : 'ok'
    const kpis = fila && (
      <ul className="tablero-ind__kpis" aria-label="Estado del consorcio">
        <li className="tarjeta" data-estado={estadoMorosidad}>
          <span className="tablero-ind__icono" aria-hidden="true">
            <Percent className="icono" />
          </span>
          <span className="kpi__rotulo">Morosidad</span>
          <span className="cifra tablero-ind__cifra">
            {fila.morosidad !== null ? `${fila.morosidad} %` : '—'}
          </span>
          <span className="kpi__detalle">Meta {panel?.meta} %</span>
        </li>
        <li className="tarjeta" data-estado={fila.unidadesEnMora > 0 ? 'atencion' : 'ok'}>
          <span className="tablero-ind__icono" aria-hidden="true">
            <Users className="icono" />
          </span>
          <span className="kpi__rotulo">Unidades en mora</span>
          <span className="cifra tablero-ind__cifra">{fila.unidadesEnMora}</span>
        </li>
        <li
          className="tarjeta"
          data-estado={
            fila.reclamosCriticos > 0 ? 'mora' : fila.reclamosAbiertos > 0 ? 'atencion' : 'ok'
          }
        >
          <span className="tablero-ind__icono" aria-hidden="true">
            <MessageSquareWarning className="icono" />
          </span>
          <span className="kpi__rotulo">Reclamos abiertos</span>
          <span className="cifra tablero-ind__cifra">{fila.reclamosAbiertos}</span>
          <span className="kpi__detalle">{fila.reclamosCriticos} críticos</span>
        </li>
        <li className="tarjeta" data-estado={fila.alertasDeGasto > 0 ? 'atencion' : 'ok'}>
          <span className="tablero-ind__icono" aria-hidden="true">
            <TriangleAlert className="icono" />
          </span>
          <span className="kpi__rotulo">Desvíos de gasto</span>
          <span className="cifra tablero-ind__cifra">{fila.alertasDeGasto}</span>
        </li>
      </ul>
    )

    const tarjeta = (clave: string, titulo: string, resumen: string, grafico: ReactNode | null) => (
      <article
        className={`tarjeta tablero-ind__tarjeta tablero-ind__tarjeta--${clave}`}
        key={clave}
      >
        <div className="tablero-ind__cabeza">
          <h2>{titulo}</h2>
          <Link
            className="boton boton--terciario"
            href={`${base}/${clave}`}
            aria-label={`Ver detalle de ${titulo}`}
          >
            Detalle
            <ArrowUpRight className="icono" aria-hidden="true" />
          </Link>
        </div>
        <p className="apagado">{resumen}</p>
        {grafico ?? (
          <p className="tablero-ind__vacio">Sin datos todavía. Actualizá los indicadores.</p>
        )}
      </article>
    )

    const tarjetas: ReactNode[] = []

    const ultimaMorosidad = morosidad.serie.at(-1)
    tarjetas.push(
      tarjeta(
        'morosidad',
        'I-1 Morosidad',
        ultimaMorosidad
          ? `${etiquetaDePeriodo(ultimaMorosidad.anio, ultimaMorosidad.mes)}: ${ultimaMorosidad.porcentaje ?? '—'} % · meta ${morosidad.meta} %`
          : `Meta ${morosidad.meta} %`,
        morosidad.serie.length > 0 ? (
          <SerieDeMorosidad
            alto={220}
            meta={morosidad.meta}
            serie={morosidad.serie.map((m) => ({
              etiqueta: etiquetaDePeriodo(m.anio, m.mes),
              porcentaje: m.porcentaje,
            }))}
          />
        ) : null,
      ),
    )

    if (gasto) {
      const periodos = [...new Set(gasto.filas.map((f) => etiquetaDePeriodo(f.anio, f.mes)))]
      const ultimo = periodos.at(-1)
      const partes = gasto.filas
        .filter((f) => etiquetaDePeriodo(f.anio, f.mes) === ultimo)
        .map((f) => ({ rubro: f.rubro, importe: f.importe }))
      tarjetas.push(
        tarjeta(
          'gastos',
          'I-2 Gasto por rubro',
          ultimo
            ? `${ultimo}: ${partes.length} rubros · ${gasto.alertas.length} alertas`
            : 'Sin gastos todavía',
          partes.length > 0 ? <DonaDeGasto alto={220} partes={partes} /> : null,
        ),
      )
    }

    if (proveedores) {
      tarjetas.push(
        tarjeta(
          'proveedores',
          'I-3 Proveedores',
          `${proveedores.length} proveedores · costo contra tiempo de resolución`,
          proveedores.length > 0 ? (
            <DispersionDeProveedores
              alto={220}
              puntos={proveedores.map((f) => ({
                proveedor: f.proveedor,
                costoPromedio: f.costoPromedio,
                horas: f.horasMediasResolucion,
              }))}
            />
          ) : null,
        ),
      )
    }

    if (reclamos) {
      const fuera = reclamos.filas.filter((f) => f.fueraDeMeta).length
      tarjetas.push(
        tarjeta(
          'reclamos',
          'I-4 Reclamos',
          `Meta de urgencias ${reclamos.metaHoras} h · ${fuera} fuera de meta`,
          reclamos.filas.length > 0 ? (
            <BarrasHorizontalesDeResolucion
              metaHoras={reclamos.metaHoras}
              filas={reclamos.filas.map((f) => ({
                etiqueta: `${f.rubro ?? 'Sin rubro'} · ${f.urgencia}`,
                mediana: f.medianaHoras,
                p90: f.p90Horas,
              }))}
            />
          ) : null,
        ),
      )
    }

    if (carga) {
      tarjetas.push(
        tarjeta(
          'carga',
          'I-5 Carga administrativa',
          `Horas de apertura a liquidación · línea de base ${carga.lineaBaseHoras} h`,
          carga.serie.length > 0 ? (
            <AreaDeCarga
              alto={220}
              lineaBase={carga.lineaBaseHoras}
              serie={carga.serie.map((s) => ({
                etiqueta: etiquetaDePeriodo(s.anio, s.mes),
                horas: s.horasAperturaALiquidacion,
              }))}
            />
          ) : null,
        ),
      )
    }

    return (
      <>
        <h1>Indicadores</h1>
        <div className="tablero-ind__encabezado">
          <p className="apagado">
            {activo.nombre}, sobre datos del propio sistema.
            {panel &&
              ` Última actualización: ${panel.refrescadoEn ? momentoParaMostrar(panel.refrescadoEn) : 'todavía no se actualizó'}.`}
          </p>
          {administra && (
            <form action={accionRefrescar} className="fila-acciones">
              <input type="hidden" name="consorcio" value={activo.id} />
              <button className="boton boton--fantasma" type="submit">
                <RefreshCw className="icono" aria-hidden="true" />
                Actualizar ahora
              </button>
            </form>
          )}
        </div>

        {kpis}

        <div className="tablero-ind">{tarjetas}</div>
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
