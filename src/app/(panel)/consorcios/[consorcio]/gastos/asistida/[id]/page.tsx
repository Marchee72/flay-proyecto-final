import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, Download, Hourglass, TriangleAlert } from 'lucide-react'

import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verExtraccion } from '@/aplicacion/gastos/extraccion'
import { listarPeriodos } from '@/aplicacion/periodos/periodos'
import { listarProveedores, listarRubros } from '@/aplicacion/proveedores/proveedores'

import { AvisoDeError, conConsorcio, idONoEncontrado } from '../../../../../con-consorcio'
import { EnVivo } from '../../../../../en-vivo'
import { Volver } from '../../../../../encabezado-consorcio'
import { accionDescartarExtraccion } from '../../acciones'
import { FormularioGasto } from '../../formulario'

export const metadata: Metadata = { title: 'Revisar comprobante — Flay' }

/**
 * Revision de una extraccion (`RF-06`, `CU-06`, Principio IV): la propuesta
 * precarga el formulario de gasto de `002`, marcada como precargada, al lado
 * del comprobante. Confirmar crea el gasto; descartar no deja rastro economico.
 */
export default async function RevisarExtraccionPage({
  params,
}: {
  params: Promise<{ consorcio: string; id: string }>
}) {
  const { consorcio: consorcioId, id: crudo } = await params
  const id = idONoEncontrado(crudo)
  const pantalla = await conConsorcio(consorcioId, 'Revisar comprobante')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  const volver = `/consorcios/${activo.id}/gastos/asistida`

  try {
    const extraccion = await verExtraccion(ALMACEN, HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      extraccionId: id,
    })

    const encabezado = <Volver href={volver} />

    if (extraccion.estado === 'pendiente') {
      return (
        <>
          <EnVivo />
          {encabezado}
          <h1>Revisar comprobante</h1>
          <p className="aviso aviso--atencion" role="status">
            <Hourglass className="icono" aria-hidden="true" />
            <span>
              Extrayendo los datos del comprobante… Tarda unos segundos y esta pantalla se actualiza
              sola.
            </span>
          </p>
        </>
      )
    }

    if (extraccion.estado === 'confirmada' || extraccion.estado === 'corregida') {
      return (
        <>
          {encabezado}
          <h1>Revisar comprobante</h1>
          <p className="apagado">Este comprobante ya fue confirmado como gasto.</p>
        </>
      )
    }
    if (extraccion.estado === 'descartada') {
      return (
        <>
          {encabezado}
          <h1>Revisar comprobante</h1>
          <p className="apagado">Esta extracción fue descartada. No se creó ningún gasto.</p>
        </>
      )
    }

    const [periodos, rubros, proveedores] = await Promise.all([
      listarPeriodos(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      listarRubros(),
      listarProveedores(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
    ])
    const abiertos = periodos.filter((p) => p.estado === 'abierto')
    const { propuesta } = extraccion
    // El proveedor propuesto se ata al padron del consorcio por CUIT o razon
    // social; si no esta, queda vacio y la persona lo elige.
    const proveedor = proveedores.find(
      (p) =>
        (propuesta.cuit && p.cuit === propuesta.cuit) ||
        (propuesta.proveedor && p.razonSocial.toLowerCase() === propuesta.proveedor.toLowerCase()),
    )
    const precargado = Object.fromEntries(
      Object.entries({
        rubro: propuesta.rubroId,
        proveedor: proveedor?.id,
        importe: propuesta.importe,
        fecha: propuesta.fecha,
        descripcion: propuesta.proveedor ? `Comprobante de ${propuesta.proveedor}` : null,
      }).filter((par): par is [string, string] => Boolean(par[1])),
    )

    return (
      <>
        {encabezado}
        <h1>Revisar comprobante</h1>

        {extraccion.estado === 'no_disponible' ? (
          <p className="aviso aviso--atencion" role="status">
            <TriangleAlert className="icono" aria-hidden="true" />
            <span>
              La asistencia no está disponible. El comprobante quedó guardado: cargá los datos a
              mano mirándolo.
            </span>
          </p>
        ) : Object.keys(precargado).length === 0 ? (
          <p className="aviso aviso--atencion" role="status">
            <TriangleAlert className="icono" aria-hidden="true" />
            <span>
              La lectura del comprobante no fue confiable
              {propuesta.confianza ? ` (confianza ${propuesta.confianza})` : ''}: no se precargó
              nada. Cargá los datos a mano mirándolo.
            </span>
          </p>
        ) : (
          <p className="aviso aviso--atencion" role="status">
            <TriangleAlert className="icono" aria-hidden="true" />
            <span>
              Propuesta automática{propuesta.confianza ? ` (confianza ${propuesta.confianza})` : ''}
              . Revisar cada campo contra el comprobante: el gasto se crea recién al confirmar.
            </span>
          </p>
        )}

        <div className="dos-columnas">
          <div className="tarjeta">
            {abiertos.length === 0 ? (
              <div className="vacio">
                <CalendarDays aria-hidden="true" />
                <p>
                  No hay ningún período abierto. Abrir el mes en{' '}
                  <Link href={`/consorcios/${activo.id}/periodos`}>Períodos</Link> y volver.
                </p>
                <div className="fila-acciones">
                  <button
                    className="boton boton--fantasma"
                    type="submit"
                    form="descartar-extraccion"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            ) : (
              <FormularioGasto
                consorcioId={activo.id}
                extraccionId={extraccion.id}
                periodos={abiertos.map((p) => ({
                  id: p.id,
                  etiqueta: `${String(p.mes).padStart(2, '0')}/${p.anio}`,
                }))}
                rubros={rubros.map((r) => ({ id: r.id, etiqueta: r.nombre }))}
                proveedores={proveedores.map((p) => ({ id: p.id, etiqueta: p.razonSocial }))}
                precargado={precargado}
                accionesExtra={
                  <button
                    className="boton boton--fantasma"
                    type="submit"
                    form="descartar-extraccion"
                  >
                    Descartar
                  </button>
                }
              />
            )}
            {/* El formulario de descartar vive aparte; su boton, en el pie del otro (`form=`). */}
            <form id="descartar-extraccion" action={accionDescartarExtraccion}>
              <input type="hidden" name="consorcio" value={activo.id} />
              <input type="hidden" name="extraccion" value={extraccion.id} />
            </form>
          </div>
          <div className="tarjeta">
            <h2>Comprobante</h2>
            {extraccion.direccion === null ? (
              <p className="apagado">El comprobante no se pudo mostrar ahora. Quedó guardado.</p>
            ) : extraccion.tipoContenido === 'application/pdf' ? (
              <iframe
                src={extraccion.direccion}
                title="Comprobante cargado"
                className="visor-comprobante"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- direccion firmada de corta duracion
              <img
                src={extraccion.direccion}
                alt="Comprobante cargado"
                className="visor-comprobante"
              />
            )}
            {extraccion.direccion && (
              <div className="fila-acciones">
                {extraccion.descarga && (
                  <a className="boton boton--fantasma" href={extraccion.descarga} download>
                    <Download className="icono" aria-hidden="true" /> Descargar
                  </a>
                )}
                <a href={extraccion.direccion} target="_blank" rel="noreferrer">
                  Abrir en otra pestaña
                </a>
              </div>
            )}
          </div>
        </div>
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
