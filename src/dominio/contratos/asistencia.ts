/**
 * Las cuatro interfaces de la asistencia automatica (§ 12.8.2, RNF-14, RNF-15,
 * Principio IV). El dominio las declara; `src/infraestructura/asistencia/` las
 * implementa **exactamente tres veces** —proveedor, determinista, nula— y
 * `src/aplicacion/dependencias.ts` elige una por entorno (SC-012).
 *
 * Ninguna acepta ni devuelve `number` para dinero: `importe` es cadena con
 * punto decimal (medida 1 de § 14.1). Ninguna lanza por indisponibilidad del
 * servicio: devuelve `{ disponible: false, motivo }`. Lanzar queda para errores
 * de programacion. Es lo que hace que RNF-14 sea una propiedad de la firma y no
 * de cada llamador.
 */

export type Resultado<T> = { disponible: true; valor: T } | { disponible: false; motivo: string }

export const noDisponible = (motivo: string): Resultado<never> => ({ disponible: false, motivo })
export const disponible = <T>(valor: T): Resultado<T> => ({ disponible: true, valor })

export interface RubroParaClasificar {
  codigo: string
  nombre: string
  descripcion: string
}

export interface ProveedorParaSugerir {
  id: string
  nombre: string
  rubros: string[]
}

export type CampoExtraido = 'proveedor' | 'cuit' | 'fecha' | 'importe' | 'rubro'

export interface ExtraccionPropuesta {
  proveedor: string | null
  /** NN-NNNNNNNN-N o null. */
  cuit: string | null
  /** AAAA-MM-DD o null. */
  fecha: string | null
  /** "96500.00" o null. */
  importe: string | null
  /** Uno de `contexto.rubros`, o null. */
  rubroCodigo: string | null
  /** "0.000" a "1.000". */
  confianza: string
  confianzaPorCampo: Record<CampoExtraido, string>
}

export interface ExtractorDocumental {
  /** Comprobante en bytes; la salida ya viene validada contra el esquema (§ 8.3). */
  extraer(
    documento: { bytes: Uint8Array; tipoContenido: string },
    contexto: { rubros: RubroParaClasificar[] },
  ): Promise<Resultado<ExtraccionPropuesta>>
}

export type UrgenciaSugerida = 'baja' | 'media' | 'alta' | 'critica'

export interface SugerenciaTriage {
  rubroCodigo: string | null
  urgencia: UrgenciaSugerida | null
  /** Uno de `contexto.proveedores`, o null. El sistema no inventa proveedores. */
  proveedorId: string | null
  /** Horas, no dinero. */
  horasEstimadas: number | null
  confianza: string
}

export interface ClasificadorTexto {
  clasificar(
    texto: { titulo: string; descripcion: string },
    contexto: { rubros: RubroParaClasificar[]; proveedores: ProveedorParaSugerir[] },
  ): Promise<Resultado<SugerenciaTriage>>
}

export const DIMENSIONES_VECTOR = 768

export interface GeneradorVectores {
  readonly dimensiones: typeof DIMENSIONES_VECTOR
  vectorizar(textos: string[], tipo: 'documento' | 'consulta'): Promise<Resultado<number[][]>>
}

export interface FragmentoParaResponder {
  numero: number
  documento: string
  pagina: number | null
  contenido: string
}

export interface RespuestaFundada {
  respuesta: string
  /** Numeros de fragmento del arreglo recibido. Vacio significa «no esta en la documentacion». */
  citas: number[]
  sinRespaldo: boolean
}

export interface GeneradorRespuesta {
  /** Responde solo con lo que dicen los fragmentos (Principio IV, SC-014, SC-015). */
  responder(
    pregunta: string,
    fragmentos: FragmentoParaResponder[],
  ): Promise<Resultado<RespuestaFundada>>
}

/** Las cuatro juntas: lo que el punto de composicion elige y los casos de uso reciben. */
export interface Asistencia {
  extractor: ExtractorDocumental
  clasificador: ClasificadorTexto
  vectores: GeneradorVectores
  respuestas: GeneradorRespuesta
}
