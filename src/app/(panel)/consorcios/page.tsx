import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

export const metadata: Metadata = { title: 'Consorcios — Flay' }

export default async function ConsorciosPage() {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)

  return (
    <>
      <h1>Consorcios</h1>
      <p className="apagado">Los edificios que administrás.</p>

      <p>
        <Link className="boton boton--primario" href="/consorcios/nuevo">
          Nuevo consorcio
        </Link>
      </p>

      {consorcios.length === 0 ? (
        <p className="vacio">Todavía no hay ningún consorcio a tu alcance.</p>
      ) : (
        <div className="tabla-desplazable">
          <table>
            <caption className="ayuda">Consorcios alcanzables</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Padrón</th>
              </tr>
            </thead>
            <tbody>
              {consorcios.map((consorcio) => (
                <tr key={consorcio.id}>
                  <td>
                    <Link href={`/consorcios/${consorcio.id}`}>{consorcio.nombre}</Link>
                  </td>
                  <td>
                    <Link href={`/consorcios/${consorcio.id}/unidades`}>Unidades</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
