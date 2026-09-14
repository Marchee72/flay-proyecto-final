import { redirect } from 'next/navigation'
import { Menu } from 'lucide-react'

import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { AvisoFueraDeAlcance, consorciosAlAlcance } from '../../con-consorcio'
import { BarraInferior, Navegacion } from '../../navegacion'
import { SelectorDeConsorcio } from '../../selector-consorcio'

/**
 * Dentro de un consorcio: lateral con las secciones agrupadas, barra inferior
 * en telefono y el atajo para saltar a otro consorcio. Resuelve el consorcio
 * de la ruta contra el alcance una sola vez (`consorciosAlAlcance` esta
 * cacheado por pedido, asi que la pagina no repite la consulta). Un id fuera
 * del alcance no dibuja nada mas que el aviso.
 */
export default async function ConsorcioLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ consorcio: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const { consorcio: consorcioId } = await params
  const consorcios = await consorciosAlAlcance(usuarioId)
  const activo = consorcios.find((c) => c.id === consorcioId)

  if (!activo) {
    return (
      <main className="suelto">
        <AvisoFueraDeAlcance />
      </main>
    )
  }

  const base = `/consorcios/${activo.id}`

  return (
    <>
      <div className="disposicion">
        <div className="lateral__marco">
          <SelectorDeConsorcio consorcios={consorcios} activoId={activo.id} />
          <details className="menu">
            <summary aria-label="Abrir menú de secciones">
              <Menu className="icono" aria-hidden="true" />
              Secciones
            </summary>
            <Navegacion base={base} nombre={activo.nombre} etiqueta="Todas las secciones" />
          </details>
          <Navegacion base={base} nombre={activo.nombre} />
        </div>
        <main>{children}</main>
      </div>
      <BarraInferior base={base} />
    </>
  )
}
