import type { Asamblea, Prisma } from '@prisma/client'

import { Decimal } from '@/compartido/dinero'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { transicionAsamblea, transicionPunto } from '@/dominio/asambleas/estado'
import { puedeConstituir, segundaConvocatoria } from '@/dominio/asambleas/quorum'
import { resultadoBinario, resultadoOpcionMultiple } from '@/dominio/asambleas/resultado'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { saldoImpagoPorUnidad } from '@/aplicacion/pagos/estado-de-cuenta'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'
import { propietariosVigentesDe } from '@/infraestructura/repositorios/ocupaciones'

import {
  avisarPorLosDosCanales,
  cargarAsamblea,
  encolarBorrador,
  DIA_MS,
  exigirDirige,
  exigirPuedeDirigir,
  horaParaMostrar,
  repartirPropietarios,
  ROLES_ORGANIZADORES,
  unidadesVigentes,
} from './comun'
import {
  AntesDeHora,
  AsambleaInvalida,
  AutoridadSinUsuario,
  conReglas,
  NoConstituida,
  NoPresente,
  NoRepresenta,
  OtroPuntoAbierto,
  PuntosSinCerrar,
  SinQuorum,
  UnidadYaAcreditada,
} from './errores'
import { conteoVista, padronDeDominio, votosDeDominio } from './ver'

/**
 * Conducir la reunión (RF-31, FR-015 a FR-026). Abrir congela el padrón
 * (research R-03); constituir decide el quórum con el reloj (R-11); cerrar un
 * punto fija su resultado una sola vez (R-05). La base impide volver atrás.
 */

type Datos = { usuarioId: string; consorcioId: string; asambleaId: string }

const ROLES = { rolesPermitidos: ROLES_ORGANIZADORES }

/** Días corridos para oponerse a una decisión provisoria (CCyC art. 2060). */
export const DIAS_OPOSICION = 15

async function nombreDe(usuarioId: string): Promise<string> {
  const u = await prismaBase.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    select: { persona: { select: { nombre: true, apellido: true } } },
  })
  return `${u.persona.nombre} ${u.persona.apellido}`.trim()
}

function exigirEnCurso(asamblea: Asamblea): void {
  if (asamblea.estado !== 'en_curso') {
    throw new AsambleaInvalida('La asamblea no está en curso.')
  }
}

export async function abrir(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos,
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, ...ROLES, accion: 'dirigir asambleas' },
    async (acceso) => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      exigirPuedeDirigir(acceso, asamblea)
      transicionAsamblea(asamblea.estado, 'abrir')
      if (reloj.ahora() < asamblea.fechaHora)
        throw new AntesDeHora(horaParaMostrar(asamblea.fechaHora))

      const umbral = asamblea.umbralSinVoto ?? 2
      const [unidades, deudas] = await Promise.all([
        unidadesVigentes(),
        saldoImpagoPorUnidad(reloj.hoy()),
      ])

      await conReglas(() =>
        prisma.$transaction(async (tx) => {
          await tx.asamblea.update({
            where: { id: asamblea.id },
            data: { estado: 'en_curso', abiertaEn: reloj.ahora(), dirigeId: datos.usuarioId },
          })
          // El padrón se congela entero, en una sentencia (nota 11).
          await tx.unidadEnAsamblea.createMany({
            data: unidades.map((u) =>
              sinConsorcio({
                asambleaId: asamblea.id,
                unidadId: u.id,
                designacion: u.designacion,
                coeficiente: u.coeficiente,
                sinVoto: (deudas.get(u.id)?.vencidos ?? 0) > umbral,
              }),
            ),
          })
        }),
      )
    },
  )
}

/** Las unidades que el usuario puede representar: propietario vigente, o poder que vale. */
async function representables(
  asambleaId: string,
  usuarioId: string,
  hoy: Date,
): Promise<{ unidadId: string; representacion: 'propietario' | 'apoderado' }[]> {
  const padron = await prisma.unidadEnAsamblea.findMany({
    where: { asambleaId },
    select: { unidadId: true },
  })
  const propietarios = await propietariosVigentesDe(
    padron.map((u) => u.unidadId),
    hoy,
  )
  const propias = new Set(
    propietarios.filter((p) => p.usuarioId === usuarioId).map((p) => p.unidadId),
  )

  const poderes = await prisma.poder.findMany({
    where: { asambleaId, apoderadoId: usuarioId, revocadoEn: null },
    select: { unidadId: true, otorganteId: true },
  })
  // Un poder de quien ya no es propietario no vale (caso borde de la spec, E2).
  const vigentes = new Set(propietarios.map((p) => `${p.unidadId}:${p.personaId}`))
  const porPoder = poderes
    .filter((p) => !propias.has(p.unidadId) && vigentes.has(`${p.unidadId}:${p.otorganteId}`))
    .map((p) => ({ unidadId: p.unidadId, representacion: 'apoderado' as const }))

  return [
    ...[...propias].map((unidadId) => ({ unidadId, representacion: 'propietario' as const })),
    ...porPoder,
  ]
}

