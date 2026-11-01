import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { periodoPara } from '@/aplicacion/periodos/periodos'
import { procesadorDePrueba } from '@/infraestructura/pagos/procesador-de-prueba'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

/**
 * Escenario comun de las pruebas de pago en linea (`RF-28`): un consorcio con
 * administrador, un inquilino en la unidad 1A y el padron 1A/1B al 50 %.
 * Las variables se exportan con `let`: el import es un enlace vivo y cada
 * archivo ve los valores del `beforeEach` en curso.
 */

export const RELOJ = relojFijo('2026-09-15T12:00:00Z')
export const repo = repositorioHabilitaciones

export let consorcioId: string
export let administrador: string
export let inquilino: string
export let unidadA: string
export let unidadB: string
export let rubroId: string

export async function prepararEscenario() {
  process.env.MP_CLAVE_CIFRADO = Buffer.alloc(32, 9).toString('base64')
  procesadorDePrueba.limpiar()

  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Admin')).id
  inquilino = (await crearUsuario('Inquilino')).id

  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(inquilino, consorcioId, 'consorcista')

  rubroId = (
    await prismaBase.rubroGasto.upsert({
      where: { nombre: 'Rubro de prueba' },
      update: {},
      create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
    })
  ).id

  await cargarPadron(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidades: [
      { designacion: '1A', tipo: 'departamento', coeficiente: '50.00000000' },
      { designacion: '1B', tipo: 'departamento', coeficiente: '50.00000000' },
    ],
  })

  const unidades = await prismaBase.unidad.findMany({
    where: { consorcioId },
    orderBy: { designacion: 'asc' },
  })
  unidadA = unidades[0].id
  unidadB = unidades[1].id

  const inquilinoUsuario = await prismaBase.usuario.findUniqueOrThrow({ where: { id: inquilino } })
  await registrarOcupacion(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidadId: unidadA,
    personaId: inquilinoUsuario.personaId,
    tipo: 'inquilino',
    desde: new Date('2026-01-01'),
  })
}

export async function limpiarEscenario() {
  await prismaBase.$executeRaw`DELETE FROM "IntentoDePago"`
  await prismaBase.$executeRaw`DELETE FROM "CredencialPagoAdministradora"`
  await prismaBase.$executeRaw`DELETE FROM "Reserva"`
  await prismaBase.$executeRaw`DELETE FROM "PagoImputacion"`
  await prismaBase.$executeRaw`DELETE FROM "Pago"`
  await prismaBase.$executeRaw`DELETE FROM "InteresLiquidado"`
  await prismaBase.$executeRaw`DELETE FROM "DetalleLiquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "VencimientoLiquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Liquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Gasto"`
  await prismaBase.$executeRaw`DELETE FROM "Periodo"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Ocupacion"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
}

export async function emitirMes(mes: number, gastoMonto = '1000.00') {
  const { periodoId } = await periodoPara(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    anio: 2026,
    mes,
  })
  await registrarGasto(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    periodoId,
    rubroId,
    importe: gastoMonto,
    fecha: new Date(`2026-${String(mes).padStart(2, '0')}-05`),
    descripcion: `Gasto ${mes}`,
  })
  await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
  return liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
}
