import { createHash } from 'node:crypto'

import { z } from 'zod'

import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { DerivadorDeContrasenas } from '@/dominio/contratos/derivador-contrasenas'
import type { RedactorActa } from '@/dominio/contratos/asistencia'
import type { ActaParaDocumento, GeneradorDeDocumentos } from '@/dominio/contratos/documentos'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { NoEncontrado } from '@/compartido/errores'
import { coeficienteParaMostrar } from '@/compartido/formato'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { notificar, type Transaccion } from '@/aplicacion/comunicacion/notificar'
import type { Manejador } from '@/aplicacion/pendientes/drenar'
import { enConsorcio, sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'

import {
  administradoresDelConsorcio,
  cargarAsamblea,
  encolarBorrador,
  horaParaMostrar,
  propietariosPorCanal,
  unidadesVigentes,
} from './comun'
import {
  ActaIncompleta,
  ActaNoEnRedaccion,
  ContrasenaIncorrecta,
  conReglas,
  FirmanteInvalido,
  FirmanteYaFirmo,
  NoDirige,
  YaFirmo,
} from './errores'
import { verAsamblea, type ConteoVista, type VistaAsamblea } from './ver'

/**
 * El acta (RF-32, FR-030 a FR-034, research R-09). Se redacta después de la
 * reunión; enviada a firmar, su contenido queda fijo con su huella SHA-256 y
 * la base no deja cambiarlo. La firmen las cuatro personas del art. 24 del
 * reglamento, cada una confirmando su contraseña: es firma electrónica (Ley
 * 25.506, art. 5). Con la última, el PDF final queda como documento del
 * consorcio, indexado para la consulta documental (RF-20).
 */

type Datos = { usuarioId: string; consorcioId: string; asambleaId: string }

export interface DependenciasActa {
  generador: Pick<GeneradorDeDocumentos, 'acta'>
  almacen: Pick<AlmacenObjetos, 'guardar' | 'resolverLecturaAutorizada'>
}

export const huella = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

async function actaDe(asambleaId: string) {
  const acta = await prisma.actaAsamblea.findFirst({
    where: { asambleaId },
    include: { firmantes: { orderBy: { creadoEn: 'asc' } } },
  })
  if (!acta) throw new NoEncontrado('RF-32')
  return acta
}

/** Quien dirigió al finalizar: queda en `dirigeId`, que ya no cambia. */
function exigioDirigio(asamblea: { dirigeId: string | null }, usuarioId: string) {
  if (asamblea.dirigeId !== usuarioId) throw new NoDirige()
}

/** Redactan la secretaría y quien dirigió. */
function exigirRedacta(
  asamblea: { dirigeId: string | null; secretarioId: string | null },
  usuarioId: string,
) {
  if (asamblea.secretarioId !== usuarioId && asamblea.dirigeId !== usuarioId) throw new NoDirige()
}

/**
 * Los apuntes de la reunión, por punto: la fuente del borrador. No van al acta.
 * Que solo cambien durante la reunión lo sostiene el disparador (`conReglas`).
 */
export async function guardarNotas(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos & { puntoId: string; notas: string },
): Promise<void> {
  await conAutorizacion(repositorio, reloj, { ...datos, accion: 'redactar el acta' }, async () => {
    const asamblea = await cargarAsamblea(datos.asambleaId)
    exigirRedacta(asamblea, datos.usuarioId)
    const { count } = await conReglas(() =>
      prisma.puntoAsamblea.updateMany({
        where: { id: datos.puntoId, asambleaId: asamblea.id },
        data: { notas: datos.notas.trim() || null },
      }),
    )
    if (count === 0) throw new NoEncontrado('RF-32')
  })
}

export async function redactarResumen(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos & { puntoId: string; resumen: string },
): Promise<void> {
  await conAutorizacion(repositorio, reloj, { ...datos, accion: 'redactar el acta' }, async () => {
    const asamblea = await cargarAsamblea(datos.asambleaId)
    exigirRedacta(asamblea, datos.usuarioId)
    const acta = await actaDe(asamblea.id)
    if (acta.estado !== 'en_redaccion') throw new ActaNoEnRedaccion()
    const { count } = await conReglas(() =>
      prisma.puntoAsamblea.updateMany({
        where: { id: datos.puntoId, asambleaId: asamblea.id },
        data: { resumen: datos.resumen.trim() || null },
      }),
    )
    if (count === 0) throw new NoEncontrado('RF-32')
  })
}

/**
 * Presidente y secretario firman por su cargo; quien dirigió elige a los dos
 * propietarios presentes con usuario (FR-031). Se reemplaza el juego entero.
 */
export async function designarFirmantes(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos & { propietarios: string[] },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, accion: 'designar firmantes' },
    async () => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      exigioDirigio(asamblea, datos.usuarioId)
      const acta = await actaDe(asamblea.id)
      if (acta.estado !== 'en_redaccion') throw new ActaNoEnRedaccion()
      if (!asamblea.presidenteId || !asamblea.secretarioId) {
        throw new FirmanteInvalido('La asamblea no tiene presidente y secretario designados.')
      }

      const propietarios = [...new Set(datos.propietarios)]
      const presentes = await prisma.unidadEnAsamblea.findMany({
        where: { asambleaId: asamblea.id, presente: true, representacion: 'propietario' },
        select: { representanteId: true },
      })
      const validos = new Set(presentes.map((p) => p.representanteId).filter(Boolean))
      if (
        propietarios.length !== 2 ||
        propietarios.some(
          (id) => !validos.has(id) || id === asamblea.presidenteId || id === asamblea.secretarioId,
        )
      ) {
        throw new FirmanteInvalido(
          'Elegí dos propietarios presentes con usuario en Flay, distintos del presidente y del secretario.',
        )
      }

      await conReglas(() =>
        prisma.$transaction(async (tx) => {
          await tx.firmanteActa.deleteMany({ where: { actaId: acta.id } })
          await tx.firmanteActa.createMany({
            data: [
              {
                actaId: acta.id,
                usuarioId: asamblea.presidenteId!,
                rolEnActa: 'presidente' as const,
              },
              {
                actaId: acta.id,
                usuarioId: asamblea.secretarioId!,
                rolEnActa: 'secretario' as const,
              },
              ...propietarios.map((usuarioId) => ({
                actaId: acta.id,
                usuarioId,
                rolEnActa: 'propietario' as const,
              })),
            ].map(sinConsorcio),
          })
        }),
      )
    },
  )
}