/**
 * «Estoy presente»: acredita todas las unidades que el usuario representa y
 * nadie acreditó todavía. La primera acreditación gana (FR-016): la base no
 * deja cambiar el representante.
 */
export async function acreditarme(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos,
): Promise<{ acreditadas: number }> {
  return conAutorizacion(repositorio, reloj, { ...datos, accion: 'acreditarse' }, async () => {
    const asamblea = await cargarAsamblea(datos.asambleaId)
    exigirEnCurso(asamblea)
    const unidades = await representables(asamblea.id, datos.usuarioId, reloj.hoy())
    if (unidades.length === 0) throw new NoRepresenta()

    const nombre = await nombreDe(datos.usuarioId)
    let acreditadas = 0
    await conReglas(() =>
      prisma.$transaction(async (tx) => {
        for (const u of unidades) {
          const { count } = await tx.unidadEnAsamblea.updateMany({
            where: { asambleaId: asamblea.id, unidadId: u.unidadId, presente: false },
            data: {
              presente: true,
              representanteId: datos.usuarioId,
              representanteNombre: nombre,
              representacion: u.representacion,
              acreditadoEn: reloj.ahora(),
              acreditadoPorId: datos.usuarioId,
            },
          })
          acreditadas += count
        }
      }),
    )
    if (acreditadas === 0) throw new UnidadYaAcreditada()
    return { acreditadas }
  })
}

/**
 * Quien dirige acredita a otro: a un usuario que representa la unidad, o a una
 * persona sin cuenta por su nombre (quien después vota por carga manual).
 */
export async function acreditar(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos & {
    unidadId: string
    representanteId?: string | null
    nombre?: string
    representacion: 'propietario' | 'apoderado'
  },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, ...ROLES, accion: 'dirigir asambleas' },
    async (acceso) => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      exigirDirige(acceso, asamblea)
      exigirEnCurso(asamblea)

      let nombre = datos.nombre?.trim() ?? ''
      let representacion = datos.representacion
      let representanteId: string | null = datos.representanteId ?? null
      if (datos.representanteId) {
        const puede = (await representables(asamblea.id, datos.representanteId, reloj.hoy())).find(
          (u) => u.unidadId === datos.unidadId,
        )
        if (!puede) throw new NoRepresenta()
        representacion = puede.representacion
        nombre = await nombreDe(datos.representanteId)
      } else if (datos.representanteId === undefined && representacion === 'propietario') {
        const titulares = await propietariosVigentesDe([datos.unidadId], reloj.hoy())
        const coincidente =
          titulares.find((t) => t.usuarioId && t.nombre.toLowerCase() === nombre.toLowerCase()) ??
          titulares.find((t) => t.usuarioId)
        if (coincidente?.usuarioId) {
          representanteId = coincidente.usuarioId
        }
      }
      if (!nombre) throw new AsambleaInvalida('Indicá quién está presente por la unidad.')

      const { count } = await conReglas(() =>
        prisma.unidadEnAsamblea.updateMany({
          where: { asambleaId: asamblea.id, unidadId: datos.unidadId, presente: false },
          data: {
            presente: true,
            representanteId,
            representanteNombre: nombre,
            representacion,
            acreditadoEn: reloj.ahora(),
            acreditadoPorId: datos.usuarioId,
          },
        }),
      )
      if (count === 0) throw new UnidadYaAcreditada()
    },
  )
}

