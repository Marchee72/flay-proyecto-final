import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarPeriodos } from '@/aplicacion/periodos/periodos'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { FormularioPeriodo } from './formulario'

export const metadata: Metadata = { title: 'Períodos — Flay' }

export default async function PeriodosPage({
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

  const hoy = RELOJ.hoy()

  try {
    const periodos = await listarPeriodos(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })

    return (
      <>
        <h1>Períodos</h1>
        <p className="apagado">De {activo.nombre}. Un período por mes.</p>

        <div className="tarjeta">
          <h2>Abrir un mes</h2>
          <FormularioPeriodo
            consorcioId={activo.id}
            anio={hoy.getUTCFullYear()}
            mes={hoy.getUTCMonth() + 1}
          />
        </div>

        {periodos.length === 0 ? (
          <p className="vacio">Todavía no hay períodos abiertos.</p>
        ) : (
          <div className="tabla-desplazable">
            <table>
              <caption className="ayuda">Períodos del consorcio</caption>
              <thead>
                <tr>
                  <th scope="col">Período</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="numero">
                    Gastos
                  </th>
                </tr>
              </thead>
              <tbody>
                {periodos.map((periodo) => (
                  <tr key={periodo.id}>
                    <td>
                      {String(periodo.mes).padStart(2, '0')}/{periodo.anio}
                    </td>
                    <td>{periodo.estado}</td>
                    <td className="numero cifra">{periodo.gastos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p>
          <Link href={`/gastos/nuevo?consorcio=${activo.id}`}>Cargar un gasto</Link>
        </p>
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