const ETIQUETA_SENTIDO: Record<string, string> = {
  positivo: 'Positivo',
  negativo: 'Negativo',
  abstencion: 'Abstención',
}
const ETIQUETA_MAYORIA: Record<string, string> = {
  absoluta: 'mayoría absoluta',
  dos_tercios: 'dos tercios',
  unanimidad: 'unanimidad',
}
const ETIQUETA_RESULTADO: Record<string, string> = {
  aprobado: 'aprobado',
  rechazado: 'rechazado',
  sin_decision: 'sin decisión',
}
const ETIQUETA_ROL: Record<string, string> = {
  presidente: 'Presidente',
  secretario: 'Secretario/a',
  propietario: 'Propietario/a',
}

type PuntoConOpciones = {
  modalidad: 'binaria' | 'opcion_multiple'
  opciones: { id: string; texto: string }[]
}

const clavesDelPunto = (p: PuntoConOpciones) =>
  p.modalidad === 'binaria'
    ? ['positivo', 'negativo', 'abstencion'].map((k) => ({ k, texto: ETIQUETA_SENTIDO[k] }))
    : p.opciones.map((o) => ({ k: o.id, texto: o.texto }))

const resultadoEnTexto = (p: {
  modalidad: PuntoConOpciones['modalidad']
  resultado: string | null
  opcionGanadora: string | null
}) =>
  p.modalidad === 'opcion_multiple' && p.opcionGanadora
    ? `aprobada la opción «${p.opcionGanadora}»`
    : ETIQUETA_RESULTADO[p.resultado ?? 'sin_decision']