export async function designarAutoridades(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos & { presidenteId: string; secretarioId: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, ...ROLES, accion: 'dirigir asambleas' },
    async (acceso) => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      exigirDirige(acceso, asamblea)
      exigirEnCurso(asamblea)
      if (!datos.presidenteId || !datos.secretarioId) throw new AutoridadSinUsuario()
      if (datos.presidenteId === datos.secretarioId) {
        throw new AsambleaInvalida('Presidente y secretario tienen que ser dos personas distintas.')
      }

      const presentes = await prisma.unidadEnAsamblea.findMany({
        where: { asambleaId: asamblea.id, presente: true },
        select: {
          unidadId: true,
          representacion: true,
          representanteId: true,
          representanteNombre: true,
        },
      })
      const sinVincularIds = presentes
        .filter((p) => !p.representanteId && p.representacion === 'propietario')
        .map((p) => p.unidadId)
      const propietariosPresentes =
        sinVincularIds.length > 0 ? await propietariosVigentesDe(sinVincularIds, reloj.hoy()) : []
      const conUsuario = new Set<string>([
        ...presentes.map((p) => p.representanteId).filter((id): id is string => Boolean(id)),
        ...propietariosPresentes.map((p) => p.usuarioId).filter((id): id is string => Boolean(id)),
      ])
      for (const id of [datos.presidenteId, datos.secretarioId]) {
        if (!conUsuario.has(id)) {
          throw presentes.length > 0 ? new NoPresente() : new AutoridadSinUsuario()
        }
      }
      await conReglas(() =>
        prisma.asamblea.update({
          where: { id: asamblea.id },
          data: { presidenteId: datos.presidenteId, secretarioId: datos.secretarioId },
        }),
      )
    },
  )
}

export async function constituir(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos,
): Promise<{ rige: 'primera' | 'segunda' }> {
  return conAutorizacion(
    repositorio,
    reloj,
    { ...datos, ...ROLES, accion: 'dirigir asambleas' },
    async (acceso) => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      exigirDirige(acceso, asamblea)
      exigirEnCurso(asamblea)
      if (asamblea.constituidaEn) throw new AsambleaInvalida('La asamblea ya está constituida.')
      if (!asamblea.presidenteId || !asamblea.secretarioId) {
        throw new AsambleaInvalida('Antes de constituir, designá presidente y secretario.')
      }

      const padron = await prisma.unidadEnAsamblea.findMany({ where: { asambleaId: asamblea.id } })
      let total = new Decimal(0)
      let presente = new Decimal(0)
      let presentesConVoto = 0
      for (const u of padron) {
        const c = new Decimal(u.coeficiente.toString())
        total = total.plus(c)
        if (u.presente) {
          presente = presente.plus(c)
          if (!u.sinVoto) presentesConVoto += 1
        }
      }
      const decision = puedeConstituir({
        ahora: reloj.ahora(),
        fechaHora: asamblea.fechaHora,
        coeficientePresente: presente,
        coeficienteTotal: total,
        presentesConVoto,
      })
      if (!decision.puede) {
        if (decision.motivo === 'antes_de_hora')
          throw new AntesDeHora(horaParaMostrar(asamblea.fechaHora))
        throw new SinQuorum(
          presente.toFixed(2),
          horaParaMostrar(segundaConvocatoria(asamblea.fechaHora)).slice(-5),
        )
      }
      await conReglas(() =>
        prisma.asamblea.update({
          where: { id: asamblea.id },
          data: { constituidaEn: reloj.ahora(), convocatoriaQueRige: decision.rige },
        }),
      )
      return { rige: decision.rige }
    },
  )
}

export async function abrirPunto(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos & { puntoId: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, ...ROLES, accion: 'dirigir asambleas' },
    async (acceso) => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      exigirDirige(acceso, asamblea)
      exigirEnCurso(asamblea)
      if (!asamblea.constituidaEn) throw new NoConstituida()

      const puntos = await prisma.puntoAsamblea.findMany({
        where: { asambleaId: asamblea.id },
        orderBy: { orden: 'asc' },
        select: { id: true, estado: true },
      })
      if (puntos.some((p) => p.estado === 'abierto')) throw new OtroPuntoAbierto()
      const siguiente = puntos.find((p) => p.estado === 'pendiente')
      if (!siguiente || siguiente.id !== datos.puntoId) {
        throw new AsambleaInvalida('Los puntos se tratan en el orden del día, de a uno.')
      }
      transicionPunto('pendiente', 'abrir')
      await conReglas(
        () =>
          prisma.puntoAsamblea.update({
            where: { id: datos.puntoId },
            data: { estado: 'abierto', abiertoEn: reloj.ahora() },
          }),
        () => new OtroPuntoAbierto(),
      )
    },
  )
}

