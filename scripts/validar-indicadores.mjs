// SC-009 y SC-022: los indicadores contra un calculo independiente. Recalcula
// I-1 a I-5 en JavaScript con decimal.js a partir de las tablas base, y los
// compara con las vistas materializadas fila por fila, con tolerancia cero.
// Imprime cada diferencia. Corre sobre lo que haya en la base: la semilla de
// § 13.4 con doce periodos liquidados (`npm run semilla:volumen`) es lo que
// el plan pide.
//
//   npm run validar:indicadores
import { existsSync } from 'node:fs'

import { PrismaClient } from '@prisma/client'
import { Decimal } from 'decimal.js'

if (existsSync('.env')) process.loadEnvFile('.env')

const prisma = new PrismaClient()
const diferencias = []
const D = (v) => new Decimal(v === null || v === undefined ? 0 : v.toString())
const clave = (...partes) => partes.map((p) => p ?? 'null').join('|')

function comparar(indicador, esperado, obtenido) {
  for (const [k, e] of esperado) {
    const o = obtenido.get(k)
    if (!o) {
      diferencias.push(`${indicador} ${k}: falta en la vista`)
      continue
    }
    for (const campo of Object.keys(e)) {
      if (e[campo] !== o[campo])
        diferencias.push(`${indicador} ${k} ${campo}: calculado ${e[campo]}, vista ${o[campo]}`)
    }
  }
  for (const k of obtenido.keys())
    if (!esperado.has(k)) diferencias.push(`${indicador} ${k}: sobra en la vista`)
}

