import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { convocar, crearAsamblea, type PuntoNuevo } from '@/aplicacion/asambleas/convocar'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import { crearAdministradora, crearConsorcio, crearUsuario, habilitarEnConsorcio } from './ayudas'

/**
 * Escenario común de las pruebas de asambleas (016). Cuatro unidades con los
 * coeficientes del caso testigo de `quickstart.md` § 1:
 *
 * - 1A (40): Ana, propietaria con cuenta. Su inquilino Iván también tiene cuenta.
 * - 1B (30): Bruno, propietario con cuenta.
 * - 2A (20): Carla, propietaria con cuenta y miembro del consejo.
 * - 2B (10): Dora, propietaria **sin cuenta**, con correo en el padrón.
 *
 * Más Ada (administración) y un consorcio ajeno con su propio administrador.
 */

export const repo = repositorioHabilitaciones
/** Hoy en las pruebas: 3 de noviembre de 2026. */
export const HOY = relojFijo('2026-11-03T12:00:00Z')
/** La reunión: 25 de noviembre de 2026, 19:00 en Argentina. */
export const FECHA_REUNION = new Date('2026-11-25T22:00:00Z')
/** Un reloj a `minutos` de la primera convocatoria. */
export const enLaReunion = (minutos = 5) =>
  relojFijo(new Date(FECHA_REUNION.getTime() + minutos * 60_000).toISOString())

export interface Escenario {
  consorcioId: string
  administracion: string
  consejo: string
  ana: string
  bruno: string
  carla: string
  ivan: string
  personaDora: string
  /** Solo con `conExtra`: 2C (5), de Elsa, propietaria con cuenta. */
  elsa: string | null
  unidades: Record<'1A' | '1B' | '2A' | '2B', string> & { '2C'?: string }
  ajeno: { consorcioId: string; administrador: string }
}

/**
 * `conExtra` parte 2B en dos (5 y 5) y suma 2C, de Elsa: un presente con
 * usuario más, para las pruebas que necesitan reemplazar a un firmante.
 */
export async function armarEscenario(opciones: { conExtra?: boolean } = {}): Promise<Escenario> {
  const administradora = await crearAdministradora()
  const consorcioId = (await crearConsorcio(administradora.id, 'Sol 123')).id
  const administracion = (await crearUsuario('Ada', 'Admin')).id
  await habilitarEnConsorcio(administracion, consorcioId, 'administrador')

  await cargarPadron(repo, HOY, {
    usuarioId: administracion,
    consorcioId,
    unidades: [
      { designacion: '1A', coeficiente: '40.00000000' },
      { designacion: '1B', coeficiente: '30.00000000' },
      { designacion: '2A', coeficiente: '20.00000000' },
      ...(opciones.conExtra
        ? [
            { designacion: '2B', coeficiente: '5.00000000' },
            { designacion: '2C', coeficiente: '5.00000000' },
          ]
        : [{ designacion: '2B', coeficiente: '10.00000000' }]),
    ],
  })
  const filas = await prismaBase.unidad.findMany({ where: { consorcioId } })
  const unidades = Object.fromEntries(
    filas.map((u) => [u.designacion, u.id]),
  ) as Escenario['unidades']

  const ocupar = async (unidadId: string, personaId: string, tipo: 'propietario' | 'inquilino') =>
    registrarOcupacion(repo, HOY, {
      usuarioId: administracion,
      consorcioId,
      unidadId,
      personaId,
      tipo,
      desde: new Date('2026-01-01'),
    })

  const ana = await crearUsuario('Ana', 'Alvarez')
  const bruno = await crearUsuario('Bruno', 'Bianchi')
  const carla = await crearUsuario('Carla', 'Cruz')
  const ivan = await crearUsuario('Ivan', 'Inquilino')
  const dora = await prismaBase.persona.create({
    data: { nombre: 'Dora', apellido: 'Diaz', correo: `dora-${crypto.randomUUID()}@ejemplo.test` },
  })
  await ocupar(unidades['1A'], ana.personaId, 'propietario')
  await ocupar(unidades['1A'], ivan.personaId, 'inquilino')
  await ocupar(unidades['1B'], bruno.personaId, 'propietario')
  await ocupar(unidades['2A'], carla.personaId, 'propietario')
  await ocupar(unidades['2B'], dora.id, 'propietario')
  await habilitarEnConsorcio(carla.id, consorcioId, 'consejo')
  let elsa: string | null = null
  if (opciones.conExtra) {
    const usuaria = await crearUsuario('Elsa', 'Extra')
    await ocupar(unidades['2C']!, usuaria.personaId, 'propietario')
    elsa = usuaria.id
  }

  const otro = await crearConsorcio(administradora.id, 'Luna 9')
  const ajenoAdmin = (await crearUsuario('Otro', 'Admin')).id
  await habilitarEnConsorcio(ajenoAdmin, otro.id, 'administrador')

  return {
    consorcioId,
    administracion,
    consejo: carla.id,
    ana: ana.id,
    bruno: bruno.id,
    carla: carla.id,
    ivan: ivan.id,
    personaDora: dora.id,
    elsa,
    unidades,
    ajeno: { consorcioId: otro.id, administrador: ajenoAdmin },
  }
}

export const PUNTOS: PuntoNuevo[] = [
  { titulo: 'Pintura del frente', modalidad: 'binaria', mayoria: 'absoluta' },
  {
    titulo: 'Presupuesto de ascensores',
    modalidad: 'opcion_multiple',
    opciones: ['Empresa X', 'Empresa Y', 'Empresa Z'],
  },
]

/** Una asamblea del consejo, ya convocada para `FECHA_REUNION`. */
export async function asambleaConvocada(
  e: Escenario,
  opciones: { administracionInvitada?: boolean; puntos?: PuntoNuevo[] } = {},
): Promise<string> {
  const { asambleaId } = await crearAsamblea(repo, HOY, {
    usuarioId: e.consejo,
    consorcioId: e.consorcioId,
    tipo: 'ordinaria',
    titulo: 'Asamblea ordinaria 2026',
    fechaHora: FECHA_REUNION,
    lugar: 'SUM, planta baja',
    administracionInvitada: opciones.administracionInvitada ?? true,
    puntos: opciones.puntos ?? PUNTOS,
  })
  await convocar(repo, HOY, { usuarioId: e.consejo, consorcioId: e.consorcioId, asambleaId })
  return asambleaId
}
