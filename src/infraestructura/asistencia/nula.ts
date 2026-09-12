import { type Asistencia, noDisponible } from '@/dominio/contratos/asistencia'

/**
 * La implementacion nula: degradacion (RNF-14, research R-02). Cada metodo
 * responde «no disponible» con un motivo que una persona puede leer, y nada
 * lanza. Es la que corre cuando no hay clave del proveedor, y la que prueba
 * que ninguna funcion del negocio depende de la asistencia (SC-013).
 */
const MOTIVO = 'El servicio de asistencia no está configurado en este entorno.'

export const asistenciaNula: Asistencia = {
  extractor: {
    async extraer() {
      return noDisponible(`${MOTIVO} Cargá los datos del comprobante a mano.`)
    },
  },
  clasificador: {
    async clasificar() {
      return noDisponible(`${MOTIVO} El reclamo se registra sin sugerencia.`)
    },
  },
  vectores: {
    dimensiones: 768,
    pisoDeSimilitud: 0,
    async vectorizar() {
      return noDisponible(`${MOTIVO} La documentación se busca por título y se descarga.`)
    },
  },
  respuestas: {
    async responder() {
      return noDisponible(`${MOTIVO} Abrí el documento y buscá en él.`)
    },
  },
}
