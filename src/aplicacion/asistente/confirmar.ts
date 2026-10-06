import type { EstadoPropuesta } from '@prisma/client'

import { NoEncontrado } from '@/compartido/errores'
import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { Asistencia } from '@/dominio/contratos/asistencia'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { type ContextoHerramienta, herramientaPorNombre } from '@/aplicacion/asistente/herramientas'
import { prisma } from '@/infraestructura/prisma'

/**
 * Confirmacion y descarte de una propuesta de escritura del asistente (RF-27,
 * FR-008, Principio IV). La ejecucion es **idempotente**: se reclama el estado
 * `pendiente → confirmada` de forma atomica ANTES de ejecutar, asi un doble clic,
 * una recarga o dos pedidos en paralelo no crean duplicados. Si el caso de uso
 * rechaza (p. ej. deuda vencida), se revierte a `pendiente` para poder reintentar.
 *
 * La propuesta se busca por el hilo del usuario (aislado por consorcio): una de
 * otro consorcio o de otro usuario simplemente no aparece.
 */

export type ResultadoConfirmacion = {
  ejecutada: boolean
  resultado?: unknown
  yaResuelta?: EstadoPropuesta
}

async function propuestaDelUsuario(usuarioId: string, propuestaId: string) {
  // La conversacion que TIENE la propuesta: un usuario junta varias (cada cambio de alcance abre
  // un hilo) y `findFirst({ usuarioId })` solo podia dar con la propuesta si tocaba esa.
  const conv = await prisma.conversacionAsistente.findFirst({
    where: { usuarioId, mensajes: { some: { id: propuestaId } } },
    include: { mensajes: { where: { id: propuestaId } } },
  })
  return conv?.mensajes[0] ?? null
}

export async function confirmarPropuesta(
  asistencia: Asistencia,
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  almacen: AlmacenObjetos,
  datos: { usuarioId: string; consorcioId: string; propuestaId: string },
): Promise<ResultadoConfirmacion> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'confirmar la acción' },
    async (acceso) => {
      const mensaje = await propuestaDelUsuario(datos.usuarioId, datos.propuestaId)
      if (!mensaje || !mensaje.propuesta || !mensaje.estadoPropuesta) throw new NoEncontrado()
      if (mensaje.estadoPropuesta !== 'pendiente') {
        return { ejecutada: false, yaResuelta: mensaje.estadoPropuesta }
      }

      const {
        herramienta: nombre,
        argumentos,
        consorcioId: destinoGuardado,
      } = mensaje.propuesta as {
        herramienta: string
        argumentos: unknown
        consorcioId?: string
      }
      const tool = herramientaPorNombre(nombre)
      if (!tool?.confirmar) throw new NoEncontrado()

      // Reclamo atomico: solo una confirmacion gana la transicion pendiente -> confirmada.
      const reclamo = await prisma.mensajeAsistente.updateMany({
        where: { id: datos.propuestaId, estadoPropuesta: 'pendiente' },
        data: { estadoPropuesta: 'confirmada' },
      })
      if (reclamo.count !== 1) {
        const actual = await propuestaDelUsuario(datos.usuarioId, datos.propuestaId)
        return { ejecutada: false, yaResuelta: actual?.estadoPropuesta ?? 'confirmada' }
      }

      try {
        // La propuesta puede apuntar a otro consorcio del alcance del usuario: se
        // vuelve a resolver el acceso vigente sobre el destino (FR-011).
        const destino = destinoGuardado ?? datos.consorcioId
        const accesoDestino =
          destino === datos.consorcioId
            ? acceso
            : await repositorio.accesoVigente(datos.usuarioId, destino, reloj.hoy())
        if (!accesoDestino) throw new NoEncontrado()
        const args = tool.validar.parse(argumentos)
        const ctx: ContextoHerramienta = {
          repositorio,
          reloj,
          almacen,
          asistencia,
          usuarioId: datos.usuarioId,
          consorcioId: destino,
          roles: accesoDestino.roles,
        }
        const resultado = await tool.confirmar(args, ctx)
        return { ejecutada: true, resultado }
      } catch (error) {
        // El caso de uso rechazo: se deshace el reclamo para permitir reintento.
        await prisma.mensajeAsistente.updateMany({
          where: { id: datos.propuestaId, estadoPropuesta: 'confirmada' },
          data: { estadoPropuesta: 'pendiente' },
        })
        throw error
      }
    },
  )
}

export async function descartarPropuesta(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; propuestaId: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'descartar la acción' },
    async () => {
      const mensaje = await propuestaDelUsuario(datos.usuarioId, datos.propuestaId)
      if (!mensaje || !mensaje.estadoPropuesta) throw new NoEncontrado()
      await prisma.mensajeAsistente.updateMany({
        where: { id: datos.propuestaId, estadoPropuesta: 'pendiente' },
        data: { estadoPropuesta: 'descartada' },
      })
    },
  )
}
