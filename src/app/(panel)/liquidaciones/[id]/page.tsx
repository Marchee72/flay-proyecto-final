import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Building2, Siren, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { coeficienteParaMostrar, importeParaMostrar } from '@/compartido/formato'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { verLiquidacion } from '@/aplicacion/liquidacion/ver-liquidacion'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'

import { BotonGenerarDocumentos } from '../../periodos/acciones-de-estado'
import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'
import { AvisoConsorcioNoElegido } from '../../selector-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../../consorcio-activo'

export const metadata: Metadata = { title: 'Liquidación — Flay' }

/**
 * Detalle de una liquidacion emitida (`CU-03`).
 *
 * Muestra **el desglose del interes por unidad**: es lo que permite responder
 * «de dónde salen estos pesos» sin abrir la base (RNF-10, research R-07).
 */
export default async function LiquidacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ consorcio?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const { id } = await params
  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)

  if (consorcios.length === 0) {
    return (
      <>
        <h1>Liquidación</h1>
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
        <h1>Liquidación</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base={`/liquidaciones/${id}`}
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

  try {
    const liquidacion = await verLiquidacion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      liquidacionId: id,
    })
    const generados = liquidacion.detalles.filter((d) => d.tieneDocumento).length
    const roles = await rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id)

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref={`/periodos?consorcio=${activo.id}`}
          volverTexto="Volver a períodos"
        />
        <h1>Liquidación {liquidacion.periodo}</h1>
        <p className="apagado">
          <EstadoDeLaLiquidacion estado={liquidacion.estado} /> · vence{' '}
          {formatearVencimiento(liquidacion.vencimiento)}
        </p>

        {liquidacion.estado === 'anulada' && (
          <p className="aviso aviso--atencion" role="status">
            <TriangleAlert className="icono" aria-hidden="true" />
            <span>
              Esta liquidación fue anulada. Lo que se le emitió a los consorcistas no se reescribe:
              se reemplaza con una nueva, y las dos quedan registradas.
            </span>
          </p>
        )}

        <div className="tarjeta">
          <div className="resumen" role="list" aria-label="Totales de la liquidación">
            <div className="resumen__item" role="listitem">
              <span className="resumen__rotulo">Ordinario</span>
              <span className="resumen__valor cifra">
                {importeParaMostrar(liquidacion.totalOrdinario)}
              </span>
            </div>
            <div className="resumen__item" role="listitem">
              <span className="resumen__rotulo">Extraordinario</span>
              <span className="resumen__valor cifra">
                {importeParaMostrar(liquidacion.totalExtraordinario)}
              </span>
            </div>
            <div className="resumen__item" role="listitem">
              <span className="resumen__rotulo">Total</span>
              <span className="resumen__valor cifra">
                {importeParaMostrar(liquidacion.totalGeneral)}
              </span>
            </div>
          </div>
        </div>

        {liquidacion.estado === 'vigente' && (
          <div className="tarjeta">
            <p>
              Documentos: <strong>{generados}</strong> de {liquidacion.detalles.length}
              {generados === liquidacion.detalles.length && ' · todos generados'}
            </p>
            {roles.includes('administrador') && generados < liquidacion.detalles.length && (
              <BotonGenerarDocumentos consorcioId={activo.id} liquidacionId={liquidacion.id} />
            )}
          </div>
        )}

        <div className="tabla-desplazable">
          <table>
            <caption className="ayuda">Detalle por unidad</caption>
            <thead>
              <tr>
                <th scope="col">Unidad</th>
                <th scope="col" className="numero">
                  Coeficiente %
                </th>
                <th scope="col" className="numero">
                  Ordinario
                </th>
                <th scope="col" className="numero">
                  Extraordinario
                </th>
                <th scope="col" className="numero">
                  Deuda anterior
                </th>
                <th scope="col" className="numero">
                  Interés
                </th>
                <th scope="col" className="numero">
                  Ajuste
                </th>
                <th scope="col" className="numero">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {liquidacion.detalles.map((detalle) => (
                <tr key={detalle.id}>
                  <td>{detalle.designacion}</td>
                  <td className="numero cifra">{coeficienteParaMostrar(detalle.coeficienteAplicado)}</td>
                  <td className="numero cifra">{importeParaMostrar(detalle.importeOrdinario)}</td>
                  <td className="numero cifra">
                    {importeParaMostrar(detalle.importeExtraordinario)}
                  </td>
                  <td className="numero cifra">{importeParaMostrar(detalle.deudaAnterior)}</td>
                  <td className="numero cifra">
                    {importeParaMostrar(detalle.interesMora)}
                    {detalle.intereses.length > 0 && (
                      <span className="ayuda">
                        {' '}
                        {detalle.intereses
                          .map(
                            (linea) =>
                              `${importeParaMostrar(linea.capital)} × ${linea.tasaMensual} % × ${linea.meses}`,
                          )
                          .join(' + ')}
                      </span>
                    )}
                  </td>
                  <td className="numero cifra">{importeParaMostrar(detalle.ajusteRedondeo)}</td>
                  <td className="numero cifra">{importeParaMostrar(detalle.totalUnidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

/** `2026-09-10` → `10/09/2026`: solo reordena la cadena (§4, presentación). */
function formatearVencimiento(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${anio}`
}

/**
 * La base guarda `vigente`/`anulada` en minúsculas; en pantalla van con
 * mayúscula inicial y `.etiqueta` (guía §3.4). Solo presentación.
 */
const ETIQUETA_ESTADO_LIQUIDACION: Record<string, { texto: string; clase: string }> = {
  vigente: { texto: 'Vigente', clase: 'etiqueta--rendido' },
  anulada: { texto: 'Anulada', clase: 'etiqueta--vencido' },
}

function EstadoDeLaLiquidacion({ estado }: { estado: string }) {
  const etiqueta = ETIQUETA_ESTADO_LIQUIDACION[estado] ?? {
    texto: estado,
    clase: 'etiqueta--pendiente',
  }

  return <span className={`etiqueta ${etiqueta.clase}`}>{etiqueta.texto}</span>
}
