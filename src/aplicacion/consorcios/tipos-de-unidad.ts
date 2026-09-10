import { ErrorDeAplicacion } from '@/compartido/errores'
import { TIPO_UNIDAD_POR_OMISION, TIPOS_UNIDAD, type TipoUnidad } from '@/dominio/unidades/tipo'

/**
 * Los tipos de unidad, del lado de la interfaz. Existe por lo mismo que
 * `identidad/roles.ts`: la presentación no importa el dominio (§ 12.1.2).
 */

export const TIPOS_DE_UNIDAD_ASIGNABLES: readonly { valor: string; etiqueta: string }[] = [
  { valor: 'departamento', etiqueta: 'Departamento' },
  { valor: 'cochera', etiqueta: 'Cochera' },
  { valor: 'local', etiqueta: 'Local' },
  { valor: 'baulera', etiqueta: 'Baulera' },
]

export class TipoDeUnidadDesconocido extends ErrorDeAplicacion {
  constructor() {
    super('Elegí un tipo de unidad de la lista.', 'RF-02')
  }
}

/**
 * Valida lo que llega de un formulario. Vacío es `departamento`: el padrón se
 * carga de a docenas de filas y la abrumadora mayoría lo son; lo que no se
 * acepta es un valor inventado.
 */
export function tipoDeUnidadDesdeFormulario(valor: unknown): TipoUnidad {
  if (valor === '' || valor === undefined || valor === null) return TIPO_UNIDAD_POR_OMISION

  const tipo = TIPOS_UNIDAD.find((candidato) => candidato === valor)
  if (!tipo) throw new TipoDeUnidadDesconocido()
  return tipo
}
