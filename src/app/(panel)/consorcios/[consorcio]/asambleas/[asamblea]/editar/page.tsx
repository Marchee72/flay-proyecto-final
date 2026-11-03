import type { Metadata } from 'next'

import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verAsamblea } from '@/aplicacion/asambleas/ver'

import { AvisoDeError, conConsorcio, idONoEncontrado } from '../../../../../con-consorcio'
import { Volver } from '../../../../../encabezado-consorcio'
import { FormularioAsamblea } from '../../formulario-asamblea'

export const metadata: Metadata = { title: 'Editar asamblea — Flay' }

/** `datetime-local` en hora de Argentina (UTC-3, sin horario de verano). */
const paraEntrada = (iso: string) =>
  new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 16)

export default async function EditarAsambleaPage({
  params,
}: {
  params: Promise<{ consorcio: string; asamblea: string }>
}) {
  const { consorcio: consorcioId, asamblea } = await params
  const asambleaId = idONoEncontrado(asamblea)
  const pantalla = await conConsorcio(consorcioId, 'Editar asamblea')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  const volver = `/consorcios/${activo.id}/asambleas/${asambleaId}`

  try {
    const [vista, roles] = await Promise.all([
      verAsamblea(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id, asambleaId }),
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
    ])
    if (vista.estado !== 'borrador') {
      return (
        <>
          <Volver href={volver} />
          <h1>Editar asamblea</h1>
          <p className="aviso aviso--atencion" role="status">
            Una asamblea convocada no cambia sus datos ni su orden del día.
          </p>
        </>
      )
    }
    return (
      <>
        <Volver href={volver} />
        <h1>Editar asamblea</h1>
        <FormularioAsamblea
          consorcioId={activo.id}
          asambleaId={asambleaId}
          esConsejo={roles.includes('consejo')}
          inicial={{
            tipo: vista.tipo,
            titulo: vista.titulo,
            fechaHora: paraEntrada(vista.fechaHora),
            lugar: vista.lugar,
            administracionInvitada: vista.administracionInvitada,
            puntos: vista.puntos.map((p) => ({
              titulo: p.titulo,
              descripcion: p.descripcion ?? '',
              modalidad: p.modalidad,
              mayoria: p.mayoria ?? 'absoluta',
              opciones: p.opciones.length ? p.opciones.map((o) => o.texto) : ['', ''],
            })),
          }}
        />
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