/** Todo como cadena, ya formateado: el generador no calcula (Principio II). */
async function paraDocumento(
  vista: VistaAsamblea,
  consorcioId: string,
): Promise<ActaParaDocumento> {
  const consorcio = await prismaBase.consorcio.findUniqueOrThrow({
    where: { id: consorcioId },
    select: { nombre: true, direccion: true, localidad: true },
  })
  return {
    consorcio,
    titulo: vista.titulo,
    tipo: vista.tipo === 'ordinaria' ? 'Ordinaria' : 'Extraordinaria',
    fecha: horaParaMostrar(new Date(vista.fechaHora)),
    lugar: vista.lugar,
    convocatoria: vista.convocatoriaQueRige === 'segunda' ? 'segunda' : 'primera',
    presidente: vista.presidente?.nombre ?? '',
    secretario: vista.secretario?.nombre ?? '',
    quorum: `${coeficienteParaMostrar(vista.quorum.coeficientePresente)} %`,
    asistencia: vista.padron.map((u) => ({
      designacion: u.designacion,
      coeficiente: coeficienteParaMostrar(u.coeficiente),
      estado: !u.presente ? 'Ausente' : u.sinVoto ? 'Presente, sin voto' : 'Presente',
      representante: u.presente
        ? `${u.representante ?? ''}${u.representacion === 'apoderado' ? ' (apoderado)' : ''}`
        : '—',
    })),
    puntos: vista.puntos.map((p) => {
      const claves = clavesDelPunto(p)
      const estado =
        p.resultado !== 'aprobado'
          ? ''
          : p.provisorio
            ? `Decisión provisoria (CCyC art. 2060): se notifica a los ausentes, que pueden oponerse hasta el ${horaParaMostrar(new Date(p.vencePlazoOposicion!))}.`
            : 'Decisión firme.'
      return {
        orden: p.orden,
        titulo: p.titulo,
        descripcion: p.descripcion,
        modalidad:
          p.modalidad === 'binaria'
            ? `Votación positivo/negativo/abstención, requiere ${ETIQUETA_MAYORIA[p.mayoria ?? 'absoluta']} por unidades y por coeficientes.`
            : 'Votación entre opciones: gana la más votada por unidades y por coeficientes.',
        resumen: p.resumen ?? '',
        votos: p.votos.map((v) => ({
          designacion: v.designacion,
          eleccion: `${v.eleccion}${v.cargaManual ? ' (cargado por quien dirigió)' : ''}`,
        })),
        conteo: claves.map(({ k, texto }) => ({
          opcion: texto,
          unidades: String(p.conteo?.porOpcion[k]?.unidades ?? 0),
          coeficiente: `${coeficienteParaMostrar(p.conteo?.porOpcion[k]?.coeficiente ?? '0')} %`,
        })),
        resultado: resultadoEnTexto(p),
        estado,
      }
    }),
  }
}

/**
 * El borrador del acta (RF-32, RN-14). Corre en la cola, con el redactor que
 * eligió el punto de composición. Escribe `borradorResumen` y nunca `resumen`:
 * enviar a firmar exige este último, así que a las firmas solo llega lo que una
 * persona guardó. Sin servicio no hay borrador y se redacta a mano (RNF-14).
 */
const CARGA_BORRADOR = z.object({ actaId: z.string().uuid() })

export function manejadorBorradorActa(redactor: RedactorActa): Manejador {
  return async (carga) => {
    const { actaId } = CARGA_BORRADOR.parse(carga)
    // Fuera de todo contexto de aislamiento: la cola no tiene consorcio activo.
    const acta = await prismaBase.actaAsamblea.findUnique({
      where: { id: actaId },
      include: { asamblea: { select: { titulo: true, tipo: true } } },
    })
    if (!acta || acta.estado !== 'en_redaccion') return

    await enConsorcio(acta.consorcioId, async () => {
      const puntos = await prisma.puntoAsamblea.findMany({
        where: { asambleaId: acta.asambleaId },
        include: { opciones: { select: { id: true, texto: true } } },
        orderBy: { orden: 'asc' },
      })
      const observaciones = await prisma.observacionAsamblea.findMany({
        where: { asambleaId: acta.asambleaId, texto: { not: '' } },
        orderBy: { creadoEn: 'asc' },
        select: { texto: true },
      })
      // Agregados y textos sueltos: al proveedor no le llegan personas, unidades ni votos.
      const resultado = await redactor.redactar(
        acta.asamblea,
        puntos.map((p) => {
          const conteo = p.conteo as unknown as ConteoVista | null
          const presentesConVoto = conteo?.basePresentes.unidades ?? 0
          const votaron = Object.values(conteo?.porOpcion ?? {}).reduce(
            (total, c) => total + c.unidades,
            0,
          )
          return {
            orden: p.orden,
            titulo: p.titulo,
            descripcion: p.descripcion,
            resultado: resultadoEnTexto({
              ...p,
              opcionGanadora: p.opciones.find((o) => o.id === p.opcionGanadoraId)?.texto ?? null,
            }),
            conteo: clavesDelPunto(p).map(({ k, texto }) => ({
              opcion: texto,
              unidades: conteo?.porOpcion[k]?.unidades ?? 0,
              coeficiente: `${coeficienteParaMostrar(conteo?.porOpcion[k]?.coeficiente ?? '0')} %`,
            })),
            presentesConVoto,
            noVotaron: Math.max(0, presentesConVoto - votaron),
            provisorio: p.provisorio,
            notas: p.notas,
          }
        }),
        observaciones.map((o) => o.texto),
      )
      if (resultado.disponible) {
        for (const { orden, resumen } of resultado.valor) {
          await prisma.puntoAsamblea.updateMany({
            where: { asambleaId: acta.asambleaId, orden },
            data: { borradorResumen: resumen.trim() || null },
          })
        }
      }
      await prisma.actaAsamblea.update({
        where: { id: actaId },
        data: { borradorPedidoEn: null },
      })
    })
  }
}

