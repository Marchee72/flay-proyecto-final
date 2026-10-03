/**
 * Esqueleto de carga visual para secciones del consorcio (RNF-06).
 *
 * Se renderiza instantaneamente (<16 ms) en el area de contenido mientras
 * el servidor resuelve las consultas de datos, manteniendo el marco lateral intacto
 * y eliminando cualquier sensacion de interfaz congelada.
 */
export default function ConsorcioLoading() {
  return (
    <div className="esqueleto-pantalla" aria-busy="true" aria-label="Cargando datos del consorcio">
      <div className="esqueleto esqueleto--titulo" />
      <div className="esqueleto esqueleto--subtitulo" />

      <div className="esqueleto-tarjetas">
        <div className="esqueleto esqueleto--tarjeta" />
        <div className="esqueleto esqueleto--tarjeta" />
        <div className="esqueleto esqueleto--tarjeta" />
      </div>

      <div className="esqueleto esqueleto--bloque" />
    </div>
  )
}
