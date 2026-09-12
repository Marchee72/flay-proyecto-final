import type { EstadoExtraccion } from '@prisma/client'
import { z } from 'zod'

import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { ExtractorDocumental } from '@/dominio/contratos/asistencia'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { exigirPeriodoConGastos } from '@/dominio/periodos/estado'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { claveEsDe } from '@/aplicacion/comunicacion/objetos'
import { importe as aImporte } from '@/compartido/dinero'
import type { Manejador } from '@/aplicacion/pendientes/drenar'
import { rubrosParaClasificar } from '@/aplicacion/reclamos/sugerencia'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Carga asistida de comprobantes (`RF-06`, `CU-13`, `FR-026`, research R-03,
 * R-04). El comprobante se sube **antes** de que exista el gasto; la
 * extraccion corre en la cola; la pantalla de alta de 002 se abre con los
 * valores precargados; y el gasto nace **solo** en `confirmarExtraccion`, con
 * los valores que la persona envio (regla RN-14 § 7.2, SC-017). Lo que la
 * persona cambio queda en `campos_corregidos`: es la fuente de I-5.
 */

const CARGA = z.object({ extraccionId: z.string().uuid() })
const IMPORTE_VALIDO = /^\d{1,12}(\.\d{1,2})?$/

export interface ExtraccionVisible {
  id: string
  estado: EstadoExtraccion
  tipoContenido: string
  direccion: string
  propuesta: {
    proveedor: string | null
    cuit: string | null
    fecha: string | null
    importe: string | null
    rubroId: string | null
    rubro: string | null
    confianza: string | null
    confianzaPorCampo: Record<string, string>
  }
}

export class ExtraccionNoConfirmable extends ErrorDeAplicacion {
  constructor(estado: EstadoExtraccion) {
    super(
      estado === 'pendiente'
        ? 'La extracción todavía no terminó. Podés esperar o cargar el gasto a mano.'
        : 'Esa extracción ya fue confirmada o descartada.',
      'RN-14',
      { estado },
    )
  }
}

/** Al confirmar la subida del comprobante suelto: la fila y su trabajo. */
export async function iniciarCargaAsistida(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; clave: string; tipoContenido: string },
): Promise<{ extraccionId: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'cargar comprobantes con asistencia',
    },
    async () => {
      if (!claveEsDe(datos.clave, 'extracciones', datos.consorcioId)) throw new NoEncontrado()
      return prisma.$transaction(async (tx) => {
        const extraccion = await tx.extraccionComprobante.create({
          data: sinConsorcio({
            claveObjeto: datos.clave,
            tipoContenido: datos.tipoContenido,
            cargadoPor: datos.usuarioId,
          }),
          select: { id: true },
        })
        await tx.$executeRaw`
          INSERT INTO "TrabajoPendiente" (tipo, carga)
          VALUES ('extraccion_comprobante'::"TipoTrabajo", jsonb_build_object('extraccionId', ${extraccion.id}::text))
        `
        return { extraccionId: extraccion.id }
      })
    },
  )
}

/** El manejador de la cola: baja el objeto, extrae, valida y escribe la propuesta. */
export function manejadorExtraccion(
  almacen: AlmacenObjetos,
  extractor: ExtractorDocumental,
  bajar: (direccion: string) => Promise<Uint8Array> = bajarDe,
): Manejador {
  return async (carga) => {
    const { extraccionId } = CARGA.parse(carga)
    const extraccion = await prismaBase.extraccionComprobante.findUnique({
      where: { id: extraccionId },
    })
    if (!extraccion || extraccion.estado !== 'pendiente') return

    const noDisponible = (motivo: string) =>
      prismaBase.extraccionComprobante.update({
        where: { id: extraccionId },
        data: { estado: 'no_disponible', procesadoEn: new Date(), confianzaPorCampo: { motivo } },
      })

    let bytes: Uint8Array
    try {
      bytes = await bajar(await almacen.resolverLecturaAutorizada(extraccion.claveObjeto, 300))
    } catch {
      await noDisponible('No se pudo leer el comprobante del almacenamiento.')
      return
    }

    const rubros = await rubrosParaClasificar()
    const resultado = await extractor.extraer(
      { bytes, tipoContenido: extraccion.tipoContenido },
      {
        rubros: rubros.map(({ codigo, nombre, descripcion }) => ({ codigo, nombre, descripcion })),
      },
    )
    if (!resultado.disponible) {
      await noDisponible(resultado.motivo)
      return
    }

    const v = resultado.valor
    const fecha =
      v.fecha && /^\d{4}-\d{2}-\d{2}$/.test(v.fecha) ? new Date(`${v.fecha}T00:00:00Z`) : null
    await prismaBase.extraccionComprobante.update({
      where: { id: extraccionId },
      data: {
        estado: 'propuesta',
        proveedorDetectado: v.proveedor?.slice(0, 160) ?? null,
        cuitDetectado: v.cuit?.slice(0, 13) ?? null,
        fechaDetectada: fecha && !Number.isNaN(fecha.getTime()) ? fecha : null,
        importeDetectado: v.importe && IMPORTE_VALIDO.test(v.importe) ? v.importe : null,
        rubroSugeridoId: rubros.find((r) => r.codigo === v.rubroCodigo)?.id ?? null,
        confianza: v.confianza,
        confianzaPorCampo: v.confianzaPorCampo,
        procesadoEn: new Date(),
      },
    })
  }
}

