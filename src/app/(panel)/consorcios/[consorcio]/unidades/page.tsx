import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BadgeCheck, Pencil, Siren } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { coeficienteParaMostrar, fechaParaMostrar } from '@/compartido/formato'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { TIPOS_DE_UNIDAD_ASIGNABLES } from '@/aplicacion/consorcios/tipos-de-unidad'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { CargadorDePadron } from './cargador'
import { TablaDesplazable } from '../../../tabla-desplazable'

export const metadata: Metadata = { title: 'Unidades — Flay' }

export default async function UnidadesPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string }>
  searchParams: Promise<{ editar?: string; editado?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const { consorcio: id } = await params
  const parametros = await searchParams

  let consorcio
  try {
    consorcio = await verConsorcio(HABILITACIONES, RELOJ, { usuarioId, consorcioId: id })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    return (
      <p className="aviso aviso--problema" role="alert">
        <Siren className="icono" aria-hidden="true" />
        <span>{error.mensajeParaUsuario}</span>
      </p>
    )
  }

  // El consejo ve el padron pero no lo carga ni lo edita (RNF-03): sin permiso no hay editor.
  const administra = (await rolesEn(HABILITACIONES, RELOJ, usuarioId, id)).includes('administrador')

  if (administra && parametros.editar && consorcio.unidades.length > 0) {
    return (
      <>
        <h1>Editar padrón</h1>
        <p className="apagado">
          Renombrar, cambiar el tipo o el coeficiente, agregar unidades o darlas de baja. Se guarda
          todo junto y la suma tiene que seguir dando 100.{' '}
          <Link href={`/consorcios/${consorcio.id}/unidades`}>Volver sin guardar</Link>.
        </p>
        <CargadorDePadron
          consorcioId={consorcio.id}
          tipos={TIPOS_DE_UNIDAD_ASIGNABLES}
          inicial={consorcio.unidades.map((unidad) => ({
            id: unidad.id,
            designacion: unidad.designacion,
            tipo: unidad.tipo,
            coeficiente: coeficienteParaMostrar(unidad.coeficiente),
          }))}
        />
      </>
    )
  }

  return (
    <>
      <h1>Unidades</h1>
      <p className="apagado">El padrón vigente: designación, tipo y coeficiente de cada unidad.</p>

      {parametros.editado && (
        <p className="aviso aviso--exito" role="status">
          <BadgeCheck className="icono" aria-hidden="true" />
          <span>Padrón guardado. Los cambios de coeficiente rigen desde hoy.</span>
        </p>
      )}

      {administra && consorcio.unidades.length > 0 && (
        <div className="fila-acciones">
          <Link
            className="boton boton--primario"
            href={`/consorcios/${consorcio.id}/unidades?editar=1`}
          >
            <Pencil className="icono" aria-hidden="true" />
            Editar padrón
          </Link>
        </div>
      )}

      {consorcio.unidades.length === 0 ? (
        administra ? (
          <>
            <p className="apagado">
              El padrón se carga entero de una vez: unidad por unidad la suma nunca daría 100 y cada
              alta sería un rechazo.
            </p>
            <CargadorDePadron consorcioId={consorcio.id} tipos={TIPOS_DE_UNIDAD_ASIGNABLES} />
          </>
        ) : (
          <p className="apagado">El administrador todavía no cargó el padrón.</p>
        )
      ) : (
        <TablaDesplazable>
          <table>
            <caption className="ayuda">Padrón vigente</caption>
            <thead>
              <tr>
                <th scope="col">Designación</th>
                <th scope="col">Tipo</th>
                <th scope="col" className="numero">
                  Coeficiente %
                </th>
              </tr>
            </thead>
            <tbody>
              {consorcio.unidades.map((unidad) => (
                <tr key={unidad.id}>
                  <td>{unidad.designacion}</td>
                  <td>{etiquetaDeTipo(unidad.tipo)}</td>
                  <td className="numero cifra">{coeficienteParaMostrar(unidad.coeficiente)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td className="numero cifra">{coeficienteParaMostrar(consorcio.suma)}</td>
              </tr>
            </tfoot>
          </table>
        </TablaDesplazable>
      )}

      {consorcio.dadasDeBaja.length > 0 && (
        <TablaDesplazable>
          <table>
            <caption className="ayuda">
              Dadas de baja: ya no se liquidan, pero su historia sigue en pie
            </caption>
            <thead>
              <tr>
                <th scope="col">Designación</th>
                <th scope="col">Tipo</th>
                <th scope="col">Baja desde</th>
              </tr>
            </thead>
            <tbody>
              {consorcio.dadasDeBaja.map((unidad) => (
                <tr key={unidad.id}>
                  <td>{unidad.designacion}</td>
                  <td>{etiquetaDeTipo(unidad.tipo)}</td>
                  <td>{fechaParaMostrar(unidad.bajaDesde)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaDesplazable>
      )}
    </>
  )
}

/** El enumerado se guarda en minúsculas; en pantalla va con mayúscula inicial. */
const etiquetaDeTipo = (tipo: string) =>
  TIPOS_DE_UNIDAD_ASIGNABLES.find((candidato) => candidato.valor === tipo)?.etiqueta ?? tipo
