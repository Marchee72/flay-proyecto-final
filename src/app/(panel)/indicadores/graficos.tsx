'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * Los graficos del panel (research R-12). Recharts recibe numeros **solo
 * para dibujar**: la cadena que llega del caso de uso es la que se lee, en la
 * tabla que cada pagina pone debajo (RNF-11). Nada de esto es dinero
 * calculado: son escalas de un dibujo.
 */

const LIMA = '#7cb342'
const GRAFITO = '#23272e'
const AMBAR = '#8a5f14'
const ROJO = '#b3261e'
const GRIS = '#4a5158'

const paraDibujar = (valor: string | null): number | null => (valor === null ? null : Number(valor))

export function SerieDeMorosidad({
  serie,
  meta,
}: {
  serie: { etiqueta: string; porcentaje: string | null }[]
  meta: string
}) {
  const datos = serie.map((p) => ({ etiqueta: p.etiqueta, porcentaje: paraDibujar(p.porcentaje) }))
  return (
    <div className="grafico" aria-hidden="true">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={datos} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e3e7" />
          <XAxis dataKey="etiqueta" stroke={GRIS} fontSize={12} />
          <YAxis unit=" %" stroke={GRIS} fontSize={12} width={48} />
          <Tooltip formatter={(v) => [`${v} %`, 'Morosidad']} />
          <ReferenceLine
            y={Number(meta)}
            stroke={AMBAR}
            strokeDasharray="4 4"
            label={{
              value: `Meta ${meta} %`,
              fill: AMBAR,
              fontSize: 12,
              position: 'insideTopRight',
            }}
          />
          <Line
            type="monotone"
            dataKey="porcentaje"
            stroke={GRAFITO}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BarrasDeGasto({
  filas,
}: {
  filas: { etiqueta: string; rubro: string; importe: string; desviado: boolean }[]
}) {
  // Barras apiladas por rubro y periodo: un dato por periodo con una clave por rubro.
  const rubros = [...new Set(filas.map((f) => f.rubro))]
  const periodos = [...new Set(filas.map((f) => f.etiqueta))]
  const datos = periodos.map((etiqueta) => {
    const fila: Record<string, number | string> = { etiqueta }
    for (const f of filas.filter((x) => x.etiqueta === etiqueta)) fila[f.rubro] = Number(f.importe)
    return fila
  })
  const colores = [LIMA, GRAFITO, AMBAR, '#5c8ac9', '#9c6ade', GRIS, '#c97a3a']
  return (
    <div className="grafico" aria-hidden="true">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={datos} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e3e7" />
          <XAxis dataKey="etiqueta" stroke={GRIS} fontSize={12} />
          <YAxis stroke={GRIS} fontSize={12} width={64} />
          <Tooltip />
          {rubros.map((rubro, i) => (
            <Bar key={rubro} dataKey={rubro} stackId="gasto" fill={colores[i % colores.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DispersionDeProveedores({
  puntos,
}: {
  puntos: { proveedor: string; costoPromedio: string | null; horas: string | null }[]
}) {
  const datos = puntos
    .filter((p) => p.costoPromedio !== null && p.horas !== null)
    .map((p) => ({
      proveedor: p.proveedor,
      costo: Number(p.costoPromedio),
      horas: Number(p.horas),
    }))
  return (
    <div className="grafico" aria-hidden="true">
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e3e7" />
          <XAxis dataKey="horas" name="Horas de resolución" unit=" h" stroke={GRIS} fontSize={12} />
          <YAxis dataKey="costo" name="Costo promedio" stroke={GRIS} fontSize={12} width={64} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={datos} fill={LIMA} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BarrasDeResolucion({
  filas,
  metaHoras,
}: {
  filas: { etiqueta: string; mediana: string; p90: string; fueraDeMeta: boolean }[]
  metaHoras: string
}) {
  const datos = filas.map((f) => ({ ...f, mediana: Number(f.mediana), p90: Number(f.p90) }))
  return (
    <div className="grafico" aria-hidden="true">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={datos} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e3e7" />
          <XAxis dataKey="etiqueta" stroke={GRIS} fontSize={12} />
          <YAxis unit=" h" stroke={GRIS} fontSize={12} width={56} />
          <Tooltip />
          <ReferenceLine
            y={Number(metaHoras)}
            stroke={ROJO}
            strokeDasharray="4 4"
            label={{
              value: `Meta ${metaHoras} h (urgencias)`,
              fill: ROJO,
              fontSize: 12,
              position: 'insideTopRight',
            }}
          />
          <Bar dataKey="mediana" name="Mediana" fill={GRAFITO} />
          <Bar dataKey="p90" name="Percentil 90" fill={LIMA} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function SerieDeCarga({
  serie,
  lineaBase,
}: {
  serie: { etiqueta: string; horas: string | null }[]
  lineaBase: string
}) {
  const datos = serie.map((p) => ({ etiqueta: p.etiqueta, horas: paraDibujar(p.horas) }))
  return (
    <div className="grafico" aria-hidden="true">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={datos} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e3e7" />
          <XAxis dataKey="etiqueta" stroke={GRIS} fontSize={12} />
          <YAxis unit=" h" stroke={GRIS} fontSize={12} width={56} />
          <Tooltip />
          <ReferenceLine
            y={Number(lineaBase)}
            stroke={AMBAR}
            strokeDasharray="4 4"
            label={{
              value: `Línea de base ${lineaBase} h`,
              fill: AMBAR,
              fontSize: 12,
              position: 'insideTopRight',
            }}
          />
          <Line type="monotone" dataKey="horas" stroke={GRAFITO} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
