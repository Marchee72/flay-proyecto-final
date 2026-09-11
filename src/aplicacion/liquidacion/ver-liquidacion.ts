import { importeSerializado } from '@/compartido/formato'
import { NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma } from '@/infraestructura/prisma'

/**
 * Lectura de una liquidacion con su detalle (`RF-07`, `CU-03` paso 9).
 *
 * Todos los importes salen **como cadena**: la interfaz los formatea, nunca los
 * recalcula (medida 3 de § 14.1, `FR-020`).
 */

export interface LineaDeInteresVista {
  capital: string
  tasaMensual: string
  meses: number
  importe: string
}

export interface DetalleDeLaLiquidacion {
  id: string
  designacion: string
  coeficienteAplicado: string
  importeOrdinario: string
  importeExtraordinario: string
  deudaAnterior: string
  interesMora: string
  saldoAFavorAplicado: string
  ajusteRedondeo: string
  totalUnidad: string
  intereses: LineaDeInteresVista[]
  tieneDocumento: boolean
}

export interface LiquidacionConDetalle {
  id: string
  estado: string
  periodo: string
  vencimiento: string
  totalOrdinario: string
  totalExtraordinario: string
  totalGeneral: string
  anulaA: string | null
  detalles: DetalleDeLaLiquidacion[]
}

export async function verLiquidacion(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; liquidacionId: string },
): Promise<LiquidacionConDetalle> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador', 'consejo'],
      accion: 'ver la liquidación',
    },
    async () => {
      const liquidacion = await prisma.liquidacion.findFirst({
        where: { id: datos.liquidacionId },
        include: {
          periodo: { select: { anio: true, mes: true } },
          detalles: {
            orderBy: { unidad: { designacion: 'asc' } },
            include: {
              unidad: { select: { designacion: true } },
              intereses: { orderBy: { meses: 'desc' } },
            },
          },
        },
      })

      if (!liquidacion) throw new NoEncontrado()

      return {
        id: liquidacion.id,
        estado: liquidacion.estado,
        periodo: `${String(liquidacion.periodo.mes).padStart(2, '0')}/${liquidacion.periodo.anio}`,
        vencimiento: liquidacion.vencimiento.toISOString().slice(0, 10),
        totalOrdinario: importeSerializado(liquidacion.totalOrdinario),
        totalExtraordinario: importeSerializado(liquidacion.totalExtraordinario),
        totalGeneral: importeSerializado(liquidacion.totalGeneral),
        anulaA: liquidacion.anulaAId,
        detalles: liquidacion.detalles.map((detalle) => ({
          id: detalle.id,
          designacion: detalle.unidad.designacion,
          coeficienteAplicado: detalle.coeficienteAplicado.toFixed(8),
          importeOrdinario: importeSerializado(detalle.importeOrdinario),
          importeExtraordinario: importeSerializado(detalle.importeExtraordinario),
          deudaAnterior: importeSerializado(detalle.deudaAnterior),
          interesMora: importeSerializado(detalle.interesMora),
          saldoAFavorAplicado: importeSerializado(detalle.saldoAFavorAplicado),
          ajusteRedondeo: importeSerializado(detalle.ajusteRedondeo),
          totalUnidad: importeSerializado(detalle.totalUnidad),
          intereses: detalle.intereses.map((linea) => ({
            capital: importeSerializado(linea.capital),
            tasaMensual: linea.tasaMensual.toFixed(4),
            meses: linea.meses,
            importe: importeSerializado(linea.importe),
          })),
          tieneDocumento: detalle.claveDocumento !== null,
        })),
      }
    },
  )
}