/** Reintento a mano: el servicio no estaba, o el borrador no llegó. */
export async function pedirBorrador(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos,
): Promise<void> {
  await conAutorizacion(repositorio, reloj, { ...datos, accion: 'redactar el acta' }, async () => {
    const asamblea = await cargarAsamblea(datos.asambleaId)
    exigirRedacta(asamblea, datos.usuarioId)
    const acta = await actaDe(asamblea.id)
    if (acta.estado !== 'en_redaccion') throw new ActaNoEnRedaccion()
    await prisma.$transaction(async (tx) => {
      await tx.actaAsamblea.update({
        where: { id: acta.id },
        data: { borradorPedidoEn: reloj.ahora() },
      })
      await encolarBorrador(tx, acta.id)
    })
  })
}

const claveActa = (consorcioId: string, asambleaId: string, cual: 'contenido' | 'firmada') =>
  `documentos/${consorcioId}/actas/${asambleaId}-${cual}.pdf`

export async function enviarAFirmar(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  dependencias: DependenciasActa,
  datos: Datos,
): Promise<{ hashContenido: string }> {
  return conAutorizacion(
    repositorio,
    reloj,
    { ...datos, accion: 'enviar el acta a firmar' },
    async () => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      exigioDirigio(asamblea, datos.usuarioId)
      const acta = await actaDe(asamblea.id)
      if (acta.estado !== 'en_redaccion') throw new ActaNoEnRedaccion()
      if (acta.firmantes.length !== 4) {
        throw new ActaIncompleta(
          'Antes de enviar a firmar, designá a los dos propietarios que firman.',
        )
      }
      const sinResumen = await prisma.puntoAsamblea.count({
        where: { asambleaId: asamblea.id, OR: [{ resumen: null }, { resumen: '' }] },
      })
      if (sinResumen > 0) {
        throw new ActaIncompleta(
          `Faltan ${sinResumen === 1 ? 'el resumen de un punto' : `los resúmenes de ${sinResumen} puntos`} del orden del día.`,
        )
      }

      const vista = await verAsamblea(repositorio, reloj, datos)
      const bytes = await dependencias.generador.acta(await paraDocumento(vista, datos.consorcioId))
      const hashContenido = huella(bytes)
      const clave = claveActa(datos.consorcioId, asamblea.id, 'contenido')
      await dependencias.almacen.guardar(clave, bytes, 'application/pdf')

      await conReglas(() =>
        prisma.$transaction(async (tx) => {
          await tx.actaAsamblea.update({
            where: { id: acta.id },
            data: {
              estado: 'a_firmar',
              claveContenido: clave,
              hashContenido,
              enviadaAFirmarEn: reloj.ahora(),
            },
          })
          await avisarFirma(
            tx,
            asamblea,
            acta.firmantes.map((f) => f.usuarioId),
          )
        }),
      )
      return { hashContenido }
    },
  )
}

async function avisarFirma(
  tx: Transaccion,
  asamblea: { id: string; titulo: string },
  usuarios: string[],
) {
  await notificar(
    tx,
    usuarios.map((usuarioId) => ({
      usuarioId,
      tipo: 'acta_a_firmar' as const,
      titulo: `Acta para firmar: ${asamblea.titulo}`,
      cuerpo:
        'El acta de la asamblea está lista. Revisala y firmala desde Flay en los próximos 10 días (art. 24 del reglamento).',
      entidadTipo: 'asamblea',
      entidadId: asamblea.id,
    })),
  )
}

