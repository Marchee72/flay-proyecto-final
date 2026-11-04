import type { TipoTrabajo } from '@prisma/client'
import { z } from 'zod'

import { manejadorNotificacion } from '@/aplicacion/comunicacion/despachar'
import { manejadorIndexacion } from '@/aplicacion/comunicacion/indexar'
import { manejadorBorradorActa } from '@/aplicacion/asambleas/acta'
import { ASISTENCIA, PROCESADOR_PAGOS, RELOJ } from '@/aplicacion/dependencias'
import { manejadorExtraccion } from '@/aplicacion/gastos/extraccion'
import { manejadorConciliacion } from '@/aplicacion/pagos/conciliar-pago-en-linea'
import { manejadorTriage } from '@/aplicacion/reclamos/sugerencia'
import { manejadorDocumentoExpensa } from '@/aplicacion/liquidacion/documentos'
import type { Manejador } from '@/aplicacion/pendientes/drenar'
import { generadorPdf } from '@/infraestructura/documentos/expensa'
import { textoPorPagina } from '@/infraestructura/documentos/texto-pdf'
import { almacenR2 } from '@/infraestructura/objetos/r2'
import { notificadorResend } from '@/infraestructura/correo/resend'

/**
 * Que hace cada tipo de trabajo pendiente. El drenaje no sabe de correo ni de
 * almacenamiento: recibe este mapa (FR-006b). Cada historia agrega el suyo.
 */

// La carga viaja como JSONB: al volver es un `unknown` y hay que abrirla.
const INVITACION = z.object({
  destino: z.string(),
  nombre: z.string(),
  consorcio: z.string(),
  enlaceDeAlta: z.string(),
})

// 016: aviso a un propietario sin cuenta en Flay (research R-07). Mismo texto
// que la notificacion de quien si tiene usuario; el puerto acepta destino libre.
const CORREO_DIRECTO = z.object({
  destino: z.string().email(),
  titulo: z.string(),
  cuerpo: z.string(),
})

export const MANEJADORES: Partial<Record<TipoTrabajo, Manejador>> = {
  invitacion: async (carga) => notificadorResend.enviarInvitacion(INVITACION.parse(carga)),
  // El documento de expensa (`003-liquidacion` FR-016): rendea, guarda y anota
  // la clave. El drenaje oportunista lo toma de a lotes; el disparo explicito
  // del administrador lo agota (research R-02).
  documento_expensa: manejadorDocumentoExpensa(generadorPdf, almacenR2),
  // Los avisos de § 12.7 (`004-servicios` FR-012): la fila la creo `notificar`
  // junto con este trabajo; aca solo se manda y se anota.
  notificacion: manejadorNotificacion(notificadorResend),
  // Las funciones asistidas (`004-servicios` US6) con la implementacion que
  // el punto de composicion eligio: proveedor, determinista o nula.
  extraccion_comprobante: manejadorExtraccion(almacenR2, ASISTENCIA.extractor),
  triage_reclamo: manejadorTriage(ASISTENCIA.clasificador),
  indexar_documento: manejadorIndexacion(almacenR2, ASISTENCIA.vectores, textoPorPagina),
  redactar_acta: manejadorBorradorActa(ASISTENCIA.redactor),
  // Red *pull* del cobro en linea (`RF-28`): sin webhook ni retorno, pregunta a la pasarela.
  conciliar_pago: manejadorConciliacion(PROCESADOR_PAGOS, RELOJ),
  correo_directo: async (carga) =>
    notificadorResend.enviarNotificacion(CORREO_DIRECTO.parse(carga)),
}
