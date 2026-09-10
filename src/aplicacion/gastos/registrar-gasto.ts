import { importe } from '@/compartido/dinero'
import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { exigirPeriodoConGastos } from '@/dominio/periodos/estado'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Alta de gasto (RF-04, FR-016).
 *
 * Dos reglas que no son evidentes leyendo el formulario:
 *
 * - El periodo tiene que estar **abierto** (regla RN-03). Un gasto que aparece
 *   en un periodo ya liquidado cambiaria una expensa que los consorcistas ya
 *   recibieron.
 * - La clasificacion se **congela en el gasto** (regla RN-04). Se copia del
 *   rubro al registrarlo y despues no lo sigue: si manana el rubro se
 *   reclasifica, una liquidacion vieja no puede cambiar de sentido.
 *
 * El importe entra y sale como **cadena**: el tipo numerico nativo no aguanta
 * quince digitos significativos sin perder centavos (medida 3 de § 14.1).
 */

export class ImporteInvalido extends ErrorDeAplicacion {
  constructor() {
    super('El importe tiene que ser un número con hasta dos decimales, mayor que cero.', 'RF-04')
  }
}

const IMPORTE_VALIDO = /^\d{1,12}(\.\d{1,2})?$/

export async function registrarGasto(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    periodoId: string
    rubroId: string
    proveedorId?: string | null
    importe: string
    fecha: Date
    descripcion: string
  },
): Promise<{ gastoId: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'registrar gastos',
    },
    async () => {
      const monto = datos.importe.trim()

      if (!IMPORTE_VALIDO.test(monto) || importe(monto).isZero()) throw new ImporteInvalido()

      // El aislamiento decide si el periodo es de este consorcio: la consulta no
      // escribe el filtro (Principio I).
      const periodo = await prisma.periodo.findFirst({ where: { id: datos.periodoId } })
      if (!periodo) throw new NoEncontrado()

      exigirPeriodoConGastos(periodo.estado)

      // El rubro es catalogo global: no cuelga de consorcio.
      const rubro = await prismaBase.rubroGasto.findUnique({ where: { id: datos.rubroId } })
      if (!rubro) throw new NoEncontrado()

      if (datos.proveedorId) {
        const proveedor = await prisma.proveedor.findFirst({ where: { id: datos.proveedorId } })
        if (!proveedor) throw new NoEncontrado()
      }

      const gasto = await prisma.gasto.create({
        data: sinConsorcio({
          periodoId: periodo.id,
          rubroId: rubro.id,
          proveedorId: datos.proveedorId ?? null,
          importe: monto,
          clasificacion: rubro.clasificacion,
          fecha: datos.fecha,
          descripcion: datos.descripcion.trim(),
          cargadoPor: datos.usuarioId,
        }),
      })

      return { gastoId: gasto.id }
    },
  )
}
