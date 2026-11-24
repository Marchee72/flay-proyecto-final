import { hash } from '@node-rs/argon2'

import { convocar, crearAsamblea } from '@/aplicacion/asambleas/convocar'
import { publicarNovedad } from '@/aplicacion/comunicacion/novedades'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { registrarPago } from '@/aplicacion/pagos/registrar'
import { periodoPara } from '@/aplicacion/periodos/periodos'
import { altaProveedor } from '@/aplicacion/proveedores/proveedores'
import { registrarReclamo } from '@/aplicacion/reclamos/registrar'
import { transicionar } from '@/aplicacion/reclamos/transicionar'
import { reservar } from '@/aplicacion/reservas/reservar'
import { prismaBase } from '@/infraestructura/prisma'
import { relojDelSistema } from '@/infraestructura/reloj'
import { repositorioHabilitaciones as repo } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../pruebas/dominio/reloj-fijo'
import { sembrarJuego, unidadesIguales } from '../pruebas/fixtures/juego-13-4'

/**
 * Consorcio para la demostracion del dia: «Torre Belgrano 2200», 20 unidades,
 * con inquilinos, deudores con deuda acumulada, una asamblea hoy a las 18 hs
 * y reservas. Todo lo economico sale de los casos de uso reales.
 * Idempotente: se reconoce por el CUIT del consorcio.
 *
 *   DEMO_CLAVE=flay1234 npx vite-node --config vitest.config.ts scripts/semilla-demo-hoy.ts
 */

const ANIO = 2026
const MESES = [5, 6, 7, 8, 9] // liquidados; octubre queda abierto con gastos
const ULTIMO = 10
const ASAMBLEA = 'Asamblea ordinaria anual 2026'

const fecha = (mes: number, dia: number) => new Date(Date.UTC(ANIO, mes - 1, dia))
const relojEn = (mes: number, dia: number) => relojFijo(fecha(mes, dia).toISOString())
const enPesos = (n: number) => n.toFixed(2)

/** [designacion, nombre, apellido, inquilino?] */
const VECINOS: [string, string, string, [string, string]?][] = [
  ['1A', 'Marcela', 'Gutierrez'],
  ['1B', 'Roberto', 'Aguirre', ['Julieta', 'Ferreyra']],
  ['1C', 'Hector', 'Medina'],
  ['1D', 'Silvia', 'Quiroga'],
  ['2A', 'Andres', 'Benitez'],
  ['2B', 'Laura', 'Romero'],
  ['2C', 'Gustavo', 'Pereyra', ['Nicolas', 'Dominguez']],
  ['2D', 'Patricia', 'Vega'],
  ['3A', 'Fernando', 'Acosta', ['Camila', 'Rojas']],
  ['3B', 'Mariano', 'Soria'],
  ['3C', 'Elena', 'Castillo'],
  ['3D', 'Ricardo', 'Molina'],
  ['4A', 'Claudia', 'Navarro'],
  ['4B', 'Sergio', 'Ibarra'],
  ['4C', 'Natalia', 'Cabrera'],
  ['4D', 'Daniel', 'Funes', ['Valentina', 'Paz']],
  ['5A', 'Veronica', 'Luna'],
  ['5B', 'Jorge', 'Herrera', ['Martin', 'Sanchez']],
  ['5C', 'Alicia', 'Ponce'],
  ['5D', 'Pablo', 'Mansilla'],
]

/** Como paga cada unidad; las que no estan aca pagan entero y a tiempo. */
type Perfil = 'nunca' | 'mitad' | 'tarde' | { hasta: number }
const PERFIL: Record<string, Perfil> = {
  '1C': 'nunca', // 5 meses sin pagar
  '3B': 'nunca',
  '4D': { hasta: 6 }, // dejo de pagar desde julio: 3 meses
  '2C': { hasta: 7 }, // 2 meses
  '5A': 'mitad', // paga la mitad todos los meses
  '3A': 'tarde', // paga con recargo
  '1D': 'tarde',
}

