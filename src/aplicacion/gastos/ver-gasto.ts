import { importeSerializado } from '@/compartido/formato'
import { NoEncontrado } from '@/compartido/errores'
import { TIPOS_SOLO_DESCARGA, type AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Detalle de un gasto (RF-10). El importe sale **como cadena**: es el borde
 * donde la medida 3 de § 14.1 se cumple o se pierde (SC-010).
 *
 * Un gasto de otro consorcio no aparece: lo filtra la extension, no esta
 * consulta (Principio I).
 */

/** Ventana de la direccion de lectura: alcanza para abrir el archivo. */
const SEGUNDOS = 600

export interface ComprobanteDelGasto {
  id: string
  tipoContenido: string
  bytes: number
  estado: string
  soloDescarga: boolean
  /** Vacia mientras la subida no confirmo: todavia no hay nada que mostrar. */
  direccion: string
}

export interface GastoConDetalle {
  id: string
  importe: string
  clasificacion: string
  fecha: string
  descripcion: string
  rubro: string
  proveedor: string | null
  periodo: string
  periodoAbierto: boolean
  comprobantes: ComprobanteDelGasto[]
}

export async function verGasto(
  almacen: AlmacenObjetos,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; gastoId: string },
): Promise<GastoConDetalle> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver el gasto' },
    async () => {
      const gasto = await prisma.gasto.findFirst({
        where: { id: datos.gastoId },
        include: { rubro: true, proveedor: true, periodo: true },
      })

      if (!gasto) throw new NoEncontrado()

      const comprobantes = await prismaBase.comprobante.findMany({
        where: { gastoId: gasto.id },
        orderBy: { creadoEn: 'asc' },
      })

      return {
        id: gasto.id,
        importe: importeSerializado(gasto.importe),
        clasificacion: gasto.clasificacion,
        fecha: gasto.fecha.toISOString().slice(0, 10),
        descripcion: gasto.descripcion,
        rubro: gasto.rubro.nombre,
        proveedor: gasto.proveedor?.razonSocial ?? null,
        periodo: `${String(gasto.periodo.mes).padStart(2, '0')}/${gasto.periodo.anio}`,
        periodoAbierto: gasto.periodo.estado === 'abierto',
        comprobantes: await Promise.all(
          comprobantes.map(async (comprobante) => ({
            id: comprobante.id,
            tipoContenido: comprobante.tipoContenido,
            bytes: comprobante.bytes,
            estado: comprobante.estado,
            soloDescarga: (TIPOS_SOLO_DESCARGA as readonly string[]).includes(
              comprobante.tipoContenido,
            ),
            // La direccion se resuelve recien aca, con la habilitacion ya
            // verificada: el comprobante no es publico (FR-018). Si el almacen
            // no responde, el gasto se ve igual y el comprobante dice que no.
            direccion:
              comprobante.estado === 'disponible'
                ? await almacen
                    .resolverLecturaAutorizada(comprobante.claveObjeto, SEGUNDOS)
                    .catch(() => '')
                : '',
          })),
        ),
      }
    },
  )
}
