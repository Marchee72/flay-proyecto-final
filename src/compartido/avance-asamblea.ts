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

type Resultado = 'aprobado' | 'rechazado' | 'sin_decision' | null

/** El resultado de un punto cerrado, tal como se lee en pantalla y en el acta. */
export function textoDeResultado(p: {
  resultado: Resultado
  modalidad: 'binaria' | 'opcion_multiple'
  opcionGanadora: string | null
}): string {
  if (p.resultado === 'aprobado') {
    return p.modalidad === 'opcion_multiple' && p.opcionGanadora
      ? `Aprobada: ${p.opcionGanadora}`
      : 'Aprobado'
  }
  if (p.resultado === 'rechazado') return 'Rechazado'
  if (p.resultado === 'sin_decision') return 'Sin decisión'
  return ''
}

/** La marca de un punto en el orden del día de la sala (RF-31, RF-33). */
export function marcaDePunto(
  p: Parameters<typeof textoDeResultado>[0] & { estado: Estado; provisorio: boolean },
): string {
  if (p.estado === 'abierto') return 'Ahora'
  if (p.estado === 'pendiente') return 'Falta'
  const texto = textoDeResultado(p)
  return p.provisorio && texto ? `${texto}, provisoria` : texto
}
