import { coeficienteSerializado } from '@/compartido/formato'
import { sumarCoeficientes, SUMA_EXIGIDA } from '@/dominio/coeficientes/suma'
import { importe } from '@/compartido/dinero'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Lectura de un consorcio con su padron (RF-01, RF-02).
 *
 * Los coeficientes salen como **cadena de ocho decimales**, nunca como numero:
 * el tipo numerico nativo no representa ocho decimales sin perder nada, y la
 * perdida se veria recien en la liquidacion (FR-013, medida 3 de § 14.1).
 */

export interface UnidadDelPadron {
  id: string
  designacion: string
  /** `departamento`, `cochera`, `local` o `baulera` (punto 7). */
  tipo: string
  coeficiente: string
}

export interface ConsorcioConPadron {
  id: string
  nombre: string
  direccion: string
  localidad: string
  cuit: string
  unidades: UnidadDelPadron[]
  /** Suma corriente, para que el rechazo del final no sea una sorpresa. */
  suma: string
  /** Con signo: negativa si falta, positiva si sobra. Vacia si cuadra. */
  diferencia: string
  cuadra: boolean
}

export async function verConsorcio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<ConsorcioConPadron> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador', 'consejo'],
      accion: 'ver el consorcio',
    },
    async () => {
      // La cabecera no lleva `consorcio_id`: es el consorcio. El aislamiento ya
      // decidio, antes de llegar aca, que este usuario lo alcanza.
      const consorcio = await prismaBase.consorcio.findUniqueOrThrow({
        where: { id: datos.consorcioId },
      })

      const unidades = await prisma.unidad.findMany({ orderBy: { designacion: 'asc' } })

      const suma = sumarCoeficientes(
        unidades.map((unidad) => ({
          designacion: unidad.designacion,
          coeficiente: importe(unidad.coeficiente.toFixed(8)),
        })),
      )

      return {
        id: consorcio.id,
        nombre: consorcio.nombre,
        direccion: consorcio.direccion,
        localidad: consorcio.localidad,
        cuit: consorcio.cuit,
        unidades: unidades.map((unidad) => ({
          id: unidad.id,
          designacion: unidad.designacion,
          tipo: unidad.tipo,
          coeficiente: coeficienteSerializado(unidad.coeficiente),
        })),
        suma: coeficienteSerializado(suma.total),
        diferencia: suma.cuadra ? '' : coeficienteSerializado(suma.diferencia),
        cuadra: suma.cuadra && suma.total.equals(SUMA_EXIGIDA),
      }
    },
  )
}
