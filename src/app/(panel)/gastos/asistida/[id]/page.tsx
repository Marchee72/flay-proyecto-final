import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, Hourglass, TriangleAlert } from 'lucide-react'

import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verExtraccion } from '@/aplicacion/gastos/extraccion'
import { listarPeriodos } from '@/aplicacion/periodos/periodos'
import { listarProveedores, listarRubros } from '@/aplicacion/proveedores/proveedores'

import { AvisoDeError, conConsorcio } from '../../../con-consorcio'
import { EncabezadoDeConsorcio } from '../../../encabezado-consorcio'
import { accionDescartarExtraccion } from '../../acciones'
import { FormularioGasto } from '../../nuevo/formulario'

export const metadata: Metadata = { title: 'Revisar comprobante — Flay' }

/**
 * Revision de una extraccion (`RF-06`, `CU-06`, Principio IV): la propuesta
 * precarga el formulario de gasto de `002`, marcada como precargada, al lado
 * del comprobante. Confirmar crea el gasto; descartar no deja rastro economico.
 */
export default async function RevisarExtraccionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ consorcio?: string }>
}) {
  const { id } = await params
  const parametros = await searchParams
  const pantalla = await conConsorcio(parametros, `/gastos/asistida/${id}`, 'Revisar comprobante')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  const volver = `/gastos/asistida?consorcio=${activo.id}`

  try {
    const extraccion = await verExtraccion(ALMACEN, HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      extraccionId: id,
    })

    const encabezado = (
      <EncabezadoDeConsorcio
        nombre={activo.nombre}
        volverHref={volver}
        volverTexto="Volver a carga asistida"
      />
    )

    if (extraccion.estado === 'pendiente') {
      return (
        <>
          {encabezado}
          <h1>Revisar comprobante</h1>
          <p className="aviso aviso--atencion" role="status">
            <Hourglass className="icono" aria-hidden="true" />
            <span>
              Extrayendo los datos del comprobante… Tarda unos segundos.{' '}
              <Link href={`/gastos/asistida/${id}?consorcio=${activo.id}`}>Actualizar</Link>.
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
                  <Link href={`/periodos?consorcio=${activo.id}`}>Períodos</Link> y volver.
                </p>
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
              />
            )}
            <form action={accionDescartarExtraccion} className="fila-acciones">
              <input type="hidden" name="consorcio" value={activo.id} />
              <input type="hidden" name="extraccion" value={extraccion.id} />
              <button className="boton boton--fantasma" type="submit">
                Descartar comprobante
              </button>
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
              <p>
                <a href={extraccion.direccion} target="_blank" rel="noreferrer">
                  Abrir en otra pestaña
                </a>
              </p>
            )}
          </div>
        </div>
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
