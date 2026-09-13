import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, ScanSearch } from 'lucide-react'

import { momentoParaMostrar } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarExtracciones } from '@/aplicacion/gastos/extraccion'

import { AvisoDeError, conConsorcio } from '../../con-consorcio'
import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'
import { CargadorDeComprobante } from './cargador'

export const metadata: Metadata = { title: 'Carga asistida — Flay' }

const ETIQUETA_ESTADO = {
  pendiente: 'Extrayendo…',
  propuesta: 'Propuesta lista',
  confirmada: 'Confirmada',
  corregida: 'Confirmada con correcciones',
  descartada: 'Descartada',
  no_disponible: 'Sin asistencia: cargar a mano',
} as const

/**
 * Carga asistida de comprobantes (`RF-06`, `CU-06`, RN-14): el comprobante
 * suelto sube directo al almacen, la extraccion corre en segundo plano y el
 * gasto **solo** nace cuando la administracion confirma la propuesta.
 */
export default async function CargaAsistidaPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string; descartada?: string }>
}) {
  const parametros = await searchParams
  const pantalla = await conConsorcio(parametros, '/gastos/asistida', 'Carga asistida')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const extracciones = await listarExtracciones(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })
    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref={`/gastos?consorcio=${activo.id}`}
          volverTexto="Volver a gastos"
        />
        <h1>Carga asistida</h1>
        <p className="apagado">
          Subí el comprobante y el sistema propone proveedor, fecha, importe y rubro. El gasto se
          crea recién cuando lo revisás y confirmás.
        </p>
        {parametros.descartada && (
          <p className="aviso aviso--atencion" role="status">
            <BadgeCheck className="icono" aria-hidden="true" />
            <span>Extracción descartada. No se creó ningún gasto.</span>
          </p>
        )}
        <div className="tarjeta">
          <CargadorDeComprobante consorcioId={activo.id} />
        </div>

        <h2>En revisión</h2>
        {extracciones.length === 0 ? (
          <div className="vacio">
            <ScanSearch aria-hidden="true" />
            <p>No hay comprobantes esperando revisión.</p>
          </div>
        ) : (
          <div className="tabla-desplazable">
            <table>
              <thead>
                <tr>
                  <th scope="col">Cargado</th>
                  <th scope="col">Proveedor detectado</th>
                  <th scope="col">Importe</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {extracciones.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/gastos/asistida/${e.id}?consorcio=${activo.id}`}>
                        {momentoParaMostrar(e.creadoEn)}
                      </Link>
                    </td>
                    <td>{e.proveedor ?? '—'}</td>
                    <td className="numero">{e.importe ?? '—'}</td>
                    <td>{ETIQUETA_ESTADO[e.estado]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
