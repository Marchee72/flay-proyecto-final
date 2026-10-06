import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type {
  Asistencia,
  ContextoAgente,
  Sugerencia,
  TurnoConversacion,
} from '@/dominio/contratos/asistencia'
import type { Rol } from '@/dominio/identidad/rol'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import {
  type ContextoHerramienta,
  type Herramienta,
  type ResultadoHerramienta,
  herramientaPorNombre,
  herramientasPara,
  parametrosParaModelo,
} from '@/aplicacion/asistente/herramientas'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'

/**
 * El orquestador del asistente (RF-27, CU-16). Entiende el pedido con el agente,
 * enruta a las herramientas (= casos de uso) y decide:
 *  - lectura: ejecuta, le devuelve al modelo lo mismo que ve la interfaz (sin
 *    enlaces firmados) y guarda el dato para la UI; vuelve a preguntar al modelo
 *    (tope de saltos);
 *  - escritura: NO ejecuta; guarda una propuesta pendiente y la devuelve como
 *    tarjeta para confirmar (Principio IV);
 *  - responder: texto, con los enlaces a las pantallas de donde salen los datos.
 *
 * El modelo no es la frontera de seguridad: la autorizacion la hace cada caso de
 * uso. Aca solo se decide que herramientas ofrecer por rol.
 */

const MAX_SALTOS = 4 // ponytail: tope fijo; subir si una consulta real necesita encadenar mas

/** Referencia a la pantalla que tiene los datos; la ruta la arma la presentacion. */
export type EnlaceDeDatos = {
  herramienta: string
  consorcioId: string
  argumentos: Record<string, unknown>
}

export type RespuestaDelAsistente =
  | {
      modo: 'respuesta'
      conversacionId: string
      texto: string
      enlaces: EnlaceDeDatos[]
      citas?: unknown[]
    }
  | { modo: 'propuesta'; conversacionId: string; propuestaId: string; resumen: string }
  | { modo: 'degradado'; conversacionId: string; motivo: string }

/**
 * Lo que viaja del servidor al chat mientras se arma la respuesta. Vive aca y no
 * en el dominio porque lo comparten la ruta de API y el componente cliente, y
 * presentacion no importa dominio (§ 12.1.2).
 */
export type EventoAsistente =
  | { t: 'pensando' }
  | { t: 'herramienta'; nombre: string }
  | { t: 'texto'; fragmento: string }
  /** Lo emitido hasta ahora no era la respuesta: el modelo termino invocando una herramienta. */
  | { t: 'descartar' }
  | { t: 'sugerencias'; sugerencias: Sugerencia[] }
  | { t: 'fin'; respuesta: RespuestaDelAsistente }
  | { t: 'error'; mensaje: string }

const MAX_SUGERENCIAS = 3

const rolTextoDe = (roles: readonly string[]): string =>
  roles.includes('administrador')
    ? 'administrador'
    : roles.includes('consejo')
      ? 'consejo de propietarios'
      : 'consorcista'

const hoyEnArgentina = (hoy: Date): string =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'full',
  }).format(hoy)

/**
 * Corre una lectura sobre varios consorcios, cada una con su contexto y su
 * autorizacion. De mejor esfuerzo: el que falla queda como `error` y no tumba
 * a los demas (como `publicar_novedad_cartera`).
 */
async function ejecutarEnAbanico(
  tool: Herramienta,
  args: unknown,
  ctx: ContextoHerramienta,
  destinos: { id: string; nombre: string; roles: readonly Rol[] }[],
): Promise<ResultadoHerramienta> {
  const corridas = await Promise.all(
    destinos.map(async (d) => {
      try {
        return { d, r: await tool.ejecutar!(args, { ...ctx, consorcioId: d.id, roles: d.roles }) }
      } catch {
        return { d, r: null }
      }
    }),
  )
  const fundir = (campo: 'paraModelo' | 'paraUI') =>
    corridas.map(({ d, r }) =>
      r
        ? { consorcio: d.nombre, datos: r[campo] }
        : { consorcio: d.nombre, error: 'No se pudo consultar este consorcio.' },
    )
  const terminales = corridas.filter((c) => c.r?.terminal)
  return {
    paraModelo: fundir('paraModelo'),
    paraUI: fundir('paraUI'),
    ...(terminales.length
      ? {
          terminal: true,
          textoUI: terminales.map((c) => `${c.d.nombre}: ${c.r!.textoUI ?? ''}`).join('\n'),
          citas: terminales.flatMap((c) => c.r!.citas ?? []),
        }
      : {}),
  }
}

