import { conAutorizacionDeAdministradora } from '@/aplicacion/autorizacion'
import type { Transaccion } from '@/aplicacion/comunicacion/notificar'
import { HORAS_MARGEN_ACREDITACION } from '@/aplicacion/pagos/conciliar-pago-en-linea'
import { cancelarReservasFuturas } from '@/aplicacion/reservas/espacios'
import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { enConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Eliminar un consorcio (RN-22, CCyC 2067). Sin movimiento —lo cargado por
 * error— se borra entero; con historia se archiva en solo lectura, y el
 * candado de la base (`consorcio_no_archivado`) rechaza cualquier escritura.
 * Lo hace quien da de alta consorcios: el nivel de la administradora.
 */

export interface PreviaDeEliminarConsorcio {
  accion: 'borrar' | 'archivar'
  pagosEnCurso: number
  asambleasEnCurso: number
  actasSinFirmar: number
  reservasFuturas: number
}

export class ConsorcioConPagosEnCurso extends ErrorDeAplicacion {
  constructor(n: number) {
    super(`Hay ${n} pagos en línea sin confirmar; podés archivar cuando terminen.`, 'RN-22')
  }
}

export class ConsorcioConAsambleaEnCurso extends ErrorDeAplicacion {
  constructor() {
    super('Hay una asamblea convocada o en curso; podés archivar cuando termine.', 'RN-22')
  }
}

export class ConsorcioConActaSinFirmar extends ErrorDeAplicacion {
  constructor() {
    super('Hay un acta de asamblea esperando firmas; podés archivar cuando esté firmada.', 'RN-22')
  }
}

type Datos = { usuarioId: string; consorcioId: string }

/** Autoriza al nivel de la administradora dueña y corre `trabajo` con el consorcio activo. */
async function comoAdministradora<T>(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos,
  accion: string,
  trabajo: () => Promise<T>,
): Promise<T> {
  const consorcio = await prismaBase.consorcio.findUnique({
    where: { id: datos.consorcioId },
    select: { administradoraId: true },
  })
  if (!consorcio) throw new NoEncontrado()
  return conAutorizacionDeAdministradora(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, administradoraId: consorcio.administradoraId, accion },
    () => enConsorcio(datos.consorcioId, trabajo),
  )
}

/**
 * Cuenta el movimiento (§ 3.1) y lo que bloquea archivar. Corre con el consorcio
 * activo; uno archivado no se encuentra (se restaura, no se vuelve a eliminar).
 */
async function previa(
  cliente: Transaccion | typeof prisma,
  consorcioId: string,
  ahora: Date,
): Promise<PreviaDeEliminarConsorcio> {
  const consorcio = await cliente.consorcio.findUnique({
    where: { id: consorcioId },
    select: {
      archivadoEn: true,
      _count: {
        select: {
          periodos: true,
          gastos: true,
          liquidaciones: true,
          pagos: true,
          reclamos: true,
          reservas: true,
          asambleas: true,
          documentos: true,
          novedades: true,
        },
      },
    },
  })
  if (!consorcio || consorcio.archivadoEn) throw new NoEncontrado()
  const movimiento = consorcio._count
  // Lo que la conciliación todavía puede confirmar (nota 29): uno con preferencia,
  // aunque esté `rechazado` o `vencido` por otro más nuevo, hasta `venceEn` + 72 h.
  // El `iniciado` cuenta siempre: puede estar creando su preferencia ahora mismo.
  const pagosEnCurso = await cliente.intentoDePago.count({
    where: {
      venceEn: { gt: new Date(ahora.getTime() - HORAS_MARGEN_ACREDITACION * 3_600_000) },
      OR: [
        { estado: 'iniciado' },
        { estado: { in: ['rechazado', 'vencido'] }, preferenciaId: { not: null } },
      ],
    },
  })
  const asambleasEnCurso = await cliente.asamblea.count({
    where: { estado: { in: ['convocada', 'en_curso'] } },
  })
  // Un acta en firma tiene que poder cerrarse (nota 30); archivada, no se firmaría nunca.
  const actasSinFirmar = await cliente.actaAsamblea.count({ where: { estado: 'a_firmar' } })
  const reservasFuturas = await cliente.reserva.count({
    where: { estado: 'confirmada', hasta: { gt: ahora } },
  })
  return {
    accion: Object.values(movimiento).some((n) => n > 0) ? 'archivar' : 'borrar',
    pagosEnCurso,
    asambleasEnCurso,
    actasSinFirmar,
    reservasFuturas,
  }
}