export async function cerrarPunto(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos & { puntoId: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, ...ROLES, accion: 'dirigir asambleas' },
    async (acceso) => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      exigirDirige(acceso, asamblea)
      exigirEnCurso(asamblea)

      const punto = await prisma.puntoAsamblea.findFirst({
        where: { id: datos.puntoId, asambleaId: asamblea.id },
        include: { opciones: { orderBy: { orden: 'asc' } }, votos: true },
      })
      if (!punto) throw new AsambleaInvalida('Ese punto no es de esta asamblea.')
      transicionPunto(punto.estado, 'cerrar')

      const padron = await prisma.unidadEnAsamblea.findMany({ where: { asambleaId: asamblea.id } })
      const padronDom = padronDeDominio(padron)
      const votos = votosDeDominio(punto.votos)
      const ahora = reloj.ahora()

      let datosCierre: Prisma.PuntoAsambleaUpdateInput
      let provisorio = false
      if (punto.modalidad === 'binaria') {
        const r = resultadoBinario(
          padronDom,
          votos,
          punto.mayoria!,
          asamblea.reglaMayoria ?? 'presentes',
        )
        provisorio = r.provisorio
        datosCierre = {
          resultado: r.resultado,
          provisorio: r.provisorio,
          vencePlazoOposicion: r.provisorio
            ? new Date(ahora.getTime() + DIAS_OPOSICION * DIA_MS)
            : null,
          conteo: conteoVista(r.conteo) as unknown as Prisma.InputJsonValue,
        }
      } else {
        const r = resultadoOpcionMultiple(
          padronDom,
          votos,
          punto.opciones.map((o) => o.id),
        )
        datosCierre = {
          resultado: r.resultado,
          opcionGanadoraId: r.opcionGanadoraId ?? null,
          conteo: conteoVista(r.conteo) as unknown as Prisma.InputJsonValue,
        }
      }

      // Los ausentes con voto se enteran de la decisión provisoria (FR-027).
      const ausentes = provisorio
        ? padron
            .filter((u) => !u.presente && !u.sinVoto)
            .map((u) => ({ id: u.unidadId, designacion: u.designacion }))
        : []
      const destinatarios = provisorio
        ? repartirPropietarios(
            await propietariosVigentesDe(
              ausentes.map((u) => u.id),
              reloj.hoy(),
            ),
            new Map(ausentes.map((u) => [u.id, u.designacion])),
          )
        : null

      await conReglas(() =>
        prisma.$transaction(async (tx) => {
          await tx.puntoAsamblea.update({
            where: { id: punto.id },
            data: { ...datosCierre, estado: 'cerrado', cerradoEn: ahora },
          })
          if (destinatarios) {
            const vence = new Date(ahora.getTime() + DIAS_OPOSICION * DIA_MS)
            await avisarPorLosDosCanales(tx, {
              tipo: 'decision_provisoria',
              titulo: `Decisión provisoria: ${punto.titulo}`,
              cuerpo: [
                `En la asamblea «${asamblea.titulo}», tu unidad estuvo ausente y el punto «${punto.titulo}» se aprobó por la mayoría de los presentes.`,
                `Si no te oponés hasta el ${horaParaMostrar(vence)}, la decisión queda firme (CCyC art. 2060).`,
                'Podés oponerte desde Flay, o por escrito ante la administración.',
              ].join('\n'),
              asambleaId: asamblea.id,
              usuarios: destinatarios.conUsuario,
              porCorreo: destinatarios.porCorreo,
            })
          }
        }),
      )
    },
  )
}

export async function tomarDireccion(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos,
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, ...ROLES, accion: 'dirigir asambleas' },
    async (acceso) => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      exigirPuedeDirigir(acceso, asamblea)
      exigirEnCurso(asamblea)
      await prisma.asamblea.update({
        where: { id: asamblea.id },
        data: { dirigeId: datos.usuarioId },
      })
    },
  )
}

export async function finalizar(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos,
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, ...ROLES, accion: 'dirigir asambleas' },
    async (acceso) => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      exigirDirige(acceso, asamblea)
      // Un doble clic u otra pestaña con la sala vieja: ya quedó hecho, no es un error.
      if (asamblea.estado === 'finalizada') return
      const pendientes = await prisma.puntoAsamblea.count({
        where: { asambleaId: asamblea.id, estado: { not: 'cerrado' } },
      })
      if (pendientes > 0) throw new PuntosSinCerrar(pendientes)
      transicionAsamblea(asamblea.estado, 'finalizar', {
        constituida: asamblea.constituidaEn !== null,
      })

      await conReglas(() =>
        prisma.$transaction(async (tx) => {
          await tx.asamblea.update({
            where: { id: asamblea.id },
            data: { estado: 'finalizada', finalizadaEn: reloj.ahora() },
          })
          // El acta nace en redacción (FR-030) y con su borrador en camino (RF-32).
          const acta = await tx.actaAsamblea.create({
            data: sinConsorcio({ asambleaId: asamblea.id, borradorPedidoEn: reloj.ahora() }),
            select: { id: true },
          })
          await encolarBorrador(tx, acta.id)
        }),
      )
    },
  )
}