try {
  await prisma.$executeRaw`SELECT fn_refrescar_indicadores()`
  const hoy = new Date()
  hoy.setUTCHours(0, 0, 0, 0)

  // ---- I-1 -----------------------------------------------------------------
  const liquidaciones = await prisma.liquidacion.findMany({
    where: { estado: 'vigente' },
    include: {
      periodo: true,
      detalles: { include: { imputaciones: { where: { revertidaEn: null } } } },
    },
  })
  const i1 = new Map()
  for (const l of liquidaciones) {
    const k = clave(l.consorcioId, l.periodo.anio, l.periodo.mes)
    const acc = i1.get(k) ?? { masa: D(0), deuda: D(0), enMora: 0, unidades: 0 }
    const vencida = l.vencimiento < hoy
    for (const d of l.detalles) {
      const pagado = d.imputaciones.reduce((t, i) => t.plus(D(i.importeImputado)), D(0))
      const saldo = D(d.totalUnidad).minus(pagado)
      acc.masa = acc.masa.plus(D(d.totalUnidad))
      acc.unidades++
      if (vencida && saldo.greaterThan(0)) {
        acc.deuda = acc.deuda.plus(saldo)
        acc.enMora++
      }
    }
    i1.set(k, acc)
  }
  const i1Esperado = new Map(
    [...i1].map(([k, a]) => [
      k,
      {
        masa_liquidada: a.masa.toFixed(2),
        deuda_vencida: a.deuda.toFixed(2),
        unidades_en_mora: a.enMora,
        unidades: a.unidades,
        porcentaje: a.masa.isZero()
          ? null
          : a.deuda
              .times(100)
              .dividedBy(a.masa)
              .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
              .toFixed(2),
      },
    ]),
  )
  const v1 = await prisma.$queryRaw`SELECT * FROM v_morosidad_consorcio`
  comparar(
    'I-1',
    i1Esperado,
    new Map(
      v1.map((f) => [
        clave(f.consorcio_id, f.anio, f.mes),
        {
          masa_liquidada: f.masa_liquidada.toFixed(2),
          deuda_vencida: f.deuda_vencida.toFixed(2),
          unidades_en_mora: f.unidades_en_mora,
          unidades: f.unidades,
          porcentaje: f.porcentaje === null ? null : f.porcentaje.toFixed(2),
        },
      ]),
    ),
  )

  // ---- I-2 -----------------------------------------------------------------
  const gastos = await prisma.gasto.findMany({ include: { periodo: true } })
  const porSerie = new Map()
  for (const g of gastos) {
    const k = clave(g.consorcioId, g.rubroId)
    const serie = porSerie.get(k) ?? new Map()
    const p = clave(g.periodo.anio, String(g.periodo.mes).padStart(2, '0'))
    serie.set(p, (serie.get(p) ?? D(0)).plus(D(g.importe)))
    porSerie.set(k, serie)
  }
  const i2Esperado = new Map()
  for (const [k, serie] of porSerie) {
    const [consorcioId, rubroId] = k.split('|')
    const periodos = [...serie.keys()].sort()
    periodos.forEach((p, i) => {
      const anteriores = periodos.slice(Math.max(0, i - 12), i)
      const importe = serie.get(p)
      let promedio = null
      let desvio = null
      if (anteriores.length >= 12) {
        const suma = anteriores.reduce((t, q) => t.plus(serie.get(q)), D(0))
        const bruto = suma.dividedBy(anteriores.length)
        promedio = bruto.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
        if (bruto.greaterThan(0))
          desvio = importe
            .minus(bruto)
            .times(100)
            .dividedBy(bruto)
            .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
            .toFixed(1)
      }
      const [anio, mes] = p.split('|')
      i2Esperado.set(clave(consorcioId, rubroId, Number(anio), Number(mes)), {
        importe: importe.toFixed(2),
        promedio_movil_12: promedio,
        desvio_porcentual: desvio,
        periodos_anteriores: anteriores.length,
      })
    })
  }
  const v2 = await prisma.$queryRaw`SELECT * FROM v_gasto_rubro_periodo`
  comparar(
    'I-2',
    i2Esperado,
    new Map(
      v2.map((f) => [
        clave(f.consorcio_id, f.rubro_id, f.anio, f.mes),
        {
          importe: f.importe.toFixed(2),
          promedio_movil_12: f.promedio_movil_12 === null ? null : f.promedio_movil_12.toFixed(2),
          desvio_porcentual: f.desvio_porcentual === null ? null : f.desvio_porcentual.toFixed(1),
          periodos_anteriores: f.periodos_anteriores,
        },
      ]),
    ),
  )

  // ---- I-3 (costo; las horas se verifican en I-4 con la misma formula) ------
  const i3Esperado = new Map()
  for (const g of gastos) {
    if (!g.proveedorId) continue
    const k = clave(g.consorcioId, g.proveedorId, g.rubroId)
    const acc = i3Esperado.get(k) ?? { costo: D(0), n: 0 }
    acc.costo = acc.costo.plus(D(g.importe))
    acc.n++
    i3Esperado.set(k, acc)
  }
  const v3 = await prisma.$queryRaw`SELECT * FROM v_desempeno_proveedor WHERE contrataciones > 0`
  comparar(
    'I-3',
    new Map(
      [...i3Esperado].map(([k, a]) => [
        k,
        {
          costo_acumulado: a.costo.toFixed(2),
          contrataciones: a.n,
          costo_promedio: a.costo
            .dividedBy(a.n)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
            .toFixed(2),
        },
      ]),
    ),
    new Map(
      v3.map((f) => [
        clave(f.consorcio_id, f.proveedor_id, f.rubro_id),
        {
          costo_acumulado: f.costo_acumulado.toFixed(2),
          contrataciones: f.contrataciones,
          costo_promedio: f.costo_promedio.toFixed(2),
        },
      ]),
    ),
  )

  // ---- I-4 -----------------------------------------------------------------
  const resueltos = await prisma.reclamo.findMany({ where: { fechaResolucion: { not: null } } })
  const grupos = new Map()
  for (const r of resueltos) {
    const k = clave(r.consorcioId, r.rubroId, r.urgencia)
    const horas = (r.fechaResolucion.getTime() - r.fechaApertura.getTime()) / 3_600_000
    grupos.set(k, [...(grupos.get(k) ?? []), horas])
  }
  // percentile_cont: interpolacion lineal entre vecinos, como Postgres.
  const percentil = (valores, p) => {
    const v = [...valores].sort((a, b) => a - b)
    const pos = (v.length - 1) * p
    const base = Math.floor(pos)
    const resto = pos - base
    return v[base + 1] !== undefined ? v[base] + resto * (v[base + 1] - v[base]) : v[base]
  }
  const i4Esperado = new Map(
    [...grupos].map(([k, v]) => [
      k,
      {
        cantidad: v.length,
        mediana_horas: new Decimal(percentil(v, 0.5))
          .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
          .toFixed(1),
        p90_horas: new Decimal(percentil(v, 0.9))
          .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
          .toFixed(1),
      },
    ]),
  )
  const v4 = await prisma.$queryRaw`SELECT * FROM v_resolucion_reclamos`
  comparar(
    'I-4',
    i4Esperado,
    new Map(
      v4.map((f) => [
        clave(f.consorcio_id, f.rubro_id, f.urgencia),
        {
          cantidad: f.cantidad,
          mediana_horas: f.mediana_horas.toFixed(1),
          p90_horas: f.p90_horas.toFixed(1),
        },
      ]),
    ),
  )

  // ---- I-5 (conteos) ---------------------------------------------------------
  const extracciones = await prisma.extraccionComprobante.findMany({
    where: { procesadoEn: { not: null } },
  })
  const i5 = new Map()
  for (const e of extracciones) {
    const k = clave(e.consorcioId, e.procesadoEn.getUTCFullYear(), e.procesadoEn.getUTCMonth() + 1)
    const acc = i5.get(k) ?? { confirmadas: 0, sinCorreccion: 0 }
    if (e.estado === 'confirmada' || e.estado === 'corregida') acc.confirmadas++
    if (e.estado === 'confirmada') acc.sinCorreccion++
    i5.set(k, acc)
  }
  const v5 =
    await prisma.$queryRaw`SELECT * FROM v_precision_asistencia WHERE extracciones_confirmadas > 0 OR sin_correccion > 0`
  comparar(
    'I-5',
    new Map(
      [...i5]
        .filter(([, a]) => a.confirmadas > 0)
        .map(([k, a]) => [
          k,
          { extracciones_confirmadas: a.confirmadas, sin_correccion: a.sinCorreccion },
        ]),
    ),
    new Map(
      v5.map((f) => [
        clave(f.consorcio_id, f.anio, f.mes),
        { extracciones_confirmadas: f.extracciones_confirmadas, sin_correccion: f.sin_correccion },
      ]),
    ),
  )

  const filas = i1Esperado.size + i2Esperado.size + i3Esperado.size + i4Esperado.size + i5.size
  if (diferencias.length > 0) {
    console.error(`Diferencias (${diferencias.length}) sobre ${filas} filas:`)
    for (const d of diferencias) console.error(`  - ${d}`)
    process.exit(1)
  }
  console.log(
    `Los indicadores coinciden con el calculo independiente: ${filas} filas, tolerancia cero.`,
  )
} finally {
  await prisma.$disconnect()
}