export async function previaDeEliminarConsorcio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos,
): Promise<PreviaDeEliminarConsorcio> {
  return comoAdministradora(repositorio, reloj, datos, 'eliminar un consorcio', () =>
    previa(prisma, datos.consorcioId, reloj.ahora()),
  )
}

/**
 * Lo que no es movimiento, en orden de claves foráneas. El padrón se va entero
 * en la misma transacción: los disparadores diferidos de RN-01 admiten un
 * consorcio sin unidades. Las notificaciones quedan, con `consorcio_id` nulo.
 */
async function borrarVacio(tx: Transaccion, consorcioId: string): Promise<void> {
  await tx.conversacionAsistente.deleteMany({})
  await tx.consultaDocumental.deleteMany({})
  await tx.extraccionComprobante.deleteMany({})
  await tx.suspensionEspacio.deleteMany({})
  await tx.espacioComun.deleteMany({})
  await tx.proveedor.deleteMany({})
  await tx.tramoVencimiento.deleteMany({})
  const unidades = (await tx.unidad.findMany({ select: { id: true } })).map((u) => u.id)
  await tx.ocupacion.deleteMany({ where: { unidadId: { in: unidades } } })
  await tx.coeficienteHistorico.deleteMany({ where: { unidadId: { in: unidades } } })
  await tx.unidad.deleteMany({})
  await tx.habilitacion.deleteMany({})
  // La auditoría (RN-15) deja el BORRA del consorcio.
  await tx.consorcio.delete({ where: { id: consorcioId } })
}

export async function eliminarConsorcio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos,
): Promise<'borrado' | 'archivado'> {
  return comoAdministradora(repositorio, reloj, datos, 'eliminar un consorcio', () =>
    prisma.$transaction(async (tx) => {
      // Contra `iniciarPagoEnLinea`, que toma la misma fila en modo compartido:
      // ningún intento se cuela entre contar los pagos en curso y archivar.
      await tx.$queryRaw`SELECT 1 FROM "Consorcio" WHERE id = ${datos.consorcioId}::uuid FOR UPDATE`
      const ahora = reloj.ahora()
      const estado = await previa(tx, datos.consorcioId, ahora)
      if (estado.accion === 'borrar') {
        await borrarVacio(tx, datos.consorcioId)
        return 'borrado' as const
      }
      if (estado.pagosEnCurso > 0) throw new ConsorcioConPagosEnCurso(estado.pagosEnCurso)
      if (estado.asambleasEnCurso > 0) throw new ConsorcioConAsambleaEnCurso()
      if (estado.actasSinFirmar > 0) throw new ConsorcioConActaSinFirmar()
      await cancelarReservasFuturas(
        tx,
        ahora,
        {},
        'El consorcio fue archivado',
        (espacio) => `El consorcio fue archivado y tu reserva de ${espacio} quedó cancelada.`,
      )
      await tx.consorcio.update({ where: { id: datos.consorcioId }, data: { archivadoEn: ahora } })
      return 'archivado' as const
    }),
  )
}

/** Todo vuelve como estaba; las reservas canceladas al archivar no se reviven. */
export async function restaurarConsorcio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos,
): Promise<void> {
  return comoAdministradora(repositorio, reloj, datos, 'restaurar un consorcio', async () => {
    const { count } = await prismaBase.consorcio.updateMany({
      where: { id: datos.consorcioId, archivadoEn: { not: null } },
      data: { archivadoEn: null },
    })
    if (count === 0) throw new NoEncontrado()
  })
}
