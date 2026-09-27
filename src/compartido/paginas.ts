/** Hasta cinco numeros de pagina alrededor de la actual, sin salirse de 1..total. */
export function paginasAMostrar(actual: number, total: number): number[] {
  const inicio = Math.max(1, Math.min(actual - 2, total - 4))
  const fin = Math.min(total, inicio + 4)
  const paginas: number[] = []
  for (let pagina = inicio; pagina <= fin; pagina++) paginas.push(pagina)
  return paginas
}
