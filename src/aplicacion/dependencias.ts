import type { Asistencia } from '@/dominio/contratos/asistencia'
import type { GeneradorDeDocumentos } from '@/dominio/contratos/documentos'
import { asistenciaNula } from '@/infraestructura/asistencia/nula'
import { argon2id } from '@/infraestructura/contrasenas/argon2'
import { almacenBlob } from '@/infraestructura/objetos/blob'
import { relojDelSistema } from '@/infraestructura/reloj'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

/**
 * Punto de composicion: donde las implementaciones concretas se atan a los
 * puertos, una sola vez (Principio III).
 *
 * Existe porque la presentacion **no puede** importar infraestructura (§12.1.2)
 * y los casos de uso reciben sus dependencias por parametro para poder probarse
 * con dobles. Sin este archivo, cada pantalla tendria que elegir el reloj y el
 * derivador, que es justo lo que la regla de dependencia evita.
 */
export const HABILITACIONES = repositorioHabilitaciones
export const RELOJ = relojDelSistema
export const DERIVADOR = argon2id
export const ALMACEN = almacenBlob

/**
 * Generador de PDF cargado bajo demanda: evita que `@react-pdf/renderer` y sus
 * tipografias se importen en pantallas y APIs que solo necesitan el reloj o permisos.
 */
export const GENERADOR_DOCUMENTOS: GeneradorDeDocumentos = {
  async expensa(datos) {
    const { generadorPdf } = await import('@/infraestructura/documentos/expensa')
    return generadorPdf.expensa(datos)
  },
}

async function resolverAsistencia(): Promise<Asistencia> {
  if (process.env.FLAY_ASISTENCIA === 'determinista') {
    const { asistenciaDeterminista } = await import('@/infraestructura/asistencia/determinista')
    return asistenciaDeterminista
  }
  if (process.env.GEMINI_API_KEY) {
    const { asistenciaGemini } = await import('@/infraestructura/asistencia/gemini')
    return asistenciaGemini
  }
  return asistenciaNula
}

/**
 * La asistencia automatica, despachada bajo demanda: evita importar `unpdf` y
 * `@google/genai` en cada ruta ordinaria de la aplicacion (RNF-14, RNF-15).
 */
export const ASISTENCIA: Asistencia = {
  extractor: {
    async extraer(documento, contexto) {
      const impl = await resolverAsistencia()
      return impl.extractor.extraer(documento, contexto)
    },
  },
  clasificador: {
    async clasificar(texto, rubros) {
      const impl = await resolverAsistencia()
      return impl.clasificador.clasificar(texto, rubros)
    },
  },
  vectores: {
    dimensiones: 768,
    get pisoDeSimilitud() {
      return process.env.FLAY_ASISTENCIA === 'determinista' ? 0.05 : 0.6
    },
    async vectorizar(textos, tipo) {
      const impl = await resolverAsistencia()
      return impl.vectores.vectorizar(textos, tipo)
    },
  },
  respuestas: {
    async responder(pregunta, contexto) {
      const impl = await resolverAsistencia()
      return impl.respuestas.responder(pregunta, contexto)
    },
  },
}