export async function verExtraccion(
  almacen: AlmacenObjetos,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; extraccionId: string },
): Promise<ExtraccionVisible> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'ver la extracción',
    },
    async () => {
      const e = await prisma.extraccionComprobante.findFirst({
        where: { id: datos.extraccionId },
        include: { rubro: { select: { nombre: true } } },
      })
      if (!e) throw new NoEncontrado()
      const porCampo = (e.confianzaPorCampo ?? {}) as Record<string, string>
      return {
        id: e.id,
        estado: e.estado,
        tipoContenido: e.tipoContenido,
        direccion: await almacen.resolverLecturaAutorizada(e.claveObjeto, 600),
        propuesta: {
          proveedor: e.proveedorDetectado,
          cuit: e.cuitDetectado,
          fecha: e.fechaDetectada?.toISOString().slice(0, 10) ?? null,
          importe: e.importeDetectado?.toFixed(2) ?? null,
          rubroId: e.rubroSugeridoId,
          rubro: e.rubro?.nombre ?? null,
          confianza: e.confianza?.toFixed(3) ?? null,
          confianzaPorCampo: porCampo,
        },
      }
    },
  )
}

/**
 * El unico lugar donde una extraccion produce un gasto (SC-017). Los valores
 * son los que la persona envio, no los propuestos; la diferencia queda en
 * `campos_corregidos`.
 */
export async function confirmarExtraccion(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    extraccionId: string
    periodoId: string
    rubroId: string
    proveedorId?: string | null
    importe: string
    fecha: Date
    descripcion: string
  },
): Promise<{ gastoId: string; camposCorregidos: string[] }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'confirmar la extracción',
    },
    async () => {
      const extraccion = await prisma.extraccionComprobante.findFirst({
        where: { id: datos.extraccionId },
      })
      if (!extraccion) throw new NoEncontrado()
      if (extraccion.estado !== 'propuesta' && extraccion.estado !== 'no_disponible') {
        throw new ExtraccionNoConfirmable(extraccion.estado)
      }

      const monto = datos.importe.trim()
      if (!IMPORTE_VALIDO.test(monto) || aImporte(monto).isZero()) {
        throw new ErrorDeAplicacion(
          'El importe tiene que ser mayor que cero, con punto decimal y hasta dos decimales.',
          'RF-04',
        )
      }
      const periodo = await prisma.periodo.findFirst({ where: { id: datos.periodoId } })
      if (!periodo) throw new NoEncontrado()
      exigirPeriodoConGastos(periodo.estado)
      const rubro = await prismaBase.rubroGasto.findUnique({ where: { id: datos.rubroId } })
      if (!rubro) throw new NoEncontrado()
      if (datos.proveedorId) {
        const proveedor = await prisma.proveedor.findFirst({ where: { id: datos.proveedorId } })
        if (!proveedor) throw new NoEncontrado()
      }

      // Lo que la persona cambio respecto de lo propuesto (I-5).
      const camposCorregidos: string[] = []
      if (extraccion.importeDetectado?.toFixed(2) !== aImporte(monto).toFixed(2))
        camposCorregidos.push('importe')
      if (
        (extraccion.fechaDetectada?.toISOString().slice(0, 10) ?? null) !==
        datos.fecha.toISOString().slice(0, 10)
      )
        camposCorregidos.push('fecha')
      if ((extraccion.rubroSugeridoId ?? null) !== datos.rubroId) camposCorregidos.push('rubro')

      const gastoId = await prisma.$transaction(async (tx) => {
        const gasto = await tx.gasto.create({
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
          select: { id: true },
        })
        const comprobante = await tx.comprobante.create({
          data: {
            gastoId: gasto.id,
            claveObjeto: extraccion.claveObjeto,
            tipoContenido: extraccion.tipoContenido,
            bytes: 0,
            estado: 'disponible',
          },
          select: { id: true },
        })
        await tx.extraccionComprobante.update({
          where: { id: extraccion.id },
          data: {
            estado:
              extraccion.estado === 'no_disponible' || camposCorregidos.length > 0
                ? 'corregida'
                : 'confirmada',
            confirmadaPor: datos.usuarioId,
            camposCorregidos,
            gastoId: gasto.id,
            comprobanteId: comprobante.id,
          },
        })
        return gasto.id
      })
      return { gastoId, camposCorregidos }
    },
  )
}

export async function descartarExtraccion(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; extraccionId: string },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'descartar la extracción',
    },
    async () => {
      const extraccion = await prisma.extraccionComprobante.findFirst({
        where: { id: datos.extraccionId },
      })
      if (!extraccion) throw new NoEncontrado()
      if (extraccion.estado === 'confirmada' || extraccion.estado === 'corregida') {
        throw new ExtraccionNoConfirmable(extraccion.estado)
      }
      // El objeto queda para auditoria; solo cambia el estado.
      await prisma.extraccionComprobante.update({
        where: { id: extraccion.id },
        data: { estado: 'descartada', confirmadaPor: datos.usuarioId },
      })
    },
  )
}

/** Las extracciones que esperan revision, para la bandeja. */
export async function listarExtracciones(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<
  {
    id: string
    estado: EstadoExtraccion
    proveedor: string | null
    importe: string | null
    creadoEn: string
  }[]
> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'ver las extracciones',
    },
    async () => {
      const filas = await prisma.extraccionComprobante.findMany({
        where: { estado: { in: ['pendiente', 'propuesta', 'no_disponible'] } },
        orderBy: { creadoEn: 'desc' },
      })
      return filas.map((e) => ({
        id: e.id,
        estado: e.estado,
        proveedor: e.proveedorDetectado,
        importe: e.importeDetectado?.toFixed(2) ?? null,
        creadoEn: e.creadoEn.toISOString(),
      }))
    },
  )
}

async function bajarDe(direccion: string): Promise<Uint8Array> {
  const respuesta = await fetch(direccion)
  if (!respuesta.ok) throw new Error(`descarga ${respuesta.status}`)
  return new Uint8Array(await respuesta.arrayBuffer())
}
