import type { Metadata } from 'next'
import Link from 'next/link'
import { FileText, Siren, Users } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { fechaParaMostrar, importeParaMostrar, plural } from '@/compartido/formato'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { misExpensas } from '@/aplicacion/liquidacion/ver-expensa'

import { conConsorcio } from '../../../con-consorcio'
import { Filtros } from '../../../filtros'
import { TablaDesplazable } from '../../../tabla-desplazable'

export const metadata: Metadata = { title: 'Expensas — Flay' }

/**
 * Las expensas de las unidades que el usuario puede ver (`CU-06`, `RF-08`).
 *
 * El consorcista ve las suyas; administrador y consejo, todas. Que sea asi lo
 * decide el caso de uso, no esta pantalla: aca solo se muestra lo que llega.
 */
export default async function ExpensasPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string }>
  searchParams: Promise<{ periodo?: string }>
}) {
  const { consorcio: consorcioId } = await params
  const { periodo } = await searchParams
  const pantalla = await conConsorcio(consorcioId, 'Expensas')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  try {
    const unidades = await misExpensas(ALMACEN, HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })
    // Una sola tabla: doce tarjetas con una fila cada una es mucho desplazamiento
    // para poco dato, y en el consorcio de 96 no se puede leer.
    const todas = unidades.flatMap((unidad) =>
      unidad.expensas.map((expensa) => ({ unidad, expensa })),
    )
    // El filtro se aplica sobre lo ya cargado: son las expensas que el usuario
    // puede ver, y son pocas por unidad.
    const periodos = [...new Map(todas.map((f) => [f.expensa.periodoId, f.expensa.periodo]))]
    const filas = periodo ? todas.filter((f) => f.expensa.periodoId === periodo) : todas

    return (
      <>
        <h1>Expensas</h1>
        <p className="apagado">Las liquidaciones emitidas, por unidad.</p>

        {todas.length > 0 && (
          <Filtros>
            <form method="get" className="fila-de-filtros">
              <div className="campo">
                <label htmlFor="periodo">Período</label>
                <select id="periodo" name="periodo" defaultValue={periodo ?? ''}>
                  <option value="">Todos</option>
                  {periodos.map(([id, etiqueta]) => (
                    <option key={id} value={id}>
                      {etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              <button className="boton boton--fantasma" type="submit">
                Filtrar
              </button>
            </form>
          </Filtros>
        )}

        {unidades.length === 0 ? (
          <div className="vacio">
            <Users aria-hidden="true" />
            <p>No hay unidades a tu nombre en este consorcio.</p>
          </div>
        ) : filas.length === 0 ? (
          <div className="vacio">
            <FileText aria-hidden="true" />
            <p>
              {todas.length === 0
                ? 'Todavía no hay liquidaciones emitidas.'
                : 'No hay expensas de ese período.'}
            </p>
          </div>
        ) : (
          <TablaDesplazable>
            <table>
              <caption>
                {plural(filas.length, 'liquidación', 'liquidaciones')} en{' '}
                {plural(unidades.length, 'unidad', 'unidades')}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Unidad</th>
                  <th scope="col">Período</th>
                  <th scope="col">Vence</th>
                  <th scope="col" className="numero">
                    Total
                  </th>
                  <th scope="col">Documento</th>
                  <th scope="col">Gastos</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ unidad, expensa }) => (
                  <tr key={expensa.detalleId}>
                    <td>{unidad.designacion}</td>
                    <td>
                      <Link href={`/consorcios/${activo.id}/expensas/${expensa.detalleId}`}>
                        {expensa.periodo}
                      </Link>
                    </td>
                    <td>{fechaParaMostrar(expensa.vencimiento)}</td>
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
                    <td>
                      <Link href={`/consorcios/${activo.id}/gastos?periodo=${expensa.periodoId}`}>
                        Ver gastos
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaDesplazable>
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
