import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Users, UserPlus } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarUsuarios, type UsuarioDelConsorcio } from '@/aplicacion/identidad/listar-usuarios'
import { ROLES_ASIGNABLES } from '@/aplicacion/identidad/roles'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { accionReenviar } from './acciones'
import { ModalInvitar } from './modal-invitar'
import { EncabezadoDeConsorcio } from '../encabezado-consorcio'
import { AvisoConsorcioNoElegido, SelectorDeConsorcio } from '../selector-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../consorcio-activo'

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

  if (consorcios.length === 0) {
    return (
      <>
        <h1>Usuarios</h1>
        <p className="vacio">
          Todavía no hay ningún consorcio a cargo. Pedir al administrador de la plataforma la
          habilitación en uno.
        </p>
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
        <h1>Usuarios</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base="/usuarios"
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
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
      <EncabezadoDeConsorcio
        nombre={activo.nombre}
        volverHref="/consorcios"
        volverTexto="Volver a consorcios"
      />
      <h1>Usuarios</h1>
      <p className="apagado">Quiénes tienen acceso y con qué rol.</p>

      {consorcios.length > 1 && (
        <SelectorDeConsorcio
          consorcios={consorcios}
          activoId={activo.id}
          id="consorcio"
          mostrarEtiqueta
        />
      )}

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
            <ModalInvitar
              consorcioId={activo.id}
              roles={ROLES_ASIGNABLES}
              hoy={RELOJ.hoy().toISOString().slice(0, 10)}
            />
          </p>

          <Tabla usuarios={usuarios} consorcioId={activo.id} />
        </>
      )}
    </>
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
    return (
      <div className="vacio">
        <Users aria-hidden="true" />
        <p>Todavía no hay nadie habilitado en este consorcio.</p>
        <p>
          <Link
            className="boton boton--primario"
            href={`/usuarios/invitar?consorcio=${consorcioId}`}
          >
            <UserPlus className="icono" aria-hidden="true" />
            Invitar persona
          </Link>
        </p>
      </div>
    )
  }
  return (
    <div
      className="tabla-desplazable"
      tabIndex={0}
      role="region"
      aria-label="Personas con acceso a este consorcio"
    >
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
              <td>{usuario.roles.map((rol) => ETIQUETA_ROL[rol] ?? rol).join(', ')}</td>
              <td>
                <EstadoDelUsuario estado={usuario.estado} bloqueado={usuario.bloqueado} />
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

/**
 * La base guarda `administrador`/`consejo`/`consorcista` e
 * `invitado`/`activo`/`suspendido` en minúsculas; en pantalla van con
 * mayúscula inicial y el estado con `.etiqueta` (guía §3.4: color + palabra,
 * nunca color solo). Solo presentación: no cambia roles ni estados.
 */
const ETIQUETA_ROL: Record<string, string> = {
  administrador: 'Administrador',
  consejo: 'Consejo',
  consorcista: 'Consorcista',
}

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
  invitado: { texto: 'Invitado', clase: 'etiqueta--pendiente' },
  activo: { texto: 'Activo', clase: 'etiqueta--rendido' },
  suspendido: { texto: 'Suspendido', clase: 'etiqueta--vencido' },
}

function EstadoDelUsuario({ estado, bloqueado }: { estado: string; bloqueado: boolean }) {
  const etiqueta = ETIQUETA_ESTADO[estado] ?? { texto: estado, clase: 'etiqueta--pendiente' }

  return (
    <>
      <span className={`etiqueta ${etiqueta.clase}`}>{etiqueta.texto}</span>
      {bloqueado && <span className="etiqueta etiqueta--vencido">Bloqueado</span>}
    </>
  )
}
