import type { Metadata } from 'next'
import { Megaphone } from 'lucide-react'

import { destinatariosPosibles, listarNovedades } from '@/aplicacion/comunicacion/novedades'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'

import { AvisoDeError, conConsorcio } from '../../../con-consorcio'
import { Emergente } from '../../../emergente'
import { ModalNovedad } from './modal-novedad'
import { TarjetaNovedad } from './tarjeta-novedad'

export const metadata: Metadata = { title: 'Novedades — Flay' }

const DIA = 24 * 60 * 60 * 1000

/**
 * Novedades del consorcio (`RF-18`, `CU-12`): fijadas primero. El consorcista
 * ve las vigentes que le tocan; el administrador ve todas con su estado y
 * publica.
 */
export default async function NovedadesPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string }>
  searchParams: Promise<{ publicada?: string }>
}) {
  const parametros = await searchParams
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Novedades')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const roles = await rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id)
    const administra = roles.includes('administrador')
    const datos = { usuarioId, consorcioId: activo.id }
    const [novedades, destinatarios] = await Promise.all([
      listarNovedades(HABILITACIONES, RELOJ, datos),
      administra ? destinatariosPosibles(HABILITACIONES, RELOJ, datos) : null,
    ])
    const hoy = RELOJ.hoy()

    return (
      <>
        <h1>Novedades</h1>
        <p className="apagado">Lo que la administración le dice al consorcio.</p>
        {parametros.publicada && <Emergente tono="verde">Novedad publicada y avisada.</Emergente>}
        {destinatarios && (
          <div className="fila-acciones">
            <ModalNovedad
              consorcioId={activo.id}
              hoy={hoy.toISOString().slice(0, 10)}
              enUnMes={new Date(hoy.getTime() + 30 * DIA).toISOString().slice(0, 10)}
              destinatarios={destinatarios}
            />
          </div>
        )}
        {novedades.length === 0 ? (
          <div className="vacio">
            <Megaphone aria-hidden="true" />
            <p>Sin novedades por ahora.</p>
          </div>
        ) : (
          <div className="novedades">
            {novedades.map((n) => (
              <TarjetaNovedad key={n.id} novedad={n} conEstado={administra} />
            ))}
          </div>
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
