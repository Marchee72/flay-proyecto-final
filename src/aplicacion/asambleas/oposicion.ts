import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'
import { propietariosVigentesDe } from '@/infraestructura/repositorios/ocupaciones'

import { cargarAsamblea, exigirPuedeDirigir, ROLES_ORGANIZADORES } from './comun'
import { conReglas, FueraDePlazo, NoEraAusente, NoEsPropietario } from './errores'

/**
 * Oposición a una decisión provisoria (RF-33, CCyC art. 2060, FR-027 a
 * FR-029). Solo el propietario de una unidad ausente con voto, dentro de los
 * 15 días. La base repite la regla (`oposicion_reglas`); acá se da el mensaje.
 */

type Datos = {
  usuarioId: string
  consorcioId: string
  asambleaId: string
  puntoId: string
  unidadId: string
}

async function validar(datos: Datos, ahora: Date): Promise<void> {
  const asamblea = await cargarAsamblea(datos.asambleaId)
  const punto = await prisma.puntoAsamblea.findFirst({
    where: { id: datos.puntoId, asambleaId: asamblea.id },
    select: { provisorio: true, vencePlazoOposicion: true },
  })
  if (!punto?.provisorio || !punto.vencePlazoOposicion || ahora > punto.vencePlazoOposicion) {
    throw new FueraDePlazo()
  }
  const unidad = await prisma.unidadEnAsamblea.findFirst({
    where: { asambleaId: asamblea.id, unidadId: datos.unidadId },
    select: { presente: true, sinVoto: true },
  })
  if (!unidad || unidad.presente || unidad.sinVoto) throw new NoEraAusente()
}

async function registrar(
  datos: Datos,
  personaId: string,
  origen: 'en_linea' | 'papel',
): Promise<void> {
  await conReglas(
    () =>
      prisma.oposicionDecision.create({
        data: sinConsorcio({
          puntoId: datos.puntoId,
          unidadId: datos.unidadId,
          personaId,
          origen,
          registradoPorId: datos.usuarioId,
        }),
      }),
    // Una unidad se opone una vez; la segunda es la misma oposición.
    () => new FueraDePlazo(),
  )
}

export async function oponerme(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos,
): Promise<void> {
  await conAutorizacion(repositorio, reloj, { ...datos, accion: 'oponerse' }, async () => {
    await validar(datos, reloj.ahora())
    const propio = (await propietariosVigentesDe([datos.unidadId], reloj.hoy())).find(
      (p) => p.usuarioId === datos.usuarioId,
    )
    if (!propio) throw new NoEsPropietario()
    await registrar(datos, propio.personaId, 'en_linea')
  })
}

/** La administración registra la oposición que un propietario sin cuenta presentó por escrito. */
export async function registrarOposicionEnPapel(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos & { personaId: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, rolesPermitidos: ROLES_ORGANIZADORES, accion: 'registrar oposiciones' },
    async (acceso) => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      if (!acceso.roles.includes('administrador')) exigirPuedeDirigir(acceso, asamblea)
      await validar(datos, reloj.ahora())
      const esPropietario = (await propietariosVigentesDe([datos.unidadId], reloj.hoy())).some(
        (p) => p.personaId === datos.personaId,
      )
      if (!esPropietario) throw new NoEsPropietario()
      await registrar(datos, datos.personaId, 'papel')
    },
  )
}
