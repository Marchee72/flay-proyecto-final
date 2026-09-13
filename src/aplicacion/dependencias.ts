import type { Asistencia } from '@/dominio/contratos/asistencia'
import { asistenciaDeterminista } from '@/infraestructura/asistencia/determinista'
import { asistenciaGemini } from '@/infraestructura/asistencia/gemini'
import { asistenciaNula } from '@/infraestructura/asistencia/nula'
import { argon2id } from '@/infraestructura/contrasenas/argon2'
import { generadorPdf } from '@/infraestructura/documentos/expensa'
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
export const GENERADOR_DOCUMENTOS = generadorPdf

/**
 * La asistencia automatica, elegida **una vez y por entorno** (research R-02
 * de 004-servicios, SC-012): `FLAY_ASISTENCIA=determinista` es la de
 * pruebas; con `GEMINI_API_KEY` va el proveedor; sin ninguna, la nula, que
 * degrada cada funcion a su equivalente manual (RNF-14).
 */
export const ASISTENCIA: Asistencia =
  process.env.FLAY_ASISTENCIA === 'determinista'
    ? asistenciaDeterminista
    : process.env.GEMINI_API_KEY
      ? asistenciaGemini
      : asistenciaNula
