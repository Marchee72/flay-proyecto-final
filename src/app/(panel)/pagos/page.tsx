import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Building2, Siren, TriangleAlert, Wallet } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeParaMostrar } from '@/compartido/formato'
import { misConsorcios, rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { misExpensas } from '@/aplicacion/liquidacion/ver-expensa'
import { verEstadoDeCuenta } from '@/aplicacion/pagos/estado-de-cuenta'
import { MEDIOS_DE_PAGO } from '@/aplicacion/pagos/registrar'

import { AvisoConsorcioNoElegido } from '../selector-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../consorcio-activo'
import { EncabezadoDeConsorcio } from '../encabezado-consorcio'
import { EnlaceExportar } from '../exportar'
import { ModalPago } from './modal-pago'

export const metadata: Metadata = { title: 'Pagos — Flay' }

/**
 * Estado de cuenta por unidad (`FR-028`, `CU-04`): liquidaciones, pagos
 * imputados y saldo. El consorcista ve sus unidades; el administrador, todas,
 * y ademas registra pagos.
 */
export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string; registrado?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)

  if (consorcios.length === 0) {
    return (
      <>
        <h1>Pagos</h1>
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
        <h1>Pagos</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base="/pagos"
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

  try {
    const [roles, unidades] = await Promise.all([
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
      misExpensas(ALMACEN, HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
    ])

    const cuentas = await Promise.all(
      unidades.map((unidad) =>
        verEstadoDeCuenta(HABILITACIONES, RELOJ, {
          usuarioId,
          consorcioId: activo.id,
          unidadId: unidad.unidadId,
        }),
      ),
    )

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref="/consorcios"
          volverTexto="Volver a consorcios"
        />
        <h1>Pagos</h1>
        <p className="apagado">Estado de cuenta por unidad.</p>
        {roles.some((r) => r === 'administrador' || r === 'consejo') && (
          <p>
            <EnlaceExportar consorcioId={activo.id} tabla="pagos" />
          </p>
        )}

        {parametros.registrado && (
          <p className="aviso aviso--atencion" role="status">
            <TriangleAlert className="icono" aria-hidden="true" />
            <span>Pago registrado e imputado a lo más viejo primero.</span>
          </p>
        )}

        {roles.includes('administrador') && (
          <p>
            <ModalPago
              consorcioId={activo.id}
              unidades={cuentas.map((cuenta) => ({
                id: cuenta.unidadId,
                designacion: cuenta.designacion,
              }))}
              medios={MEDIOS_DE_PAGO}
              hoy={RELOJ.hoy().toISOString().slice(0, 10)}
            />
          </p>
        )}

        {cuentas.length === 0 ? (
          <div className="vacio">
            <Wallet aria-hidden="true" />
            <p>Sin movimientos todavía. Cuando se emita la primera liquidación, aparece acá.</p>
          </div>
        ) : (
          cuentas.map((cuenta) => (
            <section key={cuenta.unidadId} className="tarjeta">
              <h2>Unidad {cuenta.designacion}</h2>
              <p>
                Saldo <strong className="cifra">{importeParaMostrar(cuenta.saldo)}</strong>
                {cuenta.saldoAFavor !== '0.00' && (
                  <>
                    {' · a favor '}
                    <strong className="cifra">{importeParaMostrar(cuenta.saldoAFavor)}</strong>
                  </>
                )}
              </p>

              {cuenta.movimientos.length > 0 ? (
                <div
                  className="tabla-desplazable"
                  tabIndex={0}
                  role="region"
                  aria-label={`Movimientos de la unidad ${cuenta.designacion}`}
                >
                  <table>
                    <caption className="ayuda">Movimientos</caption>
                    <thead>
                      <tr>
                        <th scope="col">Fecha</th>
                        <th scope="col">Concepto</th>
                        <th scope="col" className="numero">
                          Importe
                        </th>
                        <th scope="col" className="numero">
                          Saldo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuenta.movimientos.map((movimiento, i) => (
                        <tr key={i}>
                          <td>{movimiento.fecha}</td>
                          <td>{movimiento.concepto}</td>
                          <td className="numero cifra">{importeParaMostrar(movimiento.importe)}</td>
                          <td className="numero cifra">{importeParaMostrar(movimiento.saldo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="vacio">
                  <Wallet aria-hidden="true" />
                  <p>Sin movimientos todavía para esta unidad.</p>
                </div>
              )}
            </section>
          ))
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
