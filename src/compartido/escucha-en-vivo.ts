export type Permiso = { canal: string; token: string }
export type ResultadoPermiso = Permiso | 'sin-servicio' | 'reintentar'
export type Oyentes = { alAbrir(): void; alMensaje(): void; alError(): void }

const TOPE_ESPERA_MS = 30_000

/**
 * Mantiene viva la escucha de una sala. El token va en la URL, así que la
 * reconexión del navegador repetiría uno vencido: ante cualquier error se
 * cierra, se pide otro y se reabre. Cada apertura relee: lo publicado antes de
 * escuchar no va a llegar, ni al cargar la sala ni al reconectar.
 */
export function crearEscucha({
  pedirPermiso,
  abrir,
  alCambio,
  alConectado,
}: {
  pedirPermiso: () => Promise<ResultadoPermiso>
  abrir: (permiso: Permiso, oyentes: Oyentes) => { cerrar(): void }
  alCambio: () => void
  alConectado: (conectado: boolean) => void
}) {
  let detenida = false
  let intentos = 0
  let conexion: { cerrar(): void } | null = null
  let reintento: ReturnType<typeof setTimeout> | null = null

  const agendar = () => {
    if (detenida || reintento) return
    const espera = Math.min(TOPE_ESPERA_MS, 1000 * 2 ** intentos)
    intentos++
    reintento = setTimeout(() => {
      reintento = null
      void conectar()
    }, espera)
  }

  async function conectar() {
    const resultado = await pedirPermiso().catch((): ResultadoPermiso => 'reintentar')
    if (detenida || resultado === 'sin-servicio') return
    if (resultado === 'reintentar') return agendar()

    const propia = abrir(resultado, {
      alAbrir() {
        intentos = 0
        alConectado(true)
        alCambio()
      },
      alMensaje: alCambio,
      alError() {
        if (conexion !== propia) return
        conexion = null
        propia.cerrar()
        alConectado(false)
        agendar()
      },
    })
    conexion = propia
  }

  return {
    iniciar() {
      void conectar()
    },
    detener() {
      detenida = true
      if (reintento) clearTimeout(reintento)
      conexion?.cerrar()
      conexion = null
    },
  }
}
