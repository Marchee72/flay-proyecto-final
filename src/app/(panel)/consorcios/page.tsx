import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'

import { misAdministradoras } from '@/aplicacion/administradoras/mis-administradoras'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { TIPOS_DE_UNIDAD_ASIGNABLES } from '@/aplicacion/consorcios/tipos-de-unidad'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

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

  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  const administradoras = await misAdministradoras(HABILITACIONES, RELOJ, usuarioId)
  const parametros = await searchParams
  const busqueda = (parametros.q ?? '').trim().toLowerCase()
  const visibles = busqueda
    ? consorcios.filter((consorcio) =>
        `${consorcio.nombre} ${consorcio.direccion}`.toLowerCase().includes(busqueda),
      )
    : consorcios

  return (
    <>
      <h1>Consorcios</h1>
      <p className="apagado">Los edificios que administrás.</p>

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
                  <p className="fila-acciones">
                    <Link className="boton boton--fantasma" href={`/consorcios/${consorcio.id}`}>
                      Ver detalle
                    </Link>
                    <Link
                      className="boton boton--fantasma"
                      href={`/consorcios/${consorcio.id}/unidades`}
                    >
                      Unidades
                    </Link>
                  </p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
