import type { Metadata } from 'next'
import { BadgeCheck, Megaphone, Pin } from 'lucide-react'

import { fechaParaMostrar } from '@/compartido/formato'
import { listarNovedades } from '@/aplicacion/comunicacion/novedades'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { AvisoDeError, conConsorcio } from '../con-consorcio'
import { EncabezadoDeConsorcio } from '../encabezado-consorcio'
import { ModalNovedad } from './modal-novedad'

export const metadata: Metadata = { title: 'Novedades — Flay' }

/** Novedades del consorcio (`RF-18`, `CU-12`): fijadas primero; publica el administrador. */
export default async function NovedadesPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string; publicada?: string }>
}) {
  const parametros = await searchParams
  const pantalla = await conConsorcio(parametros, '/novedades', 'Novedades')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const [novedades, roles] = await Promise.all([
      listarNovedades(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
    ])

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref="/consorcios"
          volverTexto="Volver a consorcios"
        />
        <h1>Novedades</h1>
        <p className="apagado">Lo que la administración le dice al consorcio.</p>
        {parametros.publicada && (
          <p className="aviso aviso--atencion" role="status">
            <BadgeCheck className="icono" aria-hidden="true" />
            <span>Novedad publicada y avisada.</span>
          </p>
        )}
        {roles.includes('administrador') && (
          <div className="fila-acciones">
            <ModalNovedad consorcioId={activo.id} />
          </div>
        )}
        {novedades.length === 0 ? (
          <div className="vacio">
            <Megaphone aria-hidden="true" />
            <p>Sin novedades todavía.</p>
          </div>
        ) : (
          novedades.map((n) => (
            <article className="tarjeta" key={n.id}>
              <h2>
                {n.fijada && <Pin className="icono" aria-label="Fijada" />} {n.titulo}
              </h2>
              <p className="ayuda">{fechaParaMostrar(n.publicadaEn)}</p>
              <p style={{ whiteSpace: 'pre-line' }}>{n.cuerpo}</p>
            </article>
          ))
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
