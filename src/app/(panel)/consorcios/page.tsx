import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building2, MessageSquareWarning, TrendingUp, TriangleAlert } from 'lucide-react'

import { misAdministradoras } from '@/aplicacion/administradoras/mis-administradoras'
import { TIPOS_DE_UNIDAD_ASIGNABLES } from '@/aplicacion/consorcios/tipos-de-unidad'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { verPanel, type PanelConsolidado } from '@/aplicacion/indicadores/indicadores'

import { consorciosAlAlcance } from '../con-consorcio'

import { BotonModal } from '../modal'
import { WizardConsorcio } from './nuevo/wizard'

export const metadata: Metadata = { title: 'Consorcios — Flay' }

export default async function ConsorciosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const [consorcios, administradoras, senales] = await Promise.all([
    consorciosAlAlcance(usuarioId),
    misAdministradoras(HABILITACIONES, RELOJ, usuarioId),
    // Las senales son del que administra (`verPanel` lanza si no administra
    // ninguno): para consejo y consorcista la tarjeta va sin ellas.
    verPanel(HABILITACIONES, RELOJ, { usuarioId }).then(
      (panel) => ({ meta: panel.meta, por: new Map(panel.consorcios.map((c) => [c.id, c])) }),
      () => ({ meta: '0', por: new Map<string, PanelConsolidado['consorcios'][number]>() }),
    ),
  ])
  const parametros = await searchParams
  const busqueda = (parametros.q ?? '').trim().toLowerCase()
  const visibles = busqueda
    ? consorcios.filter((consorcio) =>
        `${consorcio.nombre} ${consorcio.direccion}`.toLowerCase().includes(busqueda),
      )
    : consorcios

  return (
    <main className="suelto">
      <h1>Consorcios</h1>
      <p className="apagado">Los edificios que administrás. Elegí uno para trabajar sobre él.</p>

      <p className="fila-acciones">
        <BotonModal etiqueta="Nuevo consorcio" titulo="Nuevo consorcio">
          {administradoras.length === 0 ? (
            <div className="vacio">
              <Building2 aria-hidden="true" />
              <p>
                Sin administradora al alcance. El alta de consorcios la autoriza el administrador de
                la plataforma.
              </p>
            </div>
          ) : (
            <WizardConsorcio administradoras={administradoras} tipos={TIPOS_DE_UNIDAD_ASIGNABLES} />
          )}
        </BotonModal>
      </p>
      <noscript>
        <p>
          <Link className="boton boton--primario" href="/consorcios/nuevo">
            Nuevo consorcio
          </Link>
        </p>
      </noscript>

      {consorcios.length === 0 ? (
        <div className="vacio">
          <Building2 aria-hidden="true" />
          <p>Todavía no hay ningún consorcio a tu alcance.</p>
        </div>
      ) : (
        <>
          <form className="fila-de-filtros buscador" role="search" aria-label="Buscar consorcio">
            <div className="campo">
              <label htmlFor="q">Buscar por nombre o dirección</label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={parametros.q ?? ''}
                autoComplete="off"
              />
            </div>
            <button className="boton boton--fantasma" type="submit">
              Buscar
            </button>
            {busqueda && (
              <Link className="boton boton--fantasma" href="/consorcios">
                Limpiar
              </Link>
            )}
          </form>

          {visibles.length === 0 ? (
            <div className="vacio">
              <Building2 aria-hidden="true" />
              <p>Ningún consorcio coincide con esa búsqueda.</p>
            </div>
          ) : (
            <div className="rejilla">
              {visibles.map((consorcio) => (
                <article
                  className="tarjeta tarjeta-consorcio"
                  key={consorcio.id}
                  aria-label={consorcio.nombre}
                >
                  <div className="tarjeta-consorcio__encabezado">
                    <span className="tarjeta-consorcio__insignia" aria-hidden="true">
                      <Building2 className="icono" aria-hidden="true" />
                    </span>
                    <div>
                      <h2>
                        <Link href={`/consorcios/${consorcio.id}`}>{consorcio.nombre}</Link>
                      </h2>
                      <p className="apagado">{consorcio.direccion}</p>
                    </div>
                  </div>
                  <Senales senal={senales.por.get(consorcio.id)} meta={senales.meta} />
                  <p className="fila-acciones">
                    <Link className="boton boton--primario" href={`/consorcios/${consorcio.id}`}>
                      Entrar
                    </Link>
                  </p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}

/** La fila de senales de `verPanel`: solo lo que esta fuera de lo normal se pinta. */
function Senales({
  senal,
  meta,
}: {
  senal?: PanelConsolidado['consorcios'][number]
  meta: string
}) {
  if (!senal) return null
  const morosa = senal.morosidad !== null && Number(senal.morosidad) > Number(meta)
  return (
    <ul className="senales" aria-label="Señales">
      <li>
        <TrendingUp className="icono" aria-hidden="true" />
        {senal.ultimoPeriodo ? `Último período ${senal.ultimoPeriodo}` : 'Sin liquidaciones'}
      </li>
      {senal.morosidad !== null && (
        <li className={morosa ? 'senal--atencion' : undefined}>
          <TriangleAlert className="icono" aria-hidden="true" />
          Morosidad <span className="cifra">{senal.morosidad}</span> % · {senal.unidadesEnMora} en
          mora
        </li>
      )}
      {senal.reclamosAbiertos > 0 && (
        <li className={senal.reclamosCriticos > 0 ? 'senal--atencion' : undefined}>
          <MessageSquareWarning className="icono" aria-hidden="true" />
          {senal.reclamosAbiertos} reclamos abiertos
          {senal.reclamosCriticos > 0 && `, ${senal.reclamosCriticos} críticos`}
        </li>
      )}
      {senal.alertasDeGasto > 0 && (
        <li className="senal--atencion">
          <TriangleAlert className="icono" aria-hidden="true" />
          {senal.alertasDeGasto} rubros con desvío de gasto
        </li>
      )}
    </ul>
  )
}
