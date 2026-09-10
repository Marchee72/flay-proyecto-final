import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarUsuarios, type UsuarioDelConsorcio } from '@/aplicacion/identidad/listar-usuarios'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { accionReenviar } from './acciones'

export const metadata: Metadata = { title: 'Usuarios — Flay' }

type Parametros = { consorcio?: string; invitado?: string; reenviado?: string; problema?: string }

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Parametros>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  const activo = consorcios.find((c) => c.id === parametros.consorcio) ?? consorcios[0]

  if (!activo) {
    return (
      <>
        <h1>Usuarios</h1>
        <p className="vacio">
          Todavía no tenés ningún consorcio a cargo. Pedile al administrador de la plataforma que te
          habilite en uno.
        </p>
      </>
    )
  }

  let usuarios: UsuarioDelConsorcio[] = []
  let denegado = ''

  try {
    usuarios = await listarUsuarios(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    denegado = error.mensajeParaUsuario
  }

  return (
    <>
      <h1>Usuarios</h1>
      <p className="apagado">Quiénes tienen acceso a {activo.nombre}, y con qué rol.</p>

      {consorcios.length > 1 && <SelectorDeConsorcio consorcios={consorcios} activo={activo.id} />}

      {parametros.invitado && (
        <p className="aviso aviso--atencion" role="status">
          Invitación creada. El correo con el enlace sale en el próximo pedido; abajo se ve su
          estado.
        </p>
      )}
      {parametros.reenviado && (
        <p className="aviso aviso--atencion" role="status">
          Invitación reenviada. Si vuelve a fallar, el estado lo dice acá.
        </p>
      )}
      {parametros.problema && (
        <p className="aviso aviso--problema" role="alert">
          No pudimos reenviar esa invitación.
        </p>
      )}

      {denegado ? (
        <p className="aviso aviso--problema" role="alert">
          {denegado}
        </p>
      ) : (
        <>
          <p>
            <Link
              className="boton boton--primario"
              href={`/usuarios/invitar?consorcio=${activo.id}`}
            >
              Invitar persona
            </Link>
          </p>

          <Tabla usuarios={usuarios} consorcioId={activo.id} />
        </>
      )}
    </>
  )
}

/** Cambio de consorcio activo sin guion: un formulario que navega. */
function SelectorDeConsorcio({
  consorcios,
  activo,
}: {
  consorcios: { id: string; nombre: string }[]
  activo: string
}) {
  return (
    <form method="get" className="fila-de-filtros">
      <div className="campo">
        <label htmlFor="consorcio">Consorcio</label>
        <select id="consorcio" name="consorcio" defaultValue={activo}>
          {consorcios.map((consorcio) => (
            <option key={consorcio.id} value={consorcio.id}>
              {consorcio.nombre}
            </option>
          ))}
        </select>
      </div>
      <button className="boton boton--fantasma" type="submit">
        Ver
      </button>
    </form>
  )
}

function Tabla({
  usuarios,
  consorcioId,
}: {
  usuarios: UsuarioDelConsorcio[]
  consorcioId: string
}) {
  if (usuarios.length === 0) {
    return <p className="vacio">Todavía no hay nadie habilitado en este consorcio.</p>
  }

  return (
    <div className="tabla-desplazable">
      <table>
        <caption className="ayuda">Personas con acceso a este consorcio</caption>
        <thead>
          <tr>
            <th scope="col">Persona</th>
            <th scope="col">Correo</th>
            <th scope="col">Rol</th>
            <th scope="col">Estado</th>
            <th scope="col">Invitación</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((usuario) => (
            <tr key={usuario.usuarioId}>
              <td>{usuario.nombre}</td>
              <td>{usuario.correo}</td>
              <td>{usuario.roles.join(', ')}</td>
              <td>
                {usuario.estado}
                {usuario.bloqueado && <span className="ayuda"> · bloqueado</span>}
              </td>
              <td>
                <Invitacion usuario={usuario} consorcioId={consorcioId} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * El estado del pendiente, a la vista (FR-006b). Sin esto una invitacion que
 * nunca salio se ve igual que una que el invitado todavia no abrio.
 */
function Invitacion({
  usuario,
  consorcioId,
}: {
  usuario: UsuarioDelConsorcio
  consorcioId: string
}) {
  if (usuario.estado !== 'invitado') return <span className="apagado">—</span>

  const invitacion = usuario.invitacion

  return (
    <>
      <span className="ayuda">{textoDeLaInvitacion(usuario)}</span>
      {invitacion && (
        <form action={accionReenviar}>
          <input type="hidden" name="consorcio" value={consorcioId} />
          <input type="hidden" name="trabajo" value={invitacion.trabajoId} />
          <button className="boton boton--fantasma" type="submit">
            Reenviar
          </button>
        </form>
      )}
    </>
  )
}

function textoDeLaInvitacion({ invitacion }: UsuarioDelConsorcio): string {
  if (!invitacion) return 'Sin correo en cola.'

  if (invitacion.estado === 'agotado') {
    return `No se pudo enviar en ${invitacion.intentos} intentos.`
  }

  if (invitacion.estado === 'despachado') return 'Correo enviado; todavía no la usó.'

  return invitacion.intentos === 0
    ? 'Correo en cola.'
    : `Correo en cola, ${invitacion.intentos} intento(s) fallido(s).`
}
