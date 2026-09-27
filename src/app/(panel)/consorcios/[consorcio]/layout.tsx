import { redirect } from 'next/navigation'

import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { AvisoFueraDeAlcance, consorciosAlAlcance } from '../../con-consorcio'
import { Marco } from '../../marco'

/**
 * Dentro de un consorcio: el marco con el selector y las secciones agrupadas,
 * y en telefono la barra inferior. Resuelve el consorcio de la ruta contra el
 * alcance una sola vez (`consorciosAlAlcance` esta cacheado por pedido, asi
 * que la pagina no repite la consulta). Un id fuera del alcance dibuja el
 * marco sin secciones y el aviso, nada mas.
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
      <Marco>
        <AvisoFueraDeAlcance />
      </Marco>
    )
  }

  const roles = await rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id)

  return (
    <Marco consorcio={{ consorcios, activoId: activo.id, base: `/consorcios/${activo.id}`, roles }}>
      {children}
    </Marco>
  )
}
