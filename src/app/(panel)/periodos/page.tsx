import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Circle,
  Siren,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios, rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarPeriodos } from '@/aplicacion/periodos/periodos'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { importeParaMostrar } from '@/compartido/formato'

import { BotonAnular, BotonCerrar, BotonLiquidar } from './acciones-de-estado'
import { ModalPeriodo } from './modal-periodo'
import { EncabezadoDeConsorcio } from '../encabezado-consorcio'
import { AvisoConsorcioNoElegido } from '../selector-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../consorcio-activo'

export const metadata: Metadata = { title: 'Períodos — Flay' }

export default async function PeriodosPage({
  searchParams,
}: {
  searchParams: Promise<{ consorcio?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)

  if (consorcios.length === 0) {
    return (
      <>
        <h1>Períodos</h1>
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
        <h1>Períodos</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base="/periodos"
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

  const hoy = RELOJ.hoy()

  try {
    const [periodos, roles] = await Promise.all([
      listarPeriodos(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }),
      rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id),
    ])

    const administra = roles.includes('administrador')

    return (
      <>
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref="/consorcios"
          volverTexto="Volver a consorcios"
        />
        <h1>Períodos</h1>
        <p className="apagado">Un período por mes.</p>

        {administra && (
          <p>
            <ModalPeriodo
              consorcioId={activo.id}
              anio={hoy.getUTCFullYear()}
              mes={hoy.getUTCMonth() + 1}
            />
          </p>
        )}

        {periodos.length === 0 ? (
          <div className="vacio">
            <CalendarDays aria-hidden="true" />
            <p>Todavía no hay períodos abiertos.</p>
          </div>
        ) : (
          <div className="tabla-desplazable">
            <table>
              <caption className="ayuda">Períodos del consorcio</caption>
              <thead>
                <tr>
                  <th scope="col">Período</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="numero">
                    Gastos
                  </th>
                  <th scope="col" className="numero">
                    Liquidación
                  </th>
                  {administra && <th scope="col">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {periodos.map((periodo) => {
                  const etiqueta = `${String(periodo.mes).padStart(2, '0')}/${periodo.anio}`
                  return (
                    <tr key={periodo.id}>
                      <td>{etiqueta}</td>
                      <td>
                        <EstadoDelPeriodo estado={periodo.estado} />
                      </td>
                      <td className="numero cifra">{periodo.gastos}</td>
                      <td className="numero cifra">
                        {periodo.liquidacion ? (
                          <>
                            <Link
                              href={`/liquidaciones/${periodo.liquidacion.id}?consorcio=${activo.id}`}
                            >
                              {importeParaMostrar(periodo.liquidacion.totalGeneral)}
                            </Link>
                            <span className="ayuda"> vence {periodo.liquidacion.vencimiento}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      {administra && (
                        <td>
                          {periodo.estado === 'abierto' && (
                            <BotonCerrar consorcioId={activo.id} periodoId={periodo.id} />
                          )}
                          {periodo.estado !== 'abierto' && !periodo.liquidacion && (
                            <BotonLiquidar
                              consorcioId={activo.id}
                              periodoId={periodo.id}
                              periodoEtiqueta={etiqueta}
                              cantidadGastos={periodo.gastos}
                            />
                          )}
                          {periodo.liquidacion && (
                            <BotonAnular
                              consorcioId={activo.id}
                              liquidacionId={periodo.liquidacion.id}
                              periodoEtiqueta={etiqueta}
                              total={importeParaMostrar(periodo.liquidacion.totalGeneral)}
                              vencimiento={formatearVencimiento(periodo.liquidacion.vencimiento)}
                            />
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {administra && (
          <p>
            <Link href={`/gastos/nuevo?consorcio=${activo.id}`}>Cargar un gasto</Link>
          </p>
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

/** `2026-09-10` → `10/09/2026`: solo reordena la cadena (§4, presentación). */
function formatearVencimiento(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${anio}`
}

/**
 * La base guarda `abierto`/`cerrado`/`liquidado`/`anulado` en minúsculas; en
 * pantalla van con mayúscula inicial y `.etiqueta` (guía §3.4). Abierto avisa
 * (ámbar, admite gastos), Cerrado espera (gris), Liquidado cierra (verde),
 * Anulado advierte (rojo). El icono reutiliza la escala de urgencias de la guía
 * §3.2 con el mismo color: color + icono + palabra, nunca color solo.
 * Solo presentación.
 */
const ETIQUETA_ESTADO_PERIODO: Record<string, { texto: string; clase: string; Icono: LucideIcon }> =
  {
    abierto: { texto: 'Abierto', clase: 'etiqueta--propietario', Icono: TriangleAlert },
    cerrado: { texto: 'Cerrado', clase: 'etiqueta--pendiente', Icono: Circle },
    liquidado: { texto: 'Liquidado', clase: 'etiqueta--rendido', Icono: BadgeCheck },
    anulado: { texto: 'Anulado', clase: 'etiqueta--vencido', Icono: Siren },
  }

function EstadoDelPeriodo({ estado }: { estado: string }) {
  const etiqueta = ETIQUETA_ESTADO_PERIODO[estado] ?? {
    texto: estado,
    clase: 'etiqueta--pendiente',
    Icono: Circle,
  }

  return (
    <span className={`etiqueta ${etiqueta.clase}`}>
      <etiqueta.Icono className="icono" aria-hidden="true" />
      {etiqueta.texto}
    </span>
  )
}
