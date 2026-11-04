type Estado = 'pendiente' | 'abierto' | 'cerrado'

const faltan = (n: number) => (n === 1 ? 'falta 1' : `faltan ${n}`)

/** Por dónde va la reunión (RF-31). «Faltan» son los pendientes, sin contar el abierto. */
export function textoAvance(puntos: { estado: Estado }[]): string {
  const total = puntos.length
  const tratados = puntos.filter((p) => p.estado === 'cerrado').length
  const pendientes = puntos.filter((p) => p.estado === 'pendiente').length

  if (puntos.some((p) => p.estado === 'abierto')) {
    const posicion = `punto ${tratados + 1} de ${total}`
    return pendientes === 0 ? `${posicion}, es el último` : `${posicion}, ${faltan(pendientes)}`
  }
  const avance = `${tratados} de ${total} tratados`
  return pendientes === 0 ? avance : `${avance}, ${faltan(pendientes)}`
}