export async function conversar(
  asistencia: Asistencia,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  almacen: AlmacenObjetos,
  datos: {
    usuarioId: string
    /** El consorcio activo; en cartera es el ancla de la conversacion, no el alcance. */
    consorcioId: string
    conversacionId?: string
    texto: string
    /** Todos los consorcios: lecturas y el aviso a la cartera, ninguna otra escritura. */
    cartera?: boolean
  },
  emitir?: (evento: EventoAsistente) => void,
): Promise<RespuestaDelAsistente> {
  // Se piden despues de `fin`: nunca demoran la respuesta, y si fallan no se nota.
  let despues: (() => Promise<void>) | undefined
  const respuesta = await conAutorizacion<RespuestaDelAsistente>(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'usar el asistente' },
    async (acceso) => {
      // 1) Hilo del usuario (aislado por consorcio). findFirst, no findUnique.
      const previa = datos.conversacionId
        ? await prisma.conversacionAsistente.findFirst({
            where: { id: datos.conversacionId, usuarioId: datos.usuarioId },
            // Los ultimos 20 turnos, no los primeros: en un hilo largo el modelo
            // tiene que ver lo reciente. Se invierten abajo para el historial.
            include: { mensajes: { orderBy: { creadoEn: 'desc' }, take: 20 } },
          })
        : null
      previa?.mensajes.reverse()
      const conversacionId =
        previa?.id ??
        (
          await prisma.conversacionAsistente.create({
            data: sinConsorcio({ usuarioId: datos.usuarioId }),
            select: { id: true },
          })
        ).id

      // 2) Historial para el modelo + turno del usuario (persistido).
      const historial: TurnoConversacion[] = (previa?.mensajes ?? []).map((m) =>
        m.rol === 'herramienta'
          ? {
              rol: 'herramienta',
              nombre: (m.herramienta as { nombre?: string } | null)?.nombre ?? '',
              resultado: m.contenido,
            }
          : { rol: m.rol as 'usuario' | 'asistente', texto: m.contenido },
      )
      await prisma.mensajeAsistente.create({
        data: { conversacionId, rol: 'usuario', contenido: datos.texto },
      })
      historial.push({ rol: 'usuario', texto: datos.texto })

      // 3) Herramientas ofrecidas por rol (solo UX; el caso de uso reautoriza). En
      // cartera el rol es la union de los de cada consorcio: el ancla es solo desde donde se abrio.
      const alcance = datos.cartera ? await misConsorcios(repositorio, reloj, datos.usuarioId) : []
      const rolesPorConsorcio = new Map<string, readonly Rol[]>()
      if (datos.cartera) {
        const accesos = await Promise.all(
          alcance.map((c) => repositorio.accesoVigente(datos.usuarioId, c.id, reloj.hoy())),
        )
        alcance.forEach((c, i) => {
          const roles = accesos[i]?.roles
          if (roles) rolesPorConsorcio.set(c.id, roles)
        })
      }
      const rolesOferta: readonly Rol[] = datos.cartera
        ? [...new Set([...rolesPorConsorcio.values()].flat())]
        : acceso.roles
      const ofrecidas = herramientasPara(rolesOferta, datos.cartera)
      const disponibles = ofrecidas.map((h) => ({
        nombre: h.nombre,
        descripcion: h.descripcion,
        parametros: parametrosParaModelo(h, datos.cartera),
      }))
      const ctx: ContextoHerramienta = {
        repositorio,
        reloj,
        almacen,
        asistencia,
        usuarioId: datos.usuarioId,
        consorcioId: datos.consorcioId,
        roles: acceso.roles,
      }
      const contexto: ContextoAgente = {
        hoy: hoyEnArgentina(reloj.hoy()),
        rolTexto: rolTextoDe(rolesOferta),
        consorcios: datos.cartera ? alcance.map(({ id, nombre }) => ({ id, nombre })) : undefined,
      }
      const enlaces: EnlaceDeDatos[] = []

      const responder = async (
        texto: string,
        citas?: unknown[],
      ): Promise<RespuestaDelAsistente> => {
        await prisma.mensajeAsistente.create({
          data: { conversacionId, rol: 'asistente', contenido: texto },
        })
        return { modo: 'respuesta', conversacionId, texto, enlaces, citas }
      }

      const sugerirDespues = (texto: string) => {
        despues = async () => {
          const r = await asistencia.agente.sugerir(
            contexto,
            [...historial, { rol: 'asistente', texto }],
            disponibles,
          )
          if (!r.disponible) return
          // La pastilla manda `pedido` como un turno de usuario mas: no ejecuta nada, y
          // la que pide una herramienta fuera de lo ofrecido se descarta aca.
          const ofrecidasPorNombre = new Set(ofrecidas.map((h) => h.nombre))
          const sugerencias = r.valor
            .filter((x) => !x.herramienta || ofrecidasPorNombre.has(x.herramienta))
            .slice(0, MAX_SUGERENCIAS)
          if (sugerencias.length) emitir?.({ t: 'sugerencias', sugerencias })
        }
      }

      // 4) Bucle acotado: lectura -> volver a preguntar; escritura -> propuesta; responder -> fin.
      for (let salto = 0; salto < MAX_SALTOS; salto++) {
        emitir?.({ t: 'pensando' })
        let salioTexto = false
        const accion = await asistencia.agente.conversar(
          contexto,
          historial,
          disponibles,
          (fragmento) => {
            salioTexto = true
            emitir?.({ t: 'texto', fragmento })
          },
        )
        if (!accion.disponible) return { modo: 'degradado', conversacionId, motivo: accion.motivo }
        const a = accion.valor

        if (a.tipo === 'responder') {
          sugerirDespues(a.texto)
          return responder(a.texto)
        }
        if (salioTexto) emitir?.({ t: 'descartar' })

        const tool = herramientaPorNombre(a.nombre)
        if (!tool || !ofrecidas.includes(tool)) {
          return responder('No puedo hacer eso desde el asistente.')
        }

        // Otro consorcio dentro del alcance del usuario (FR-011): se valida contra
        // `misConsorcios` y el caso de uso vuelve a autorizar sobre el destino.
        const { consorcioId: pedido, ...resto } = a.argumentos as { consorcioId?: unknown }
        let destino = datos.consorcioId
        let rolesDestino: readonly Rol[] = acceso.roles
        // En cartera, una lectura sin consorcio nombrado se abre en abanico: una corrida
        // por cada consorcio donde el rol alcanza, y el cruce lo hace el modelo.
        const nombrado = typeof pedido === 'string' && pedido
        const abanico = datos.cartera && !tool.sinConsorcio && !tool.escritura && !nombrado
        const destinos = abanico
          ? alcance
              .filter((c) => {
                const roles = rolesPorConsorcio.get(c.id) ?? []
                return tool.roles === 'todos' || roles.some((rol) => tool.roles.includes(rol))
              })
              .map((c) => ({ ...c, roles: rolesPorConsorcio.get(c.id) ?? [] }))
          : []
        if (abanico && destinos.length === 0) {
          return responder('No tenés acceso a ese dato en ninguno de tus consorcios.')
        }
        if (abanico && destinos.length === 1) {
          destino = destinos[0]!.id
          rolesDestino = destinos[0]!.roles
        }
        if (
          typeof pedido === 'string' &&
          pedido &&
          pedido !== datos.consorcioId &&
          !tool.sinConsorcio
        ) {
          const alcance = await misConsorcios(repositorio, reloj, datos.usuarioId)
          const otro = await repositorio.accesoVigente(datos.usuarioId, pedido, reloj.hoy())
          if (!otro || !alcance.some((c) => c.id === pedido)) {
            return responder('No encontré ese consorcio entre los que podés ver.')
          }
          destino = pedido
          rolesDestino = otro.roles
        }
        // Una escritura de un solo consorcio, en cartera, nunca se asume ni se difunde: se pregunta cual.
        if (datos.cartera && tool.escritura && !tool.sinConsorcio && !nombrado) {
          return responder(
            `¿Sobre qué consorcio querés que lo haga? Tenés: ${alcance.map((c) => c.nombre).join(', ')}.`,
          )
        }
        const ctxTool: ContextoHerramienta = { ...ctx, consorcioId: destino, roles: rolesDestino }

        let args: unknown
        try {
          args = tool.validar.parse(resto)
        } catch {
          return responder('Me falta algún dato para eso. ¿Me lo pasás con un poco más de detalle?')
        }

        if (tool.escritura) {
          const resumenBase = await tool.resumir!(args, ctxTool)
          // En cartera la tarjeta dice sobre cual consorcio se va a escribir.
          const nombreDestino =
            datos.cartera && !tool.sinConsorcio
              ? alcance.find((c) => c.id === destino)?.nombre
              : undefined
          const resumen = nombreDestino ? `En ${nombreDestino}: ${resumenBase}` : resumenBase
          const propuesta = await prisma.mensajeAsistente.create({
            data: {
              conversacionId,
              rol: 'asistente',
              contenido: resumen,
              propuesta: { herramienta: tool.nombre, argumentos: args, consorcioId: destino },
              estadoPropuesta: 'pendiente',
            },
            select: { id: true },
          })
          return { modo: 'propuesta', conversacionId, propuestaId: propuesta.id, resumen }
        }

        // Lectura.
        emitir?.({ t: 'herramienta', nombre: tool.nombre })
        // ponytail: el payload hacia el modelo crece con la cantidad de consorcios; acotar por herramienta si molesta.
        const objetivos = destinos.length > 1 ? destinos : null
        const res = objetivos
          ? await ejecutarEnAbanico(tool, args, ctx, objetivos)
          : await tool.ejecutar!(args, ctxTool)
        for (const d of objetivos ?? [{ id: destino }]) {
          const enlace: EnlaceDeDatos = {
            herramienta: tool.nombre,
            consorcioId: d.id,
            argumentos: args as Record<string, unknown>,
          }
          if (!enlaces.some((e) => JSON.stringify(e) === JSON.stringify(enlace)))
            enlaces.push(enlace)
        }
        const resultadoModelo = JSON.stringify(res.paraModelo)
        await prisma.mensajeAsistente.create({
          data: {
            conversacionId,
            rol: 'herramienta',
            contenido: resultadoModelo,
            herramienta: { nombre: tool.nombre, resultado: res.paraModelo },
          },
        })
        if (res.terminal) return responder(res.textoUI ?? '', res.citas)
        historial.push({ rol: 'herramienta', nombre: tool.nombre, resultado: resultadoModelo })
      }

      return responder('No pude terminar de resolverlo. ¿Querés darme un poco más de detalle?')
    },
  )
  emitir?.({ t: 'fin', respuesta })
  await despues?.()
  return respuesta
}
