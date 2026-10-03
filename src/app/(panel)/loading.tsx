/**
 * Esqueleto de carga visual para la raiz del panel (RNF-06).
 */
export default function PanelLoading() {
  return (
    <div className="esqueleto-pantalla" aria-busy="true" aria-label="Cargando panel">
      <div className="esqueleto esqueleto--titulo" />
      <div className="esqueleto esqueleto--subtitulo" />

      <div className="esqueleto esqueleto--bloque" />
    </div>
  )
}
