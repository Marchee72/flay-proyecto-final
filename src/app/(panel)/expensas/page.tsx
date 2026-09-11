import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeParaMostrar } from '@/compartido/formato'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { misExpensas } from '@/aplicacion/liquidacion/ver-expensa'

export const metadata: Metadata = { title: 'Expensas — Flay' }

/**
 * Las expensas de las unidades que el usuario puede ver (`CU-06`, `RF-08`).
 *
 * El consorcista ve las suyas; administrador y consejo, todas. Que sea asi lo
 * decide el caso de uso, no esta pantalla: aca solo se muestra lo que llega.
 */
export default async function ExpensasPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  const activo = consorcios.find((c) => c.id === parametros.consorcio) ?? consorcios[0]

  if (!activo) redirect('/consorcios')

  try {
    const unidades = await misExpensas(ALMACEN, HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })

    return (
      <>
        <h1>Expensas</h1>
        <p className="apagado">De {activo.nombre}.</p>

        {unidades.length === 0 && (
          <p className="vacio">No hay unidades a tu nombre en este consorcio.</p>
        )}

        {unidades.map((unidad) => (
          <section key={unidad.unidadId} className="tarjeta">
            <h2>Unidad {unidad.designacion}</h2>

            {unidad.expensas.length === 0 ? (
              <p className="vacio">Todavía no hay liquidaciones emitidas.</p>
            ) : (
              <div className="tabla-desplazable">
                <table>
                  <caption className="ayuda">Liquidaciones de la unidad</caption>
                  <thead>
                    <tr>
                      <th scope="col">Período</th>
                      <th scope="col">Vence</th>
                      <th scope="col" className="numero">
                        Total
                      </th>
                      <th scope="col">Documento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unidad.expensas.map((expensa) => (
                      <tr key={expensa.detalleId}>
                        <td>
                          <Link href={`/expensas/${expensa.detalleId}?consorcio=${activo.id}`}>
                            {expensa.periodo}
                          </Link>
                        </td>
                        <td>{expensa.vencimiento}</td>
                        <td className="numero cifra">{importeParaMostrar(expensa.totalUnidad)}</td>
                        <td>
                          {expensa.direccion ? (
                            <a href={expensa.direccion} download>
                              Descargar
                            </a>
                          ) : (
                            <span className="ayuda">En generación</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </>
    )
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    return (
      <p className="aviso aviso--problema" role="alert">
        {error.mensajeParaUsuario}
      </p>
    )
  }
}
