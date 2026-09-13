import { Prisma } from '@prisma/client'

import { SinConsorcioActivo } from '@/compartido/errores'
import { consorcioActivo } from '@/infraestructura/cliente-aislado'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * Lectura de las vistas materializadas de § 7.7 (`FR-017`, research R-11).
 *
 * Es una de las dos consultas del sistema que **no** pasan por la extension
 * de aislamiento —las vistas no son modelos—, asi que el filtro por consorcio
 * se escribe aca, en un solo lugar, y se exige: sin consorcio activo o sin
 * lista explicita, se lanza en vez de devolver todo (Principio I, RT-04).
 *
 * Todo importe sale de la base como `Decimal` y se entrega como **cadena**
 * (medida 3 de § 14.1); los porcentajes y las horas tambien, para que la
 * presentacion no haga cuentas.
 */

/** Con los decimales de la columna, siempre: «70» y «70.00» no son la misma cadena. */
const cadena = (valor: Prisma.Decimal | null, decimales: number): string | null =>
  valor === null ? null : valor.toFixed(decimales)

/** El consorcio activo, o la lista explicita del panel consolidado. Nunca «todos». */
function alcance(consorcios?: string[]): Prisma.Sql {
  if (consorcios) {
    if (consorcios.length === 0) return Prisma.sql`FALSE`
    return Prisma.sql`consorcio_id IN (${Prisma.join(consorcios.map((id) => Prisma.sql`${id}::uuid`))})`
  }
  const activo = consorcioActivo()
  if (!activo) throw new SinConsorcioActivo()
  return Prisma.sql`consorcio_id = ${activo}::uuid`
}

export interface MorosidadMensual {
  consorcioId: string
  anio: number
  mes: number
  masaLiquidada: string
  deudaVencida: string
  unidadesEnMora: number
  unidades: number
  porcentaje: string | null
}

export async function morosidadMensual(consorcios?: string[]): Promise<MorosidadMensual[]> {
  const filas = await prismaBase.$queryRaw<
    {
      consorcio_id: string
      anio: number
      mes: number
      masa_liquidada: Prisma.Decimal
      deuda_vencida: Prisma.Decimal
      unidades_en_mora: number
      unidades: number
      porcentaje: Prisma.Decimal | null
    }[]
  >`SELECT * FROM v_morosidad_consorcio WHERE ${alcance(consorcios)} ORDER BY consorcio_id, anio, mes`
  return filas.map((f) => ({
    consorcioId: f.consorcio_id,
    anio: f.anio,
    mes: f.mes,
    masaLiquidada: f.masa_liquidada.toFixed(2),
    deudaVencida: f.deuda_vencida.toFixed(2),
    unidadesEnMora: f.unidades_en_mora,
    unidades: f.unidades,
    porcentaje: cadena(f.porcentaje, 2),
  }))
}

export interface GastoRubroPeriodo {
  consorcioId: string
  rubroId: string
  rubro: string
  anio: number
  mes: number
  importe: string
  promedioMovil12: string | null
  desvioPorcentual: string | null
  periodosAnteriores: number
}

export async function gastoPorRubro(consorcios?: string[]): Promise<GastoRubroPeriodo[]> {
  const filas = await prismaBase.$queryRaw<
    {
      consorcio_id: string
      rubro_id: string
      rubro: string
      anio: number
      mes: number
      importe: Prisma.Decimal
      promedio_movil_12: Prisma.Decimal | null
      desvio_porcentual: Prisma.Decimal | null
      periodos_anteriores: number
    }[]
  >`SELECT v.*, r.nombre AS rubro
    FROM v_gasto_rubro_periodo v JOIN "RubroGasto" r ON r.id = v.rubro_id
    WHERE ${alcance(consorcios)} ORDER BY anio, mes, rubro`
  return filas.map((f) => ({
    consorcioId: f.consorcio_id,
    rubroId: f.rubro_id,
    rubro: f.rubro,
    anio: f.anio,
    mes: f.mes,
    importe: f.importe.toFixed(2),
    promedioMovil12: cadena(f.promedio_movil_12, 2),
    desvioPorcentual: cadena(f.desvio_porcentual, 1),
    periodosAnteriores: f.periodos_anteriores,
  }))
}

export interface DesempenoProveedor {
  consorcioId: string
  proveedorId: string
  proveedor: string
  rubroId: string | null
  rubro: string | null
  costoAcumulado: string
  contrataciones: number
  costoPromedio: string | null
  reclamosResueltos: number
  horasMediasResolucion: string | null
}