const PROVEEDORES = [
  ['Ascensores Litoral S.A.', '30-70011111-1', 'Mantenimiento de ascensores'],
  ['Limpieza Total S.R.L.', '30-70022222-2', 'Limpieza'],
  ['Empresa Provincial de la Energia', '30-70033333-3', 'Energia electrica'],
  ['Aguas Santafesinas S.A.', '30-70044444-4', 'Agua'],
  ['Seguros del Litoral', '30-70055555-5', 'Seguro del edificio'],
  ['Plomeria Rosario', '20-27066666-6', 'Reparaciones menores'],
] as const

const GASTOS: { rubro: string; importe: number; cuit?: string }[] = [
  { rubro: 'Sueldo del encargado', importe: 850_000 },
  { rubro: 'Cargas sociales', importe: 310_000 },
  { rubro: 'Honorarios de administracion', importe: 180_000 },
  { rubro: 'Limpieza', importe: 220_000, cuit: '30-70022222-2' },
  { rubro: 'Energia electrica', importe: 145_000, cuit: '30-70033333-3' },
  { rubro: 'Agua', importe: 62_000, cuit: '30-70044444-4' },
  { rubro: 'Mantenimiento de ascensores', importe: 195_000, cuit: '30-70011111-1' },
  { rubro: 'Seguro del edificio', importe: 98_000, cuit: '30-70055555-5' },
  { rubro: 'Reparaciones menores', importe: 75_000, cuit: '20-27066666-6' },
]

const ESPACIOS = [
  {
    nombre: 'Salon de usos multiples',
    capacidadMaxima: 40,
    aperturaMinutos: 540,
    cierreMinutos: 1380,
    duracionMaximaHoras: 6,
  },
  {
    nombre: 'Quincho',
    capacidadMaxima: 25,
    aperturaMinutos: 720,
    cierreMinutos: 60,
    duracionMaximaHoras: 8,
  },
  {
    nombre: 'Terraza',
    capacidadMaxima: 30,
    aperturaMinutos: 540,
    cierreMinutos: 1320,
    duracionMaximaHoras: 5,
  },
]

/** [unidad, espacio, mes, dia, hora local, horas, personas] */
const RESERVAS: [string, number, number, number, number, number, number][] = [
  ['1A', 0, 11, 21, 18, 4, 30],
  ['2A', 1, 11, 22, 13, 5, 18],
  ['4A', 2, 11, 28, 17, 3, 20],
  ['3C', 0, 11, 28, 19, 4, 35],
  ['5C', 1, 12, 5, 20, 4, 15],
  ['2B', 2, 12, 12, 16, 4, 25],
]

const RECLAMOS: [string, string, string, 'baja' | 'media' | 'alta' | 'critica', string[]][] = [
  [
    '1A',
    'Ascensor se traba en el 3er piso',
    'Desde el lunes el ascensor se detiene un par de segundos en el tercero y a veces no abre la puerta.',
    'alta',
    ['asignado', 'en_curso'],
  ],
  [
    '4A',
    'Perdida de agua en el techo del 4A',
    'Aparecio una mancha de humedad en el techo del living que crece cuando llueve.',
    'alta',
    [],
  ],
  [
    '2B',
    'Luz del palier quemada',
    'La luz del palier del segundo piso esta quemada hace una semana.',
    'baja',
    ['asignado', 'en_curso', 'resuelto'],
  ],
  [
    '3C',
    'Ruidos molestos despues de medianoche',
    'Del 4D llega musica fuerte los fines de semana pasada la medianoche.',
    'media',
    [],
  ],
  [
    '5C',
    'Porton del garage no cierra',
    'El porton queda abierto si no se lo ayuda con la mano, es un riesgo de seguridad.',
    'critica',
    ['asignado'],
  ],
]

