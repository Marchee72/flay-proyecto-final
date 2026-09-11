import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Building2, Siren, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeParaMostrar } from '@/compartido/formato'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { verMorosidad } from '@/aplicacion/pagos/estado-de-cuenta'

import { AvisoConsorcioNoElegido } from '../selector-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../consorcio-activo'
import { EncabezadoDeConsorcio } from '../encabezado-consorcio'

export const metadata: Metadata = { title: 'Morosidad — Flay' }

/**
 * Morosidad (`FR-029`, regla RN-13 § 7.2). Lo que se muestra es lo que el caso
 * de uso devolvio segun el rol: si no vino nomina, no hay nomina que ocultar.
 */
export default async function MorosidadPage({
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
        <h1>Morosidad</h1>
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
        <h1>Morosidad</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base="/morosidad"
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

  try {
    const morosidad = await verMorosidad(HABILITACIONES, RELOJ, {
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
        <h1>Morosidad</h1>

        <div className="kpi">
          <span className="kpi__icono">
            <TriangleAlert className="icono" aria-hidden="true" />
          </span>
          <div>
            <div className="kpi__rotulo">Unidades con deuda vencida</div>
            <div className="kpi__cifra cifra">
              {morosidad.agregado.unidadesEnMora} de {morosidad.agregado.unidadesTotales}
            </div>
            <div className="kpi__detalle">
              Deuda total{' '}
              <span className="cifra">{importeParaMostrar(morosidad.agregado.deudaTotal)}</span>
            </div>
          </div>
        </div>

        {morosidad.nominada ? (
          <div className="tabla-desplazable">
            <table>
              <caption className="ayuda">Nómina de deudores</caption>
              <thead>
                <tr>
                  <th scope="col">Unidad</th>
                  <th scope="col" className="numero">
                    Períodos vencidos
                  </th>
                  <th scope="col" className="numero">
                    Deuda
                  </th>
                </tr>
              </thead>
              <tbody>
                {morosidad.deudores.map((deudor) => (
                  <tr key={deudor.unidadId}>
                    <td>{deudor.designacion}</td>
                    <td className="numero cifra">{deudor.periodosVencidos}</td>
                    <td className="numero cifra">{importeParaMostrar(deudor.deuda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ayuda">
            La nómina de deudores la ven el administrador y el consejo de propietarios.
          </p>
        )}
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
