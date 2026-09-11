import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Building2, FileText, Siren, Users } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeParaMostrar } from '@/compartido/formato'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { misExpensas } from '@/aplicacion/liquidacion/ver-expensa'

import { AvisoConsorcioNoElegido } from '../selector-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../consorcio-activo'
import { EncabezadoDeConsorcio } from '../encabezado-consorcio'

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

  if (consorcios.length === 0) {
    return (
      <>
        <h1>Expensas</h1>
        <div className="vacio">
          <Building2 aria-hidden="true" />
          <p>
            Todavía no hay ningún consorcio al alcance. El paso siguiente es pedir acceso a la
            administración.
          </p>
        </div>
      </>
    )
  }

  const galletas = await cookies()
  const { activo, pedidoDesconocido } = resolverConsorcioActivo(
    parametros,
    consorcios,
    galletas.get(NOMBRE_GALLETA_CONSORCIO)?.value,
  )

  if (!activo) {
    return (
      <>
        <h1>Expensas</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base="/expensas"
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

  try {
    const unidades = await misExpensas(ALMACEN, HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref="/consorcios"
          volverTexto="Volver a consorcios"
        />
        <h1>Expensas</h1>

        {unidades.length === 0 && (
          <div className="vacio">
            <Users aria-hidden="true" />
            <p>No hay unidades a tu nombre en este consorcio.</p>
          </div>
        )}

        {unidades.map((unidad) => (
          <section key={unidad.unidadId} className="tarjeta">
            <h2>Unidad {unidad.designacion}</h2>

            {unidad.expensas.length === 0 ? (
              <div className="vacio">
                <FileText aria-hidden="true" />
                <p>Todavía no hay liquidaciones emitidas.</p>
              </div>
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
        <Siren className="icono" aria-hidden="true" />
        <span>{error.mensajeParaUsuario}</span>
      </p>
    )
  }
}
