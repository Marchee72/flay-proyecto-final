/**
 * Tipos de unidad funcional del punto 7: departamento, cochera, local o
 * baulera.
 *
 * No participa del prorrateo. Toda unidad funcional tributa por su coeficiente,
 * sea un departamento o una cochera, y la suma sigue siendo `100.00000000`
 * (regla RN-01). El tipo esta para poder decir qué es cada unidad —hoy solo se
 * sabe si alguien la nombró «Cochera 5»— y para lo que la iteración 2 decida
 * sobre prorrateos por grupo, que todavía no está especificado.
 *
 * La **cochera como unidad complementaria** —la que no se vende separada del
 * departamento y no tiene porcentual propio— no es un tipo de esta lista: esa
 * no es una fila del padrón, porque su superficie ya está dentro del
 * coeficiente de la unidad funcional a la que accede.
 */
export const TIPOS_UNIDAD = ['departamento', 'cochera', 'local', 'baulera'] as const

export type TipoUnidad = (typeof TIPOS_UNIDAD)[number]

export const TIPO_UNIDAD_POR_OMISION: TipoUnidad = 'departamento'