/**
 * Firma electrónica (FR-032): el firmante designado confirma su contraseña.
 * Con la última firma se arma el PDF final con la hoja de firmas y se publica
 * como documento del consorcio, en la misma transacción (FR-033).
 */
export async function firmar(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  dependencias: DependenciasActa & { derivador: DerivadorDeContrasenas },
  datos: Datos & { contrasena: string },
): Promise<{ completa: boolean }> {
  return conAutorizacion(repositorio, reloj, { ...datos, accion: 'firmar el acta' }, async () => {
    const asamblea = await cargarAsamblea(datos.asambleaId)
    const acta = await actaDe(asamblea.id)
    const mio = acta.firmantes.find((f) => f.usuarioId === datos.usuarioId)
    if (acta.estado !== 'a_firmar' || !mio) throw new NoEncontrado('RF-32')
    if (mio.firmadoEn) throw new YaFirmo()

    const usuario = await prismaBase.usuario.findUniqueOrThrow({
      where: { id: datos.usuarioId },
      select: { claveDerivada: true },
    })
    const valida =
      !!usuario.claveDerivada &&
      (await dependencias.derivador.verificar(datos.contrasena, usuario.claveDerivada))
    if (!valida) throw new ContrasenaIncorrecta()

    const ahora = reloj.ahora()
    const faltan = acta.firmantes.filter((f) => !f.firmadoEn && f.id !== mio.id)
    if (faltan.length > 0) {
      await conReglas(() =>
        prisma.firmanteActa.update({
          where: { id: mio.id },
          data: { firmadoEn: ahora, hashFirmado: acta.hashContenido },
        }),
      )
      return { completa: false }
    }

    // Última firma: PDF final con la hoja de firmas.
    const vista = await verAsamblea(repositorio, reloj, datos)
    const nombres = new Map(vista.acta!.firmantes.map((f) => [f.id, f.nombre]))
    const documento = await paraDocumento(vista, datos.consorcioId)
    documento.hojaDeFirmas = {
      huellaContenido: acta.hashContenido!,
      firmas: acta.firmantes.map((f) => ({
        nombre: nombres.get(f.id) ?? '',
        rol: ETIQUETA_ROL[f.rolEnActa],
        momento: horaParaMostrar(f.id === mio.id ? ahora : f.firmadoEn!),
      })),
    }
    const bytes = await dependencias.generador.acta(documento)
    const clave = claveActa(datos.consorcioId, asamblea.id, 'firmada')
    await dependencias.almacen.guardar(clave, bytes, 'application/pdf')

    const destinatarios = await propietariosPorCanal(await unidadesVigentes(), reloj.hoy())
    await conReglas(() =>
      prisma.$transaction(async (tx) => {
        await tx.firmanteActa.update({
          where: { id: mio.id },
          data: { firmadoEn: ahora, hashFirmado: acta.hashContenido },
        })
        const doc = await tx.documentoConsorcio.create({
          data: sinConsorcio({
            tipo: 'acta',
            titulo: `Acta — ${asamblea.titulo}`.slice(0, 200),
            claveAlmacenamiento: clave,
            tipoContenido: 'application/pdf',
            hashSha256: huella(bytes),
            fechaDocumento: asamblea.fechaHora,
            visibleConsorcistas: true,
            cargadoPor: datos.usuarioId,
          }),
          select: { id: true },
        })
        await tx.$executeRaw`
          INSERT INTO "TrabajoPendiente" (tipo, carga)
          VALUES ('indexar_documento'::"TipoTrabajo", jsonb_build_object('documentoId', ${doc.id}::text))`
        await tx.actaAsamblea.update({
          where: { id: acta.id },
          data: { estado: 'firmada', documentoId: doc.id },
        })
        await tx.asamblea.update({ where: { id: asamblea.id }, data: { estado: 'acta_firmada' } })
        const administracion = await administradoresDelConsorcio(tx)
        await notificar(
          tx,
          [...new Set([...destinatarios.conUsuario, ...administracion])].map((usuarioId) => ({
            usuarioId,
            tipo: 'acta_firmada' as const,
            titulo: `Acta firmada: ${asamblea.titulo}`,
            cuerpo:
              'El acta de la asamblea quedó firmada y está en la documentación del consorcio.',
            entidadTipo: 'asamblea',
            entidadId: asamblea.id,
          })),
        )
      }),
    )
    return { completa: true }
  })
}

