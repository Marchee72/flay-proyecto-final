/**
 * Una ráfaga de avisos no puede disparar una relectura por aviso. Un ciclo dura
 * hasta que pasó `esperaMs` y terminó la relectura; lo que llega entretanto se
 * junta en una sola relectura al final. El sondeo pasa por el mismo ciclo, porque
 * el router encola cada relectura delante de las acciones: apiladas, un voto
 * esperaría a todas. `topeMs` espacia los intentos con una relectura colgada.
 */
export function crearRefrescoAcotado({
  refrescar,
  puedeRefrescar,
  esperaMs = 500,
  topeMs = 15_000,
}: {
  refrescar: () => void
  puedeRefrescar: () => boolean
  esperaMs?: number
  topeMs?: number
}) {
  let ocupado = false
  let esperaCumplida = false
  let relecturaTerminada = false
  let falta = false
  let temporizadores: ReturnType<typeof setTimeout>[] = []

  const limpiar = () => {
    temporizadores.forEach(clearTimeout)
    temporizadores = []
  }

  const liberar = () => {
    limpiar()
    ocupado = false
    if (falta) avisar()
  }

  const siCumplio = () => {
    if (esperaCumplida && relecturaTerminada) liberar()
  }

  function avisar() {
    if (ocupado || !puedeRefrescar()) {
      falta = true
      return
    }
    falta = false
    ocupado = true
    esperaCumplida = false
    relecturaTerminada = false
    refrescar()
    temporizadores = [
      setTimeout(() => {
        esperaCumplida = true
        siCumplio()
      }, esperaMs),
      setTimeout(liberar, topeMs),
    ]
  }

  return {
    avisar,
    terminado() {
      if (!ocupado) return
      relecturaTerminada = true
      siCumplio()
    },
    reanudar() {
      if (falta) avisar()
    },
    /** Devuelve cómo detenerlo. */
    sondear(cadaMs: number) {
      const sondeo = setInterval(avisar, cadaMs)
      return () => clearInterval(sondeo)
    },
    cancelar() {
      limpiar()
      ocupado = false
      falta = false
    },
  }
}
