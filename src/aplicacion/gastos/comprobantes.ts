import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import {
  BYTES_MAXIMOS_COMPROBANTE,
  TIPOS_COMPROBANTE,
  TIPOS_SOLO_DESCARGA,
  type AlmacenObjetos,
  type TipoComprobante,
} from '@/dominio/contratos/almacen-objetos'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { encolar } from '@/aplicacion/pendientes/encolar'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Comprobantes (FR-018, FR-018b, FR-018c).
 *
 * El archivo **no pasa por el servidor**: la aplicacion verifica habilitacion,
 * tipo y tamano, y devuelve un permiso de corta duracion con el que el
 * navegador sube directo al almacenamiento. La plataforma limita el cuerpo de
 * un pedido muy por debajo de los 25 MB que admite un comprobante, asi que sin
 * subida directa el requisito no se cumple.
 *
 * Consecuencia: entre el permiso y la confirmacion hay una ventana. El
 * comprobante nace `pendiente` y pasa a `disponible` al confirmar; si la
 * confirmacion no llega, queda como `TrabajoPendiente` (FR-006b).
 */

const MB = 1_048_576

/** Ventana de la direccion de lectura: alcanza para abrir el archivo. */
const SEGUNDOS_DE_LECTURA = 600

export class ComprobanteDemasiadoGrande extends ErrorDeAplicacion {
  constructor(bytes: number) {
    super(
      `El comprobante pesa ${(bytes / MB).toFixed(1)} MB y el máximo son ` +
        `${BYTES_MAXIMOS_COMPROBANTE / MB} MB. Escaneá en menor calidad o subilo en PDF.`,
      'RF-04',
      { bytes, maximo: BYTES_MAXIMOS_COMPROBANTE },
    )
  }
}

export class TipoDeComprobanteNoAceptado extends ErrorDeAplicacion {
  constructor(tipo: string) {
    super(
      `No aceptamos archivos ${tipo}. Se puede subir PDF, JPEG, PNG, WebP, HEIC o TIFF.`,
      'RF-04',
      { tipo },
    )
  }
}

const esTipoAceptado = (tipo: string): tipo is TipoComprobante =>
  (TIPOS_COMPROBANTE as readonly string[]).includes(tipo)

/**
 * Permiso de subida. La verificacion es **antes** de transferir un byte: un
 * archivo de 26 MB se rechaza sin haber viajado (SC-006c).
 */
export async function pedirPermisoDeSubida(
  almacen: AlmacenObjetos,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    gastoId: string
    tipoContenido: string
    bytes: number
    nombre: string
  },
): Promise<{ clave: string; credencial: string; vence: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'subir comprobantes',
    },
    async () => {
      if (!esTipoAceptado(datos.tipoContenido)) {
        throw new TipoDeComprobanteNoAceptado(datos.tipoContenido)
      }

      if (!Number.isFinite(datos.bytes) || datos.bytes <= 0) {
        throw new ComprobanteDemasiadoGrande(0)
      }

      if (datos.bytes > BYTES_MAXIMOS_COMPROBANTE) {
        throw new ComprobanteDemasiadoGrande(datos.bytes)
      }

      const gasto = await prisma.gasto.findFirst({ where: { id: datos.gastoId } })
      if (!gasto) throw new NoEncontrado()

      // La clave lleva el consorcio adelante: dos consorcios no comparten
      // prefijo y una clave adivinada no cruza el aislamiento.
      const clave = `comprobantes/${datos.consorcioId}/${gasto.id}/${limpiar(datos.nombre)}`

      const permiso = await almacen.emitirPermisoDeSubida(
        clave,
        datos.tipoContenido,
        BYTES_MAXIMOS_COMPROBANTE,
      )

      await prismaBase.comprobante.create({
        data: {
          gastoId: gasto.id,
          claveObjeto: clave,
          tipoContenido: datos.tipoContenido,
          bytes: datos.bytes,
        },
      })

      // Si la confirmacion nunca llega, esto es lo que la va a buscar (FR-006b).
      await encolar('confirmacion_subida', { clave, gastoId: gasto.id })

      return { clave, credencial: permiso.credencial, vence: permiso.vence.toISOString() }
    },
  )
}

/** El comprobante pasa a `disponible` cuando la subida termino (FR-018b). */
export async function confirmarComprobante(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; gastoId: string; clave: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'confirmar comprobantes',
    },
    async () => {
      // `Comprobante` no lleva `consorcio_id`: cuelga de `Gasto`, que si lo
      // lleva. El aislamiento se aplica sobre el gasto y el comprobante se
      // alcanza a traves de el (Principio I).
      const gasto = await prisma.gasto.findFirst({ where: { id: datos.gastoId } })
      if (!gasto) throw new NoEncontrado()

      const comprobante = await prismaBase.comprobante.findFirst({
        where: { gastoId: gasto.id, claveObjeto: datos.clave },
      })

      if (!comprobante) throw new NoEncontrado()

      await prismaBase.comprobante.update({
        where: { id: comprobante.id },
        data: { estado: 'disponible' },
      })

      // Solo el trabajo de **esta** subida: los demas siguen esperando lo suyo.
      await prismaBase.trabajoPendiente.updateMany({
        where: {
          tipo: 'confirmacion_subida',
          estado: 'pendiente',
          carga: { path: ['clave'], equals: datos.clave },
        },
        data: { estado: 'despachado' },
      })
    },
  )
}

export interface ComprobanteVisible {
  id: string
  tipoContenido: string
  bytes: number
  /** HEIC y TIFF no los muestra ningun navegador: se ofrecen por descarga. */
  soloDescarga: boolean
  direccion: string
}

/**
 * Lectura autorizada de un comprobante. Uno de otro consorcio devuelve
 * «no encontrado», nunca «prohibido»: decir «prohibido» confirmaria que existe.
 */
export async function verComprobante(
  almacen: AlmacenObjetos,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; comprobanteId: string },
): Promise<ComprobanteVisible> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      accion: 'ver comprobantes',
    },
    async () => {
      const comprobante = await prismaBase.comprobante.findUnique({
        where: { id: datos.comprobanteId },
      })

      if (!comprobante || comprobante.estado !== 'disponible') throw new NoEncontrado()

      // El aislamiento decide, sobre el gasto: uno de otro consorcio no aparece
      // y el comprobante se vuelve inalcanzable sin decir que existe.
      const gasto = await prisma.gasto.findFirst({ where: { id: comprobante.gastoId } })
      if (!gasto) throw new NoEncontrado()

      return {
        id: comprobante.id,
        tipoContenido: comprobante.tipoContenido,
        bytes: comprobante.bytes,
        soloDescarga: (TIPOS_SOLO_DESCARGA as readonly string[]).includes(
          comprobante.tipoContenido,
        ),
        direccion: await almacen.resolverLecturaAutorizada(
          comprobante.claveObjeto,
          SEGUNDOS_DE_LECTURA,
        ),
      }
    },
  )
}

/** Nombre de archivo sin sorpresas: sin rutas, sin espacios, sin acentos. */
const limpiar = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .slice(-120) || 'comprobante'