/** Un firmante pendiente que perdió su usuario se reemplaza, en el mismo rol (caso borde). */
export async function reemplazarFirmante(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos & { firmanteId: string; nuevoUsuarioId: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, accion: 'reemplazar firmantes' },
    async () => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      exigioDirigio(asamblea, datos.usuarioId)
      const acta = await actaDe(asamblea.id)
      if (acta.estado !== 'a_firmar') throw new FirmanteInvalido('El acta no está a firmar.')
      const firmante = acta.firmantes.find((f) => f.id === datos.firmanteId)
      if (!firmante) throw new NoEncontrado('RF-32')
      if (firmante.firmadoEn) throw new FirmanteYaFirmo()

      const presentes = await prisma.unidadEnAsamblea.findMany({
        where: { asambleaId: asamblea.id, presente: true },
        select: { representanteId: true },
      })
      const validos = new Set(presentes.map((p) => p.representanteId).filter(Boolean))
      if (
        !validos.has(datos.nuevoUsuarioId) ||
        acta.firmantes.some((f) => f.usuarioId === datos.nuevoUsuarioId)
      ) {
        throw new FirmanteInvalido(
          'El reemplazo tiene que ser un presente con usuario que no firme ya el acta.',
        )
      }

      await conReglas(
        () =>
          prisma.$transaction(async (tx) => {
            await tx.firmanteActa.update({
              where: { id: firmante.id },
              data: { usuarioId: datos.nuevoUsuarioId, reemplazaA: firmante.usuarioId },
            })
            await avisarFirma(tx, asamblea, [datos.nuevoUsuarioId])
          }),
        () => new FirmanteYaFirmo(),
      )
    },
  )
}

async function bajar(direccion: string): Promise<Uint8Array> {
  const respuesta = await fetch(direccion)
  if (!respuesta.ok) throw new Error(`No se pudo leer el acta guardada (${respuesta.status}).`)
  return new Uint8Array(await respuesta.arrayBuffer())
}

/**
 * Recalcula la huella de los PDF guardados (SC-007): cualquier alteración
 * posterior a la firma se detecta acá.
 */
export async function verificarHuella(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  almacen: Pick<AlmacenObjetos, 'resolverLecturaAutorizada'>,
  datos: Datos,
): Promise<{ contenido: boolean | null; final: boolean | null }> {
  return conAutorizacion(repositorio, reloj, { ...datos, accion: 'ver el acta' }, async () => {
    const asamblea = await cargarAsamblea(datos.asambleaId)
    const acta = await actaDe(asamblea.id)
    const contenido =
      acta.claveContenido && acta.hashContenido
        ? huella(await bajar(await almacen.resolverLecturaAutorizada(acta.claveContenido, 120))) ===
          acta.hashContenido
        : null
    let final: boolean | null = null
    if (acta.documentoId) {
      const doc = await prisma.documentoConsorcio.findFirst({
        where: { id: acta.documentoId },
        select: { claveAlmacenamiento: true, hashSha256: true },
      })
      if (doc?.hashSha256) {
        final =
          huella(
            await bajar(await almacen.resolverLecturaAutorizada(doc.claveAlmacenamiento, 120)),
          ) === doc.hashSha256
      }
    }
    return { contenido, final }
  })
}

/** Enlace de descarga del acta: la firmada si existe, si no la enviada a firmar. */
export async function enlaceDelActa(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  almacen: Pick<AlmacenObjetos, 'resolverLecturaAutorizada'>,
  datos: Datos,
): Promise<string | null> {
  return conAutorizacion(repositorio, reloj, { ...datos, accion: 'ver el acta' }, async () => {
    const asamblea = await cargarAsamblea(datos.asambleaId)
    const acta = await actaDe(asamblea.id)
    const clave = acta.documentoId
      ? claveActa(datos.consorcioId, asamblea.id, 'firmada')
      : acta.claveContenido
    return clave ? almacen.resolverLecturaAutorizada(clave, 600) : null
  })
}
