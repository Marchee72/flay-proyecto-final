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

/**
 * Orden inverso al de las claves foraneas.
 *
 * Borra **todo**, incluida la semilla de § 13.4 y el volumen de medicion: en
 * una base compartida no hay forma de distinguir lo sembrado de lo dejado por
 * una corrida anterior, y una prueba que arranca con residuos no prueba nada.
 * Por eso el orden de `quickstart.md` es sembrar y medir, no al reves.
 */
export async function limpiar() {
  await prismaBase.comprobante.deleteMany({})
  await prismaBase.gasto.deleteMany({})
  await prismaBase.periodo.deleteMany({})
  await prismaBase.proveedor.deleteMany({})
  await prismaBase.$executeRaw`DELETE FROM "Ocupacion"`
  await prismaBase.coeficienteHistorico.deleteMany({})
  await prismaBase.unidad.deleteMany({})
  await prismaBase.habilitacion.deleteMany({})
  await prismaBase.habilitacionAdministradora.deleteMany({})
  await prismaBase.habilitacionPlataforma.deleteMany({})
  await prismaBase.intentoInicioSesion.deleteMany({})
  await prismaBase.trabajoPendiente.deleteMany({})
  await prismaBase.usuario.deleteMany({})
  await prismaBase.persona.deleteMany({})
  await prismaBase.consorcio.deleteMany({})
  await prismaBase.administradora.deleteMany({})
  // El catalogo de rubros es global y no lleva consorcio, asi que nada de lo
  // anterior lo alcanza: el rubro que fabrican las pruebas sobrevive y aparece
  // en la lista del entorno de demostracion. Se borra por nombre.
  await prismaBase.rubroGasto.deleteMany({ where: { nombre: 'Rubro de prueba' } })
}
