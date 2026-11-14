const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim()

/** Compara nombres sin tildes, sin distinguir mayúsculas y colapsando espacios. */
export function mismoNombre(a: string, b: string): boolean {
  return normalizar(a) === normalizar(b)
}
