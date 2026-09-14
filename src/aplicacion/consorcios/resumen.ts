import { Decimal } from '@/compartido/dinero'
import { RolInsuficiente } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { verMorosidad } from '@/aplicacion/pagos/estado-de-cuenta'
import { prisma, prismaBase } from '@/infraestructura/prisma'

export interface ResumenConsorcio {
  roles: string[]
  periodoAbierto: { id: string; etiqueta: string; vencimiento: string } | null
  /** Suma de los gastos del periodo abierto, `'0.00'` si no hay. */
  gastosDelPeriodo: string
  /** Porcentaje de unidades en mora, null sin liquidaciones vencidas. */
  morosidad: { unidadesEnMora: number; unidadesTotales: number; deudaTotal: string } | null
  reclamosAbiertos: number
  reclamosCriticos: number
  /** Solo administrador y consejo lo ven; para el resto, null. */
  padron: { unidades: number; cuadra: boolean } | null
  ultimosGastos: {
    id: string
    fecha: string
    descripcion: string
    rubro: string
    importe: string
  }[]
  ultimosPagos: { id: string; fecha: string; unidad: string; importe: string }[]
  reclamosSinResponder: { id: string; titulo: string; urgencia: string; fechaApertura: string }[]
  contactos: { nombre: string; rol: string; correo: string; telefono: string | null }[]
  proveedores: {
    id: string
    razonSocial: string
    rubro: string | null
    telefono: string | null
    correo: string | null
  }[]
}

const etiqueta = (p: { anio: number; mes: number }) => `${String(p.mes).padStart(2, '0')}/${p.anio}`

/**
 * El tablero del consorcio (diseno 2026-09-13 § 4.2): un `Promise.all` sobre
 * lecturas que ya existen o consultas aisladas simples. Lo que un rol no
 * puede ver vuelve como null, no como error: el resumen es de todos los roles,
 * cada uno con lo suyo. Las «ultimas cosas» salen de las entidades, no de la
 * bitacora, que guarda los importes como numero JSON.
 */
export async function verResumenConsorcio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<ResumenConsorcio> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'ver el resumen' },
    async (acceso) => {
      const sinRol = <T>(promesa: Promise<T>): Promise<T | null> =>
        promesa.catch((error) => {
          if (error instanceof RolInsuficiente) return null
          throw error
        })

      const [
        consorcio,
        abierto,
        reclamos,
        gastos,
        pagos,
        habilitaciones,
        proveedores,
        padron,
        mora,
      ] = await Promise.all([
        prismaBase.consorcio.findUniqueOrThrow({
          where: { id: datos.consorcioId },
          select: { diaVencimiento: true },
        }),
        prisma.periodo.findFirst({
          where: { estado: 'abierto' },
          orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
          select: { id: true, anio: true, mes: true },
        }),
        prisma.reclamo.findMany({
          where: { estado: { in: ['abierto', 'asignado', 'en_curso'] } },
          select: { id: true, titulo: true, urgencia: true, fechaApertura: true },
          orderBy: [{ urgencia: 'desc' }, { fechaApertura: 'asc' }],
        }),
        prisma.gasto.findMany({
          take: 5,
          orderBy: [{ creadoEn: 'desc' }],
          select: {
            id: true,
            fecha: true,
            descripcion: true,
            importe: true,
            rubro: { select: { nombre: true } },
          },
        }),
        prisma.pago.findMany({
          take: 5,
          orderBy: [{ creadoEn: 'desc' }],
          select: {
            id: true,
            fechaPago: true,
            importe: true,
            unidad: { select: { designacion: true } },
          },
        }),
        prisma.habilitacion.findMany({
          where: {
            rol: { in: ['administrador', 'consejo'] },
            OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: reloj.hoy() } }],
          },
          select: { rol: true, usuario: { select: { persona: true } } },
          orderBy: [{ rol: 'asc' }, { creadoEn: 'asc' }],
        }),
        prisma.proveedor.findMany({
          select: {
            id: true,
            razonSocial: true,
            telefono: true,
            correo: true,
            rubroHabitual: { select: { nombre: true } },
          },
          orderBy: { razonSocial: 'asc' },
        }),
        sinRol(verConsorcio(repositorio, reloj, datos)),
        verMorosidad(repositorio, reloj, datos),
      ])

      const gastosDelPeriodo = abierto
        ? await prisma.gasto.aggregate({
            where: { periodoId: abierto.id },
            _sum: { importe: true },
          })
        : null

      return {
        roles: acceso.roles,
        periodoAbierto: abierto
          ? {
              id: abierto.id,
              etiqueta: etiqueta(abierto),
              // Vence el dia fijado del mes siguiente al del periodo (RN-05).
              vencimiento: fechaISO(abierto.anio, abierto.mes + 1, consorcio.diaVencimiento),
            }
          : null,
        gastosDelPeriodo: (gastosDelPeriodo?._sum.importe ?? new Decimal(0)).toFixed(2),
        morosidad:
          mora.agregado.unidadesTotales > 0 && mora.agregado.unidadesEnMora > 0
            ? mora.agregado
            : null,
        reclamosAbiertos: reclamos.length,
        reclamosCriticos: reclamos.filter((r) => r.urgencia === 'critica').length,
        padron: padron
          ? {
              unidades: padron.unidades.length,
              cuadra: padron.unidades.length === 0 || padron.cuadra,
            }
          : null,
        ultimosGastos: gastos.map((g) => ({
          id: g.id,
          fecha: g.fecha.toISOString().slice(0, 10),
          descripcion: g.descripcion,
          rubro: g.rubro.nombre,
          importe: g.importe.toFixed(2),
        })),
        ultimosPagos: pagos.map((p) => ({
          id: p.id,
          fecha: p.fechaPago.toISOString().slice(0, 10),
          unidad: p.unidad.designacion,
          importe: p.importe.toFixed(2),
        })),
        reclamosSinResponder: reclamos.slice(0, 5).map((r) => ({
          id: r.id,
          titulo: r.titulo,
          urgencia: r.urgencia,
          fechaApertura: r.fechaApertura.toISOString(),
        })),
        contactos: habilitaciones.map((h) => ({
          nombre: `${h.usuario.persona.nombre} ${h.usuario.persona.apellido}`,
          rol: h.rol,
          correo: h.usuario.persona.correo ?? '',
          telefono: h.usuario.persona.telefono,
        })),
        proveedores: proveedores.map((p) => ({
          id: p.id,
          razonSocial: p.razonSocial,
          rubro: p.rubroHabitual?.nombre ?? null,
          telefono: p.telefono,
          correo: p.correo,
        })),
      }
    },
  )
}

function fechaISO(anio: number, mes: number, dia: number): string {
  // Mes 13 pasa al anio siguiente; Date lo normaliza (mes en base cero).
  return new Date(Date.UTC(anio, mes - 1, dia)).toISOString().slice(0, 10)
}
