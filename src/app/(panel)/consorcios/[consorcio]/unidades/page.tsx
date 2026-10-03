import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building, Pencil, Siren } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importe } from '@/compartido/dinero'
import { coeficienteParaMostrar, fechaParaMostrar, plural } from '@/compartido/formato'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { TIPOS_DE_UNIDAD_ASIGNABLES } from '@/aplicacion/consorcios/tipos-de-unidad'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { divisionDe, pisoDe, sumarCoeficientes } from '@/aplicacion/consorcios/unidades'

import { CargadorDePadron } from './cargador'
import { Filtros } from '../../../filtros'
import { Paginacion } from '../../../paginacion'

export const metadata: Metadata = { title: 'Unidades — Flay' }

const POR_PAGINA = 10

type Parametros = {
  editar?: string
  piso?: string
  division?: string
  pagina?: string
}

export default async function UnidadesPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string }>
  searchParams: Promise<Parametros>
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

  const pisosDisponibles = Array.from(
    new Set(
      consorcio.unidades.map((u) => pisoDe(u.designacion)).filter((p): p is string => p !== null),
    ),
  ).sort((a, b) => {
    if (a === 'PB') return -1
    if (b === 'PB') return 1
    const numA = parseInt(a, 10)
    const numB = parseInt(b, 10)
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB
    return a.localeCompare(b)
  })

  const divisionesDisponibles = Array.from(
    new Set(
      consorcio.unidades
        .map((u) => divisionDe(u.designacion))
        .filter((d): d is string => d !== null),
    ),
  ).sort((a, b) => a.localeCompare(b))

  const unidadesFiltradas = consorcio.unidades.filter((u) => {
    if (parametros.piso && pisoDe(u.designacion) !== parametros.piso) return false
    if (parametros.division && divisionDe(u.designacion) !== parametros.division) return false
    return true
  })

  const sumaFiltrada = sumarCoeficientes(
    unidadesFiltradas.map((u) => ({
      designacion: u.designacion,
      coeficiente: importe(u.coeficiente),
    })),
  )

  const paginas = Math.max(1, Math.ceil(unidadesFiltradas.length / POR_PAGINA))
  const paginaSolicitada = Number(parametros.pagina ?? 1) || 1
  const paginaActual = Math.min(Math.max(1, paginaSolicitada), paginas)
  const unidadesEnPagina = unidadesFiltradas.slice(
    (paginaActual - 1) * POR_PAGINA,
    paginaActual * POR_PAGINA,
  )

  const urlParaPagina = (p: number) => {
    const query = new URLSearchParams()
    if (parametros.piso) query.set('piso', parametros.piso)
    if (parametros.division) query.set('division', parametros.division)
    if (p > 1) query.set('pagina', String(p))
    const qs = query.toString()
    return `/consorcios/${consorcio.id}/unidades${qs ? `?${qs}` : ''}`
  }

  return (
    <>
      <h1>Unidades</h1>
      <p className="apagado">El padrón vigente: designación, tipo y coeficiente de cada unidad.</p>

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
        <>
          <Filtros>
            <form method="get" className="fila-de-filtros">
              <div className="campo">
                <label htmlFor="piso">Piso</label>
                <select id="piso" name="piso" defaultValue={parametros.piso ?? ''}>
                  <option value="">Todos</option>
                  {pisosDisponibles.map((piso) => (
                    <option key={piso} value={piso}>
                      {piso === 'PB' ? 'PB' : `Piso ${piso}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label htmlFor="division">División</label>
                <select id="division" name="division" defaultValue={parametros.division ?? ''}>
                  <option value="">Todas</option>
                  {divisionesDisponibles.map((div) => (
                    <option key={div} value={div}>
                      {div}
                    </option>
                  ))}
                </select>
              </div>

              <button className="boton boton--fantasma" type="submit">
                Filtrar
              </button>

              {(parametros.piso || parametros.division) && (
                <Link
                  className="boton boton--fantasma"
                  href={`/consorcios/${consorcio.id}/unidades`}
                >
                  Limpiar
                </Link>
              )}
            </form>
          </Filtros>

          {unidadesFiltradas.length === 0 ? (
            <div className="vacio">
              <Building aria-hidden="true" />
              <p>No hay unidades que coincidan con el filtro.</p>
              <div className="fila-acciones">
                <Link
                  className="boton boton--fantasma"
                  href={`/consorcios/${consorcio.id}/unidades`}
                >
                  Limpiar filtros
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="tabla-desplazable">
                <table>
                  <caption className="ayuda">
                    {plural(unidadesFiltradas.length, 'unidad', 'unidades')} · página {paginaActual}{' '}
                    de {paginas}
                  </caption>
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
                    {unidadesEnPagina.map((unidad) => (
                      <tr key={unidad.id}>
                        <td>{unidad.designacion}</td>
                        <td>{etiquetaDeTipo(unidad.tipo)}</td>
                        <td className="numero cifra">
                          {coeficienteParaMostrar(unidad.coeficiente)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>
                        {parametros.piso || parametros.division ? 'Total del filtro' : 'Total'}
                      </td>
                      <td className="numero cifra">
                        {coeficienteParaMostrar(sumaFiltrada.total.toFixed(8))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <Paginacion
                pagina={paginaActual}
                paginas={paginas}
                urlParaPagina={urlParaPagina}
                etiquetaAria="Paginación de unidades"
              />
            </>
          )}
        </>
      )}

      {consorcio.dadasDeBaja.length > 0 && (
        <div className="tabla-desplazable">
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
        </div>
      )}
    </>
  )
}

/** El enumerado se guarda en minúsculas; en pantalla va con mayúscula inicial. */
const etiquetaDeTipo = (tipo: string) =>
  TIPOS_DE_UNIDAD_ASIGNABLES.find((candidato) => candidato.valor === tipo)?.etiqueta ?? tipo
