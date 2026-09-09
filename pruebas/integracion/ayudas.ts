import { prismaBase } from '@/infraestructura/prisma'

/** Datos minimos para las pruebas, con identificadores unicos por corrida. */

export async function crearAdministradora(razonSocial = 'Grupo Delta') {
  return prismaBase.administradora.create({
    data: { razonSocial, cuit: `30-${crypto.randomUUID().slice(0, 8)}-0` },
  })
}

export async function crearConsorcio(administradoraId: string, nombre = 'Mitre 456') {
  return prismaBase.consorcio.create({
    data: {
      administradoraId,
      nombre,
      direccion: nombre,
      localidad: 'Rosario',
      cuit: `33-${crypto.randomUUID().slice(0, 8)}-9`,
    },
  })
}

export async function crearUsuario(nombre = 'Ana', apellido = 'Diaz') {
  const persona = await prismaBase.persona.create({ data: { nombre, apellido } })
  return prismaBase.usuario.create({
    data: {
      personaId: persona.id,
      correo: `${nombre.toLowerCase()}-${crypto.randomUUID()}@ejemplo.test`,
      estado: 'activo',
    },
  })
}

const DESDE = new Date('2026-01-01')

export const habilitarEnPlataforma = (usuarioId: string) =>
  prismaBase.habilitacionPlataforma.create({ data: { usuarioId, vigenciaDesde: DESDE } })

export const habilitarEnAdministradora = (usuarioId: string, administradoraId: string) =>
  prismaBase.habilitacionAdministradora.create({
    data: { usuarioId, administradoraId, vigenciaDesde: DESDE },
  })

export const habilitarEnConsorcio = (
  usuarioId: string,
  consorcioId: string,
  rol: 'administrador' | 'consejo' | 'consorcista',
) => prismaBase.habilitacion.create({ data: { usuarioId, consorcioId, rol, vigenciaDesde: DESDE } })

/** Orden inverso al de las claves foraneas. */
export async function limpiar() {
  await prismaBase.habilitacion.deleteMany({})
  await prismaBase.habilitacionAdministradora.deleteMany({})
  await prismaBase.habilitacionPlataforma.deleteMany({})
  await prismaBase.intentoInicioSesion.deleteMany({})
  await prismaBase.trabajoPendiente.deleteMany({})
  await prismaBase.usuario.deleteMany({})
  await prismaBase.persona.deleteMany({})
  await prismaBase.consorcio.deleteMany({})
  await prismaBase.administradora.deleteMany({})
}
