import type { Metadata } from 'next'
import Link from 'next/link'
import { CircleCheck, RotateCw, Siren, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import {
  coeficienteParaMostrar,
  fechaParaMostrar,
  importeParaMostrar,
  plural,
} from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verLiquidacion } from '@/aplicacion/liquidacion/ver-liquidacion'
import { progresoDe, type ProgresoDeDocumentos } from '@/aplicacion/liquidacion/documentos'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'

import { conConsorcio, idONoEncontrado } from '../../../../con-consorcio'
import { EnVivo } from '../../../../en-vivo'
import { Volver } from '../../../../encabezado-consorcio'
import { TablaDesplazable } from '../../../../tabla-desplazable'
import { accionReintentarDocumentos } from './acciones'

export const metadata: Metadata = { title: 'Liquidación — Flay' }

/**
 * Detalle de una liquidacion emitida (`CU-03`).
 *
 * Muestra **el desglose del interes por unidad**: es lo que permite responder
 * «de dónde salen estos pesos» sin abrir la base (RNF-10, research R-07).
 */
export default async function LiquidacionPage({
  params,
}: {
  params: Promise<{ consorcio: string; id: string }>
}) {
  const { consorcio: consorcioId, id: crudo } = await params
  const id = idONoEncontrado(crudo)
  const pantalla = await conConsorcio(consorcioId, 'Liquidación')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  try {
    const liquidacion = await verLiquidacion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      liquidacionId: id,
    })
    const [progreso, roles] = await Promise.all([
      progresoDe(id),
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
    ])
    const administra = roles.includes('administrador')
    const propsDocs = { progreso, administra, consorcioId: activo.id, liquidacionId: id }

    return (
      <>
        <Volver href={`/consorcios/${activo.id}/periodos`} />
        <h1>Liquidación {liquidacion.periodo}</h1>
        <p className="apagado">
          <EstadoDeLaLiquidacion estado={liquidacion.estado} /> · vence{' '}
          {fechaParaMostrar(liquidacion.vencimiento)}
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
            <div className="resumen__item resumen__item--total" role="listitem">
              <span className="resumen__rotulo">Total</span>
              <span className="resumen__valor cifra">
                {importeParaMostrar(liquidacion.totalGeneral)}
              </span>
            </div>
          </div>
        </div>

        {liquidacion.estado === 'vigente' && <DocsEnVivo {...propsDocs} />}

        <p>
          <Link href={`/consorcios/${activo.id}/gastos?periodo=${liquidacion.periodoId}`}>
            Ver los gastos de {liquidacion.periodo}
          </Link>
        </p>

        <TablaDesplazable>
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
                  <td>
                    {detalle.tieneDocumento ? (
                      <Link href={`/consorcios/${activo.id}/expensas/${detalle.id}`}>
                        {detalle.designacion}
                      </Link>
                    ) : (
                      detalle.designacion
                    )}
                  </td>
                  <td className="numero cifra">
                    {coeficienteParaMostrar(detalle.coeficienteAplicado)}
                  </td>
                  <td className="numero cifra">{importeParaMostrar(detalle.importeOrdinario)}</td>
                  <td className="numero cifra">
                    {importeParaMostrar(detalle.importeExtraordinario)}
                  </td>
                  <td className="numero cifra">{importeParaMostrar(detalle.deudaAnterior)}</td>
                  <td className="numero cifra">
                    {detalle.intereses.length === 0 ? (
                      importeParaMostrar(detalle.interesMora)
                    ) : (
                      /* El desglose se despliega: en linea ensanchaba la
                         columna hasta romper la tabla (nota 13). */
                      <details className="desglose">
                        <summary>{importeParaMostrar(detalle.interesMora)}</summary>
                        <ul>
                          {detalle.intereses.map((linea) => (
                            <li key={`${linea.capital}-${linea.meses}`}>
                              <span className="cifra">{importeParaMostrar(linea.capital)}</span> ×{' '}
                              {linea.tasaMensual} % × {plural(linea.meses, 'mes', 'meses')} ={' '}
                              <span className="cifra">{importeParaMostrar(linea.importe)}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="numero cifra">{importeParaMostrar(detalle.ajusteRedondeo)}</td>
                  <td className="numero cifra">{importeParaMostrar(detalle.totalUnidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaDesplazable>
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

/* ---- Indicador en vivo de los documentos ---- */
type PropsDocs = {
  progreso: ProgresoDeDocumentos
  administra: boolean
  consorcioId: string
  liquidacionId: string
}

function estadoDocs(progreso: ProgresoDeDocumentos, administra: boolean) {
  const { generados, total, enCola, agotados } = progreso
  const pct = total ? Math.round((generados / total) * 100) : 0
  const fase =
    generados === total
      ? 'listo'
      : administra && enCola > 0
        ? 'corriendo'
        : administra && agotados > 0
          ? 'trabado'
          : 'simple'
  return { ...progreso, pct, fase }
}

function BarraDocs({ pct, mal }: { pct: number; mal?: boolean }) {
  return (
    <div
      className={`docs-vivo__barra${mal ? ' docs-vivo__barra--mal' : ''}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Documentos generados"
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

function ReintentarDocs({
  consorcioId,
  liquidacionId,
  etiqueta = 'Reintentar',
}: {
  consorcioId: string
  liquidacionId: string
  etiqueta?: string
}) {
  return (
    <form action={accionReintentarDocumentos}>
      <input type="hidden" name="consorcio" value={consorcioId} />
      <input type="hidden" name="liquidacion" value={liquidacionId} />
      <button className="boton boton--fantasma" type="submit">
        <RotateCw className="icono" aria-hidden="true" />
        {etiqueta}
      </button>
    </form>
  )
}

/**
 * Cómo van los documentos de la liquidación, en una fila. Mientras queden
 * trabajos en cola y quien mira administre, monta `EnVivo`: cada refresco pasa
 * por el `after()` del panel que drena un lote (decisión 21). Si alguno se
 * agotó, el administrador reintenta desde acá. El consorcista solo ve el conteo.
 */
function DocsEnVivo({ progreso, administra, consorcioId, liquidacionId }: PropsDocs) {
  const e = estadoDocs(progreso, administra)
  return (
    <div className="docs-vivo" role="status" aria-live="polite">
      {e.fase === 'corriendo' && <EnVivo />}
      {e.fase === 'listo' && (
        <>
          <CircleCheck className="icono docs-vivo__ok" aria-hidden="true" />
          <span className="docs-vivo__titulo">{e.total} documentos generados</span>
        </>
      )}
      {e.fase === 'simple' && (
        <span className="docs-vivo__cifra">
          Documentos: <strong>{e.generados}</strong> de {e.total}
        </span>
      )}
      {e.fase === 'corriendo' && (
        <>
          <span className="docs-vivo__giro" aria-hidden="true" />
          <span className="docs-vivo__titulo">Generando documentos</span>
          <span className="docs-vivo__cifra">
            {e.generados} / {e.total}
          </span>
          <BarraDocs pct={e.pct} />
          <span className="docs-vivo__nota">Sigue solo, podés salir</span>
          {e.agotados > 0 && (
            <ReintentarDocs consorcioId={consorcioId} liquidacionId={liquidacionId} />
          )}
        </>
      )}
      {e.fase === 'trabado' && (
        <>
          <TriangleAlert className="icono docs-vivo__alerta" aria-hidden="true" />
          <span className="docs-vivo__titulo">Se detuvo: faltan {e.total - e.generados}</span>
          <span className="docs-vivo__cifra">
            {e.generados} / {e.total}
          </span>
          <BarraDocs pct={e.pct} mal />
          <ReintentarDocs
            consorcioId={consorcioId}
            liquidacionId={liquidacionId}
            etiqueta="Continuar"
          />
        </>
      )}
    </div>
  )
}