const NOVEDADES: [string, string, boolean][] = [
  [
    'Asamblea ordinaria hoy a las 18 hs',
    'Hoy a las 18 hs en el SUM se trata la rendicion de cuentas, el presupuesto de pintura y la impermeabilizacion de la terraza. Pueden acreditarse desde Flay.',
    true,
  ],
  [
    'Mantenimiento del ascensor',
    'El jueves de 9 a 11 el tecnico revisa el ascensor. Se va a poder usar por tramos.',
    false,
  ],
  [
    'Nuevos horarios de los espacios comunes',
    'El SUM se puede reservar de 9 a 23 hs y el quincho hasta la 1 de la manana. Reserven desde el sistema.',
    false,
  ],
]

try {
  const claveDerivada = await hash(process.env.DEMO_CLAVE ?? 'flay1234', {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  })
  const inicio = new Date()

  const juego = await sembrarJuego(prismaBase, fecha(1, 1), [
    {
      nombre: 'Torre Belgrano 2200',
      direccion: 'Av. Belgrano 2200',
      localidad: 'Rosario',
      cuit: '33-70000150-9',
      diaVencimiento: 10,
      tasaMoraMensual: '2.5000',
      unidades: unidadesIguales(20, 4),
    },
  ])
  const consorcioId = juego.consorcios[0].id
  const ya = (await prismaBase.proveedor.count({ where: { consorcioId } })) > 0
  console.log(`Consorcio ${consorcioId}${ya ? ' (ya sembrado: se completa lo que falte)' : ''}`)

  const admin = await prismaBase.usuario.findUniqueOrThrow({
    where: { correo: 'admin1@flay.demo' },
  })
  const comun = { usuarioId: admin.id, consorcioId }

  const habilitar = async (usuarioId: string, rol: 'administrador' | 'consejo' | 'consorcista') => {
    if (
      !(await prismaBase.habilitacion.findFirst({
        where: { usuarioId, consorcioId, rol, vigenciaHasta: null },
      }))
    )
      await prismaBase.habilitacion.create({
        data: { usuarioId, consorcioId, rol, vigenciaDesde: fecha(1, 1) },
      })
  }
  await habilitar(admin.id, 'administrador')

  const unidades = await prismaBase.unidad.findMany({ where: { consorcioId } })
  const unidadDe = new Map(unidades.map((u) => [u.designacion, u]))

  // Personas, usuarios (con clave), habilitaciones y ocupaciones.
  const usuarioDe = new Map<string, string>() // designacion -> usuario del propietario
  const inquilinoDe = new Map<string, string>() // designacion -> usuario del inquilino
  let dni = 20_100_000
  const alta = async (
    nombre: string,
    apellido: string,
    designacion: string,
    tipo: 'propietario' | 'inquilino',
  ) => {
    const correo = `${nombre}.${apellido}`.toLowerCase() + '@flay.demo'
    const existente = await prismaBase.usuario.findUnique({ where: { correo } })
    if (existente) return existente.id
    const persona = await prismaBase.persona.create({
      data: {
        nombre,
        apellido,
        correo,
        documento: String(dni++ * 7 + 11),
        telefono: `+54 341 55${String(dni).slice(-5)}`,
      },
    })
    const usuario = await prismaBase.usuario.create({
      data: { personaId: persona.id, correo, estado: 'activo', claveDerivada },
    })
    await habilitar(usuario.id, 'consorcista')
    await prismaBase.$executeRaw`
      INSERT INTO "Ocupacion" (unidad_id, persona_id, tipo, vigencia)
      VALUES (${unidadDe.get(designacion)!.id}::uuid, ${persona.id}::uuid, ${tipo}::"TipoOcupacion", daterange(${fecha(1, 1)}::date, NULL))`
    return usuario.id
  }
  for (const [designacion, nombre, apellido, inquilino] of VECINOS) {
    usuarioDe.set(designacion, await alta(nombre, apellido, designacion, 'propietario'))
    if (inquilino)
      inquilinoDe.set(designacion, await alta(inquilino[0], inquilino[1], designacion, 'inquilino'))
  }
  await habilitar(usuarioDe.get('2A')!, 'consejo')

  const rubros = new Map(
    (await prismaBase.rubroGasto.findMany()).map((r) => [r.nombre, r.id] as const),
  )
  const rubroDe = (n: string) =>
    rubros.get(n) ??
    (() => {
      throw new Error(`Falta el rubro ${n}`)
    })()

  const proveedor = new Map<string, string>()
  for (const [razonSocial, cuit, rubro] of PROVEEDORES) {
    const e = await prismaBase.proveedor.findUnique({
      where: { consorcioId_cuit: { consorcioId, cuit } },
    })
    proveedor.set(
      cuit,
      e?.id ??
        (
          await altaProveedor(repo, relojEn(4, 1), {
            ...comun,
            razonSocial,
            cuit,
            rubroHabitualId: rubroDe(rubro),
          })
        ).proveedorId,
    )
  }

  // Seis meses de gastos, cinco liquidados con sus pagos.
  const escala = unidades.length / 12
  const mesAbierto = async (mes: number) => {
    let p = await prismaBase.periodo.findUnique({
      where: { consorcioId_anio_mes: { consorcioId, anio: ANIO, mes } },
    })
    if (!p) {
      const { periodoId } = await periodoPara(repo, relojEn(mes, 1), { ...comun, anio: ANIO, mes })
      p = await prismaBase.periodo.findUniqueOrThrow({ where: { id: periodoId } })
    }
    return p
  }
  for (const mes of [...MESES, ULTIMO]) {
    const periodo = await mesAbierto(mes)
    if (periodo.estado === 'liquidado' || periodo.estado === 'anulado') continue
    if (periodo.estado === 'abierto') {
      if ((await prismaBase.gasto.count({ where: { periodoId: periodo.id } })) === 0) {
        for (const [i, g] of GASTOS.entries()) {
          const variacion = 0.93 + ((mes * 7 + i * 3) % 10) / 70
          await registrarGasto(repo, relojEn(mes, 28), {
            ...comun,
            periodoId: periodo.id,
            rubroId: rubroDe(g.rubro),
            proveedorId: g.cuit ? proveedor.get(g.cuit) : null,
            importe: enPesos(Math.round(g.importe * escala * variacion * 100) / 100),
            fecha: fecha(mes, 1 + ((i * 3 + mes) % 26)),
            descripcion: `${g.rubro} ${String(mes).padStart(2, '0')}/${ANIO}`,
          })
        }
      }
      if (mes === ULTIMO) continue
      await cerrarPeriodo(repo, relojEn(mes + 1, 1), { ...comun, periodoId: periodo.id })
    }
    const { liquidacionId } = await liquidarPeriodo(repo, relojEn(mes + 1, 5), {
      ...comun,
      periodoId: periodo.id,
    })
    const liq = await prismaBase.liquidacion.findUniqueOrThrow({
      where: { id: liquidacionId },
      include: { detalles: { select: { unidadId: true, totalUnidad: true } } },
    })
    const totalDe = new Map(liq.detalles.map((d) => [d.unidadId, d.totalUnidad.toFixed(2)]))
    for (const u of unidades) {
      const perfil = PERFIL[u.designacion]
      if (perfil === 'nunca' || (typeof perfil === 'object' && mes > perfil.hasta)) continue
      const total = totalDe.get(u.id)
      if (!total || Number(total) <= 0) continue
      const dia = new Date(liq.vencimiento.getTime() + (perfil === 'tarde' ? 0 : -3) * 86_400_000)
      await registrarPago(repo, relojFijo(dia.toISOString()), {
        usuarioId: admin.id,
        consorcioId,
        unidadId: u.id,
        importe: perfil === 'mitad' ? enPesos(Math.round(Number(total) * 50) / 100) : total,
        fechaPago: dia,
        medio: ['transferencia', 'debito', 'efectivo'][
          u.designacion.charCodeAt(1) % 3
        ] as 'transferencia',
        referencia: `Expensas ${String(mes).padStart(2, '0')}/${ANIO}`,
      })
    }
    console.log(`Mes ${mes} liquidado.`)
  }

  // Espacios y reservas.
  const espacios = []
  for (const e of ESPACIOS) {
    espacios.push(
      await prismaBase.espacioComun.upsert({
        where: { consorcioId_nombre: { consorcioId, nombre: e.nombre } },
        update: {},
        create: { consorcioId, ...e },
      }),
    )
  }
  if ((await prismaBase.reserva.count({ where: { consorcioId } })) === 0) {
    for (const [des, esp, mes, dia, hora, horas, personas] of RESERVAS) {
      const desde = new Date(Date.UTC(ANIO, mes - 1, dia, hora + 3)) // hora argentina
      await reservar(repo, relojDelSistema, {
        usuarioId: usuarioDe.get(des)!,
        consorcioId,
        espacioId: espacios[esp].id,
        unidadId: unidadDe.get(des)!.id,
        desde,
        hasta: new Date(desde.getTime() + horas * 3_600_000),
        cantidadPersonas: personas,
        observaciones: 'Reserva de la demostracion.',
      })
    }
  }

  // Reclamos y novedades.
  if ((await prismaBase.reclamo.count({ where: { consorcioId } })) === 0) {
    for (const [des, titulo, descripcion, urgencia, recorrido] of RECLAMOS) {
      const { reclamoId } = await registrarReclamo(repo, relojDelSistema, {
        usuarioId: inquilinoDe.get(des) ?? usuarioDe.get(des)!,
        consorcioId,
        unidadId: unidadDe.get(des)!.id,
        titulo,
        descripcion,
        urgencia,
      })
      for (const hacia of recorrido)
        await transicionar(repo, relojDelSistema, {
          ...comun,
          reclamoId,
          hacia: hacia as 'asignado',
          responsableId: admin.id,
        })
    }
  }
  if ((await prismaBase.novedad.count({ where: { consorcioId } })) === 0) {
    for (const [titulo, cuerpo, fijada] of NOVEDADES)
      await publicarNovedad(repo, relojDelSistema, { ...comun, titulo, cuerpo, fijada })
  }

  // Asamblea de hoy, 18:00 hs de Rosario (21:00 UTC), convocada con la anticipacion que corresponde.
  if (!(await prismaBase.asamblea.findFirst({ where: { consorcioId, titulo: ASAMBLEA } }))) {
    const hoy = new Date()
    const reunion = new Date(
      Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate(), 21),
    )
    const antes = relojEn(10, 25)
    const { asambleaId } = await crearAsamblea(repo, antes, {
      ...comun,
      tipo: 'ordinaria',
      titulo: ASAMBLEA,
      fechaHora: reunion,
      lugar: 'SUM del edificio, planta baja',
      administracionInvitada: true,
      puntos: [
        {
          titulo: 'Aprobacion de la rendicion de cuentas de mayo a octubre',
          modalidad: 'binaria',
          mayoria: 'absoluta',
        },
        {
          titulo: 'Eleccion del presupuesto de pintura del frente',
          modalidad: 'opcion_multiple',
          opciones: ['Pinturas del Litoral', 'Fachadas Rosario', 'Postergar a 2027'],
        },
        {
          titulo: 'Impermeabilizacion de la terraza con el fondo de reserva',
          modalidad: 'binaria',
          mayoria: 'dos_tercios',
        },
      ],
    })
    await convocar(repo, antes, { ...comun, asambleaId })
    console.log('Asamblea convocada para hoy 18:00.')
  }

  // Sin proveedor de correo, los avisos a @flay.demo terminarian «agotados».
  await prismaBase.$executeRaw`
    UPDATE "TrabajoPendiente" SET estado = 'despachado', actualizado_en = now()
    WHERE tipo IN ('notificacion', 'correo_directo') AND estado = 'pendiente' AND creado_en >= ${inicio}`
  console.log('Listo.')
} finally {
  await prismaBase.$disconnect()
}
