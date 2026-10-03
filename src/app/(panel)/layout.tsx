import { redirect } from 'next/navigation'
import { after } from 'next/server'

import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { drenar } from '@/aplicacion/pendientes/drenar'
import { MANEJADORES } from '@/aplicacion/pendientes/manejadores'

import { IndicadorCarga } from './indicador-carga'

/**
 * Raiz del panel: exige sesion y engancha el drenaje oportunista de
 * TrabajoPendiente con `after()`, que corre despues de responder, de modo que
 * reintentar un correo no le agrega latencia a nadie (FR-006b).
 *
 * El armazon visible (`Marco`) lo pone cada nivel de abajo: dentro de un
 * consorcio con sus secciones, afuera solo con lo global.
 *
 * Exige sesion, no permiso: quien no tiene identidad vuelve a ingresar. **Que**
 * puede hacer lo decide cada caso de uso contra la base (FR-002), porque el
 * armazon corre en paralelo con la pagina y no puede ser la unica barrera.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  after(async () => {
    // Cada historia agrega su manejador; lo que no tiene ninguno queda
    // pendiente y lo toma el proximo pedido.
    await drenar(MANEJADORES)
  })

  return (
    <>
      <IndicadorCarga />
      {children}
    </>
  )
}