export async function desempenoProveedores(consorcios?: string[]): Promise<DesempenoProveedor[]> {
  const filas = await prismaBase.$queryRaw<
    {
      consorcio_id: string
      proveedor_id: string
      proveedor: string
      rubro_id: string | null
      rubro: string | null
      costo_acumulado: Prisma.Decimal
      contrataciones: number
      costo_promedio: Prisma.Decimal | null
      reclamos_resueltos: number
      horas_medias_resolucion: Prisma.Decimal | null
    }[]
  >`SELECT v.*, p.razon_social AS proveedor, r.nombre AS rubro
    FROM v_desempeno_proveedor v
    JOIN "Proveedor" p ON p.id = v.proveedor_id
    LEFT JOIN "RubroGasto" r ON r.id = v.rubro_id
    WHERE ${alcance(consorcios)} ORDER BY p.razon_social, r.nombre`
  return filas.map((f) => ({
    consorcioId: f.consorcio_id,
    proveedorId: f.proveedor_id,
    proveedor: f.proveedor,
    rubroId: f.rubro_id,
    rubro: f.rubro,
    costoAcumulado: f.costo_acumulado.toFixed(2),
    contrataciones: f.contrataciones,
    costoPromedio: cadena(f.costo_promedio, 2),
    reclamosResueltos: f.reclamos_resueltos,
    horasMediasResolucion: cadena(f.horas_medias_resolucion, 1),
  }))
}

export interface ResolucionReclamos {
  consorcioId: string
  rubroId: string | null
  rubro: string | null
  urgencia: string
  cantidad: number
  medianaHoras: string
  p90Horas: string
}

export async function resolucionReclamos(consorcios?: string[]): Promise<ResolucionReclamos[]> {
  const filas = await prismaBase.$queryRaw<
    {
      consorcio_id: string
      rubro_id: string | null
      rubro: string | null
      urgencia: string
      cantidad: number
      mediana_horas: Prisma.Decimal
      p90_horas: Prisma.Decimal
    }[]
  >`SELECT v.*, r.nombre AS rubro
    FROM v_resolucion_reclamos v LEFT JOIN "RubroGasto" r ON r.id = v.rubro_id
    WHERE ${alcance(consorcios)} ORDER BY r.nombre, v.urgencia`
  return filas.map((f) => ({
    consorcioId: f.consorcio_id,
    rubroId: f.rubro_id,
    rubro: f.rubro,
    urgencia: f.urgencia,
    cantidad: f.cantidad,
    medianaHoras: f.mediana_horas.toFixed(1),
    p90Horas: f.p90_horas.toFixed(1),
  }))
}

export interface PrecisionAsistencia {
  consorcioId: string
  anio: number
  mes: number
  extraccionesConfirmadas: number
  sinCorreccion: number
  sugerencias: number
  aceptadas: number
  horasAperturaALiquidacion: string | null
}

export async function precisionAsistencia(consorcios?: string[]): Promise<PrecisionAsistencia[]> {
  const filas = await prismaBase.$queryRaw<
    {
      consorcio_id: string
      anio: number
      mes: number
      extracciones_confirmadas: number
      sin_correccion: number
      sugerencias: number
      aceptadas: number
      horas_apertura_a_liquidacion: Prisma.Decimal | null
    }[]
  >`SELECT * FROM v_precision_asistencia WHERE ${alcance(consorcios)} ORDER BY anio, mes`
  return filas.map((f) => ({
    consorcioId: f.consorcio_id,
    anio: f.anio,
    mes: f.mes,
    extraccionesConfirmadas: f.extracciones_confirmadas,
    sinCorreccion: f.sin_correccion,
    sugerencias: f.sugerencias,
    aceptadas: f.aceptadas,
    horasAperturaALiquidacion: cadena(f.horas_apertura_a_liquidacion, 1),
  }))
}

/**
 * Refresca las cinco vistas por la funcion SECURITY DEFINER de la migracion:
 * `flay_app` no es dueño de nada y aun asi puede pedir el refresco. Devuelve la
 * hora, que el panel muestra.
 */
export async function refrescarVistas(): Promise<Date> {
  await prismaBase.$executeRaw`SELECT fn_refrescar_indicadores()`
  const momento = new Date()
  await prismaBase.refrescoIndicadores.upsert({
    where: { id: 1 },
    update: { refrescadoEn: momento },
    create: { id: 1, refrescadoEn: momento },
  })
  return momento
}

export async function ultimoRefresco(): Promise<Date | null> {
  const fila = await prismaBase.refrescoIndicadores.findUnique({ where: { id: 1 } })
  return fila?.refrescadoEn ?? null
}
