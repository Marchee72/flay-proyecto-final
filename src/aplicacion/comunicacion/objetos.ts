import { ErrorDeAplicacion } from '@/compartido/errores'
import {
  BYTES_MAXIMOS_COMPROBANTE,
  TIPOS_COMPROBANTE,
  type AlmacenObjetos,
  type TipoComprobante,
} from '@/dominio/contratos/almacen-objetos'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'

/**
 * Permiso de subida directa para los objetos de `004-servicios` (T058): los
 * documentos del consorcio (`documentos/`) y los comprobantes sueltos de la
 * carga asistida (`extracciones/`). Mismo mecanismo que los comprobantes de
 * 002 —el archivo va del navegador al almacen, la verificacion de tipo y
 * tamaño ocurre antes de transferir un byte— pero sin fila previa: la fila
 * nace al confirmar, con la clave que sale de aca.
 */

export const PREFIJOS = {
  documentos: {
    tipos: ['application/pdf'] as readonly TipoComprobante[],
    accion: 'cargar documentos',
  },
  extracciones: { tipos: TIPOS_COMPROBANTE, accion: 'cargar comprobantes con asistencia' },
} as const

export type PrefijoDeObjeto = keyof typeof PREFIJOS

export class TipoNoAceptado extends ErrorDeAplicacion {
  constructor(tipo: string, aceptados: readonly string[]) {
    super(
      aceptados.length === 1
        ? `No aceptamos archivos ${tipo}: los documentos del consorcio van en PDF.`
        : `No aceptamos archivos ${tipo}. Se puede subir PDF, JPEG, PNG, WebP, HEIC o TIFF.`,
      'RF-19',
      { tipo },
    )
  }
}

export class ObjetoDemasiadoGrande extends ErrorDeAplicacion {
  constructor(bytes: number) {
    super(`El archivo pesa ${(bytes / 1_048_576).toFixed(1)} MB y el máximo son 25 MB.`, 'RF-19', {
      bytes,
    })
  }
}

const limpiar = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 80) || 'archivo'

export async function pedirPermisoDeObjeto(
  almacen: AlmacenObjetos,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    prefijo: PrefijoDeObjeto
    tipoContenido: string
    bytes: number
    nombre: string
  },
): Promise<{ clave: string; credencial: string; vence: string }> {
  const regla = PREFIJOS[datos.prefijo]
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: regla.accion,
    },
    async () => {
      if (!(regla.tipos as readonly string[]).includes(datos.tipoContenido)) {
        throw new TipoNoAceptado(datos.tipoContenido, regla.tipos)
      }
      if (
        !Number.isFinite(datos.bytes) ||
        datos.bytes <= 0 ||
        datos.bytes > BYTES_MAXIMOS_COMPROBANTE
      ) {
        throw new ObjetoDemasiadoGrande(Math.max(0, datos.bytes))
      }
      // El consorcio adelante: dos consorcios no comparten prefijo.
      const clave = `${datos.prefijo}/${datos.consorcioId}/${crypto.randomUUID()}/${limpiar(datos.nombre)}`
      const permiso = await almacen.emitirPermisoDeSubida(
        clave,
        datos.tipoContenido as TipoComprobante,
        BYTES_MAXIMOS_COMPROBANTE,
      )
      return { clave, credencial: permiso.credencial, vence: permiso.vence.toISOString() }
    },
  )
}

/** Una clave solo puede confirmar lo que su prefijo y su consorcio dicen. */
export function claveEsDe(clave: string, prefijo: PrefijoDeObjeto, consorcioId: string): boolean {
  return clave.startsWith(`${prefijo}/${consorcioId}/`)
}
