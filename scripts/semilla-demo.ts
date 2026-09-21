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
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../pruebas/dominio/reloj-fijo'
import {
  type DefinicionConsorcio,
  sembrarJuego,
  unidadesIguales,
} from '../pruebas/fixtures/juego-13-4'

/**
 * Lo que la demostracion necesita encima del juego de § 13.4: dos edificios
 * mas, proveedores, seis meses de gastos con sus expensas liquidadas, pagos
 * (con morosos fijos para que la morosidad y los intereses muestren algo),
 * reclamos con recorrido, reservas y novedades.
 *
 * Todo lo economico sale de **los casos de uso reales** —`liquidarPeriodo`,
 * `registrarPago`— y no de filas escritas a mano: la semilla no puede tener
 * su propio prorrateo (Principio II). Por eso corre con `vite-node`, que
 * resuelve los alias `@/`.
 *
 * Deterministica e idempotente: un periodo ya liquidado se saltea con sus
 * pagos; un proveedor, reclamo o novedad ya sembrado se reconoce por su clave.
 */

const HOY = new Date('2026-01-01')
const ANIO = 2026
const MESES = [3, 4, 5, 6, 7, 8]
/** El ultimo mes queda abierto con gastos: es el que se cierra en la demo. */
const ULTIMO = MESES[MESES.length - 1]
const repo = repositorioHabilitaciones

export const EDIFICIOS: readonly DefinicionConsorcio[] = [
  {
    nombre: 'Pellegrini 1234',
    direccion: 'Carlos Pellegrini 1234',
    localidad: 'Rosario',
    cuit: '33-70000024-9',
    diaVencimiento: 10,
    tasaMoraMensual: '2.0000',
    unidades: unidadesIguales(24, 4),
  },
  {
    nombre: 'Corrientes 950',
    direccion: 'Corrientes 950',
    localidad: 'Rosario',
    cuit: '33-70000040-9',
    diaVencimiento: 12,
    tasaMoraMensual: '2.5000',
    unidades: unidadesIguales(40, 4),
  },
]

type Clave = 'C-A' | 'C-B' | 'C-C' | 'C-D'

const CONSORCISTAS: {
  nombre: string
  apellido: string
  correo: string
  consorcio: Clave
  unidad: string
}[] = [
  {
    nombre: 'Carolina',
    apellido: 'Castro',
    correo: 'vecinoc1a@flay.demo',
    consorcio: 'C-C',
    unidad: '1A',
  },
  {
    nombre: 'Pedro',
    apellido: 'Paz',
    correo: 'vecinoc3b@flay.demo',
    consorcio: 'C-C',
    unidad: '3B',
  },
  {
    nombre: 'Diego',
    apellido: 'Duarte',
    correo: 'vecinod2c@flay.demo',
    consorcio: 'C-D',
    unidad: '2C',
  },
  {
    nombre: 'Lucia',
    apellido: 'Luna',
    correo: 'vecinod5a@flay.demo',
    consorcio: 'C-D',
    unidad: '5A',
  },
]

const PROVEEDORES = [
  {
    razonSocial: 'Ascensores Litoral S.A.',
    cuit: '30-70011111-1',
    rubro: 'Mantenimiento de ascensores',
  },
  { razonSocial: 'Limpieza Total S.R.L.', cuit: '30-70022222-2', rubro: 'Limpieza' },
  {
    razonSocial: 'Empresa Provincial de la Energia',
    cuit: '30-70033333-3',
    rubro: 'Energia electrica',
  },
  { razonSocial: 'Aguas Santafesinas S.A.', cuit: '30-70044444-4', rubro: 'Agua' },
  { razonSocial: 'Seguros del Litoral', cuit: '30-70055555-5', rubro: 'Seguro del edificio' },
  { razonSocial: 'Plomeria Rosario', cuit: '20-27066666-6', rubro: 'Reparaciones menores' },
  { razonSocial: 'Fachadas del Sur S.R.L.', cuit: '30-70077777-7', rubro: 'Obra de fachada' },
]

/** Un mes tipo para doce unidades; se escala por tamaño y se mueve un poco por mes. */
const GASTOS_DEL_MES: { rubro: string; importe: number; proveedor?: string; meses?: number[] }[] = [
  { rubro: 'Sueldo del encargado', importe: 850_000 },
  { rubro: 'Cargas sociales', importe: 310_000 },
  { rubro: 'Honorarios de administracion', importe: 180_000 },
  { rubro: 'Limpieza', importe: 220_000, proveedor: '30-70022222-2' },
  { rubro: 'Energia electrica', importe: 145_000, proveedor: '30-70033333-3' },
  { rubro: 'Agua', importe: 62_000, proveedor: '30-70044444-4' },
  { rubro: 'Mantenimiento de ascensores', importe: 195_000, proveedor: '30-70011111-1' },
  { rubro: 'Seguro del edificio', importe: 98_000, proveedor: '30-70055555-5' },
  { rubro: 'Reparaciones menores', importe: 75_000, proveedor: '20-27066666-6' },
  { rubro: 'Obra de fachada', importe: 1_200_000, proveedor: '30-70077777-7', meses: [4, 7] },
]

/** Nunca pagan: morosidad, intereses y estado de cuenta tienen que mostrar algo. */
const MOROSOS: Record<Clave, string[]> = {
  'C-A': ['3B', '2C'],
  'C-B': ['3A', '7D', '11H'],
  'C-C': ['3B', '5C'],
  'C-D': ['2C', '8A', '9B'],
}

const RECLAMOS: {
  consorcio: Clave
  autor: string
  titulo: string
  descripcion: string
  urgencia: 'baja' | 'media' | 'alta' | 'critica'
  recorrido: ('asignado' | 'en_curso' | 'resuelto' | 'cerrado')[]
}[] = [
  {
    consorcio: 'C-C',
    autor: 'vecinoc1a@flay.demo',
    titulo: 'Puerta de entrada no cierra',
    descripcion: 'La puerta del hall queda abierta si no se empuja; desde el fin de semana.',
    urgencia: 'alta',
    recorrido: ['asignado', 'en_curso'],
  },
  {
    consorcio: 'C-C',
    autor: 'vecinoc3b@flay.demo',
    titulo: 'Humedad en el techo del 3B',
    descripcion: 'Mancha de humedad que crece en el dormitorio, debajo de la terraza.',
    urgencia: 'media',
    recorrido: ['asignado', 'en_curso', 'resuelto', 'cerrado'],
  },
  {
    consorcio: 'C-C',
    autor: 'vecinoc1a@flay.demo',
    titulo: 'Luz de emergencia de la escalera',
    descripcion: 'La luz de emergencia del segundo piso no enciende con el corte de luz.',
    urgencia: 'baja',
    recorrido: [],
  },
  {
    consorcio: 'C-C',
    autor: 'admin1@flay.demo',
    titulo: 'Bomba de agua hace ruido',
    descripcion: 'La bomba del tanque golpea al arrancar; lo reportaron tres vecinos.',
    urgencia: 'alta',
    recorrido: ['asignado'],
  },
  {
    consorcio: 'C-C',
    autor: 'vecinoc3b@flay.demo',
    titulo: 'Portero electrico del 3B',
    descripcion: 'No suena el timbre del portero desde hace una semana.',
    urgencia: 'media',
    recorrido: ['asignado', 'en_curso', 'resuelto'],
  },
  {
    consorcio: 'C-D',
    autor: 'vecinod2c@flay.demo',
    titulo: 'Ascensor frena entre pisos',
    descripcion: 'El ascensor de la derecha frena entre el 4 y el 5 y hay que volver a llamarlo.',
    urgencia: 'critica',
    recorrido: ['asignado', 'en_curso'],
  },
  {
    consorcio: 'C-D',
    autor: 'vecinod5a@flay.demo',
    titulo: 'Perdida de agua en cochera',
    descripcion: 'Gotea del techo de la cochera 12, encima de un auto.',
    urgencia: 'alta',
    recorrido: ['asignado', 'en_curso', 'resuelto', 'cerrado'],
  },
  {
    consorcio: 'C-D',
    autor: 'vecinod2c@flay.demo',
    titulo: 'Pintura descascarada en el palier',
    descripcion: 'El palier del 2 tiene la pintura descascarada junto al ascensor.',
    urgencia: 'baja',
    recorrido: [],
  },
  {
    consorcio: 'C-D',
    autor: 'admin1@flay.demo',
    titulo: 'Reja del patio oxidada',
    descripcion: 'La reja que da al pasillo lateral esta oxidada y suelta en la base.',
    urgencia: 'media',
    recorrido: ['asignado'],
  },
  {
    consorcio: 'C-D',
    autor: 'vecinod5a@flay.demo',
    titulo: 'Ruidos molestos de noche',
    descripcion: 'Musica alta desde el 6B casi todas las noches despues de las 23.',
    urgencia: 'media',
    recorrido: ['asignado', 'en_curso'],
  },
  {
    consorcio: 'C-A',
    autor: 'vecino1a@flay.demo',
    titulo: 'Matafuego vencido en planta baja',
    descripcion: 'La tarjeta del matafuego de la entrada dice vencido en agosto.',
    urgencia: 'alta',
    recorrido: ['asignado', 'en_curso', 'resuelto'],
  },
  {
    consorcio: 'C-B',
    autor: 'vecinob010@flay.demo',
    titulo: 'Porton del garage lento',
    descripcion: 'El porton tarda mas de un minuto en abrir y a veces se queda a mitad.',
    urgencia: 'media',
    recorrido: ['asignado'],
  },
]

const NOVEDADES: { consorcio: Clave; titulo: string; cuerpo: string; fijada?: boolean }[] = [
  {
    consorcio: 'C-A',
    titulo: 'Corte de agua programado',
    cuerpo:
      'El jueves de 9 a 13 se cambia la valvula del tanque. No va a haber agua en ese horario.',
    fijada: true,
  },
  {
    consorcio: 'C-A',
    titulo: 'Asamblea ordinaria',
    cuerpo:
      'Se convoca a asamblea ordinaria para tratar el presupuesto del proximo semestre. Primera citacion 19:00, segunda 19:30.',
  },
  {
    consorcio: 'C-B',
    titulo: 'Nuevo horario del encargado',
    cuerpo:
      'Desde el lunes el encargado atiende de 7 a 15. Fuera de ese horario, el telefono de guardia.',
    fijada: true,
  },
  {
    consorcio: 'C-B',
    titulo: 'Limpieza de tanques',
    cuerpo: 'La limpieza semestral de tanques es el sabado. Conviene juntar agua para la mañana.',
  },
  {
    consorcio: 'C-C',
    titulo: 'Obra de fachada: andamios',
    cuerpo:
      'La semana que viene se arman los andamios sobre Pellegrini. Retirar macetas y objetos de los balcones.',
    fijada: true,
  },
  {
    consorcio: 'C-C',
    titulo: 'Reserva del salon',
    cuerpo: 'El salon ya se puede reservar desde el sistema, con 48 horas de anticipacion.',
  },
  {
    consorcio: 'C-D',
    titulo: 'Recambio de luminarias',
    cuerpo: 'Se reemplazan las luces de los pasillos por LED durante esta semana, piso por piso.',
    fijada: true,
  },
  {
    consorcio: 'C-D',
    titulo: 'Bicicletero',
    cuerpo: 'Se habilito el bicicletero del subsuelo. Pedir la llave en administracion.',
  },
]

const ESPACIOS = [
  { nombre: 'Salon de usos multiples', capacidadMaxima: 40 },
  { nombre: 'Quincho', capacidadMaxima: 25 },
  { nombre: 'Terraza', capacidadMaxima: 30 },
]

/** Congruencia lineal con semilla fija, como en `semilla-volumen.mjs`. */
function generador(semilla: number) {
  let estado = semilla
  return () => {
    estado = (estado * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return estado / 4_294_967_296
  }
}

const enPesos = (n: number) => n.toFixed(2)
const fecha = (anio: number, mes: number, dia: number) => new Date(Date.UTC(anio, mes - 1, dia))
const relojEn = (anio: number, mes: number, dia: number) =>
  relojFijo(fecha(anio, mes, dia).toISOString())

export interface DemoSembrada {
  consorcios: number
  proveedores: number
  gastos: number
  liquidaciones: number
  pagos: number
  reclamos: number
  reservas: number
  novedades: number
}

export async function sembrarDemo(
  base: { 'C-A': string; 'C-B': string },
  opciones: { claveDerivada?: string } = {},
): Promise<DemoSembrada> {
  const inicio = new Date()
  const cuenta: DemoSembrada = {
    consorcios: 0,
    proveedores: 0,
    gastos: 0,
    liquidaciones: 0,
    pagos: 0,
    reclamos: 0,
    reservas: 0,
    novedades: 0,
  }

  // Los dos edificios nuevos, con el mismo generador que el juego de § 13.4.
  const juego = await sembrarJuego(prismaBase, HOY, EDIFICIOS)
  const consorcios: Record<Clave, string> = {
    ...base,
    'C-C': juego.consorcios[0].id,
    'C-D': juego.consorcios[1].id,
  }
  cuenta.consorcios = juego.consorcios.length

  // admin1 administra los cuatro; los consorcistas nuevos, su unidad.
  const admin = await prismaBase.usuario.findUniqueOrThrow({
    where: { correo: 'admin1@flay.demo' },
  })
  for (const clave of ['C-C', 'C-D'] as const) {
    await asegurarHabilitacion(admin.id, consorcios[clave], 'administrador')
  }
  const usuarios: Record<string, string> = { 'admin1@flay.demo': admin.id }
  for (const definicion of CONSORCISTAS) {
    usuarios[definicion.correo] = await asegurarConsorcista(
      definicion,
      consorcios[definicion.consorcio],
      opciones.claveDerivada,
    )
  }
  for (const correo of ['vecino1a@flay.demo', 'vecinob010@flay.demo']) {
    usuarios[correo] = (await prismaBase.usuario.findUniqueOrThrow({ where: { correo } })).id
  }

  const rubros = new Map(
    (await prismaBase.rubroGasto.findMany()).map((r) => [r.nombre, r.id] as const),
  )
  const rubroDe = (nombre: string) => {
    const id = rubros.get(nombre)
    if (!id) throw new Error(`Falta el rubro «${nombre}»: correr antes la semilla de rubros.`)
    return id
  }

  const azar = generador(13_4)

  for (const clave of Object.keys(consorcios) as Clave[]) {
    const consorcioId = consorcios[clave]
    const comun = { usuarioId: admin.id, consorcioId }
    const reloj = relojEn(ANIO, 9, 1)

    // Proveedores, idempotentes por CUIT.
    const proveedorPorCuit = new Map<string, string>()
    for (const definicion of PROVEEDORES) {
      const existente = await prismaBase.proveedor.findUnique({
        where: { consorcioId_cuit: { consorcioId, cuit: definicion.cuit } },
      })
      if (existente) {
        proveedorPorCuit.set(definicion.cuit, existente.id)
        continue
      }
      const { proveedorId } = await altaProveedor(repo, reloj, {
        ...comun,
        razonSocial: definicion.razonSocial,
        cuit: definicion.cuit,
        rubroHabitualId: rubroDe(definicion.rubro),
      })
      proveedorPorCuit.set(definicion.cuit, proveedorId)
      cuenta.proveedores++
    }

    const unidades = await prismaBase.unidad.findMany({
      where: { consorcioId },
      orderBy: { designacion: 'asc' },
    })
    const escala = unidades.length / 12
    // El consorcio grande solo tres meses: cada liquidacion encola un
    // documento por unidad y noventa y seis por mes son muchos para la cola.
    const meses = unidades.length > 50 ? MESES.slice(-3) : MESES

    for (const mes of meses) {
      let periodo = await prismaBase.periodo.findUnique({
        where: { consorcioId_anio_mes: { consorcioId, anio: ANIO, mes } },
      })
      if (!periodo) {
        const { periodoId } = await periodoPara(repo, relojEn(ANIO, mes, 1), {
          ...comun,
          anio: ANIO,
          mes,
        })
        periodo = await prismaBase.periodo.findUniqueOrThrow({ where: { id: periodoId } })
      }
      if (periodo.estado === 'liquidado' || periodo.estado === 'anulado') continue

      if (periodo.estado === 'abierto') {
        const cargados = await prismaBase.gasto.count({ where: { periodoId: periodo.id } })
        if (cargados === 0) {
          for (const gasto of GASTOS_DEL_MES) {
            if (gasto.meses && !gasto.meses.includes(mes)) continue
            const variacion = 0.9 + azar() * 0.25
            await registrarGasto(repo, relojEn(ANIO, mes, 28), {
              ...comun,
              periodoId: periodo.id,
              rubroId: rubroDe(gasto.rubro),
              proveedorId: gasto.proveedor ? proveedorPorCuit.get(gasto.proveedor) : null,
              importe: enPesos(Math.round(gasto.importe * escala * variacion * 100) / 100),
              fecha: fecha(ANIO, mes, 1 + Math.floor(azar() * 27)),
              descripcion: `${gasto.rubro} ${String(mes).padStart(2, '0')}/${ANIO}`,
            })
            cuenta.gastos++
          }
        }
        if (mes === ULTIMO) continue
        await cerrarPeriodo(repo, relojEn(ANIO, mes + 1, 1), { ...comun, periodoId: periodo.id })
      }

      // Emitida a principios del mes siguiente, como en la vida real: el
      // interes de los impagos se calcula a esa fecha y no a la de hoy.
      const emision = relojEn(ANIO, mes + 1, 5)
      const emitida = await liquidarPeriodo(repo, emision, { ...comun, periodoId: periodo.id })
      cuenta.liquidaciones++

      cuenta.pagos += await pagar(clave, consorcioId, admin.id, emitida.liquidacionId, unidades)
    }

    // Espacios y reservas, solo hacia adelante y con el reloj de verdad: la
    // anticipacion minima y maxima se miden contra hoy.
    if (clave === 'C-C' || clave === 'C-D') {
      for (const espacio of ESPACIOS) {
        await prismaBase.espacioComun.upsert({
          where: { consorcioId_nombre: { consorcioId, nombre: espacio.nombre } },
          update: {},
          create: { consorcioId, ...espacio },
        })
      }
    }
    cuenta.reservas += await reservarFuturas(consorcioId, admin.id, unidades)
  }

  for (const definicion of RECLAMOS) {
    const consorcioId = consorcios[definicion.consorcio]
    if (await prismaBase.reclamo.findFirst({ where: { consorcioId, titulo: definicion.titulo } }))
      continue
    const autor = usuarios[definicion.autor]
    const unidad =
      CONSORCISTAS.find((c) => c.correo === definicion.autor)?.unidad ??
      (definicion.autor === 'vecino1a@flay.demo' ? '1A' : null) ??
      (definicion.autor === 'vecinob010@flay.demo' ? '2B' : null)
    const { reclamoId } = await registrarReclamo(repo, relojDelSistema, {
      usuarioId: autor,
      consorcioId,
      unidadId: unidad
        ? (
            await prismaBase.unidad.findUniqueOrThrow({
              where: { consorcioId_designacion: { consorcioId, designacion: unidad } },
            })
          ).id
        : null,
      titulo: definicion.titulo,
      descripcion: definicion.descripcion,
      urgencia: definicion.urgencia,
    })
    for (const hacia of definicion.recorrido) {
      await transicionar(repo, relojDelSistema, {
        usuarioId: admin.id,
        consorcioId,
        reclamoId,
        hacia,
        responsableId: admin.id,
      })
    }
    cuenta.reclamos++
  }

  for (const definicion of NOVEDADES) {
    const consorcioId = consorcios[definicion.consorcio]
    if (await prismaBase.novedad.findFirst({ where: { consorcioId, titulo: definicion.titulo } }))
      continue
    await publicarNovedad(repo, relojDelSistema, {
      usuarioId: admin.id,
      consorcioId,
      titulo: definicion.titulo,
      cuerpo: definicion.cuerpo,
      fijada: definicion.fijada ?? false,
    })
    cuenta.novedades++
  }

  // Liquidar y publicar encolan avisos por correo a direcciones `@flay.demo`:
  // sin proveedor de correo terminarian «agotados» en la bandeja. Se dan por
  // despachados; los avisos en pantalla quedan igual.
  await prismaBase.$executeRaw`
    UPDATE "TrabajoPendiente" SET estado = 'despachado', actualizado_en = now()
    WHERE tipo = 'notificacion' AND estado = 'pendiente' AND creado_en >= ${inicio}
  `

  return cuenta
}

/**
 * Los pagos de una liquidacion recien emitida. Por posicion de la unidad en el
 * padron: los morosos nunca; una de cada diez paga la mitad; otra paga tarde
 * (y en la siguiente liquidacion aparece el interes); el resto paga entera y
 * a tiempo.
 */
async function pagar(
  clave: Clave,
  consorcioId: string,
  usuarioId: string,
  liquidacionId: string,
  unidades: { id: string; designacion: string }[],
): Promise<number> {
  const liquidacion = await prismaBase.liquidacion.findUniqueOrThrow({
    where: { id: liquidacionId },
    include: { detalles: { select: { unidadId: true, totalUnidad: true } } },
  })
  const totalDe = new Map(liquidacion.detalles.map((d) => [d.unidadId, d.totalUnidad.toFixed(2)]))
  const vence = liquidacion.vencimiento
  let pagos = 0

  for (const [indice, unidad] of unidades.entries()) {
    if (MOROSOS[clave].includes(unidad.designacion)) continue
    const total = totalDe.get(unidad.id)
    if (!total || Number(total) <= 0) continue

    const tarde = indice % 10 === 7
    const parcial = indice % 10 === 3
    const dia = new Date(vence.getTime() + (tarde ? 12 : -3) * 86_400_000)
    const importe = parcial ? enPesos(Math.round(Number(total) * 50) / 100) : total

    await registrarPago(repo, relojFijo(dia.toISOString()), {
      usuarioId,
      consorcioId,
      unidadId: unidad.id,
      importe,
      fechaPago: dia,
      medio: indice % 3 === 0 ? 'transferencia' : indice % 3 === 1 ? 'debito' : 'efectivo',
      referencia: `Expensas ${String(liquidacion.vencimiento.getUTCMonth()).padStart(2, '0')}/${ANIO}`,
    })
    pagos++
  }
  return pagos
}

/** Tres reservas por consorcio en los proximos sabados, para unidades al dia. */
async function reservarFuturas(
  consorcioId: string,
  usuarioId: string,
  unidades: { id: string; designacion: string }[],
): Promise<number> {
  const espacios = await prismaBase.espacioComun.findMany({ where: { consorcioId, activo: true } })
  const ahora = relojDelSistema.ahora()
  const yaHay = await prismaBase.reserva.count({
    where: { consorcioId, desde: { gt: ahora }, estado: 'confirmada' },
  })
  if (yaHay > 0 || espacios.length === 0) return 0

  // Primer sabado a mas de 48 h, y los dos siguientes.
  const sabado = new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 3),
  )
  while (sabado.getUTCDay() !== 6) sabado.setUTCDate(sabado.getUTCDate() + 1)

  const alDia = ['1A', '2A', '1B'].map((d) => unidades.find((u) => u.designacion === d))
  let reservas = 0
  for (const [i, unidad] of alDia.entries()) {
    if (!unidad) continue
    const espacio = espacios[i % espacios.length]
    const desde = new Date(sabado.getTime() + i * 7 * 86_400_000 + 17 * 3_600_000)
    await reservar(repo, relojDelSistema, {
      usuarioId,
      consorcioId,
      espacioId: espacio.id,
      unidadId: unidad.id,
      desde,
      hasta: new Date(desde.getTime() + 5 * 3_600_000),
      cantidadPersonas: 12 + i * 4,
      observaciones: 'Reserva del juego de demostracion.',
    })
    reservas++
  }
  return reservas
}

async function asegurarHabilitacion(
  usuarioId: string,
  consorcioId: string,
  rol: 'administrador' | 'consejo' | 'consorcista',
): Promise<void> {
  const vigente = await prismaBase.habilitacion.findFirst({
    where: { usuarioId, consorcioId, rol, vigenciaHasta: null },
  })
  if (!vigente) {
    await prismaBase.habilitacion.create({
      data: { usuarioId, consorcioId, rol, vigenciaDesde: HOY },
    })
  }
}

/** Mismo alta que `servicios-13-4.ts`: persona, usuario, habilitacion y ocupacion. */
async function asegurarConsorcista(
  definicion: (typeof CONSORCISTAS)[number],
  consorcioId: string,
  claveDerivada?: string,
): Promise<string> {
  const existente = await prismaBase.usuario.findUnique({ where: { correo: definicion.correo } })
  if (existente) {
    if (claveDerivada) {
      await prismaBase.usuario.update({
        where: { id: existente.id },
        data: { claveDerivada, estado: 'activo', bloqueadoHasta: null },
      })
    }
    return existente.id
  }
  const persona = await prismaBase.persona.create({
    data: { nombre: definicion.nombre, apellido: definicion.apellido, correo: definicion.correo },
  })
  const usuario = await prismaBase.usuario.create({
    data: claveDerivada
      ? { personaId: persona.id, correo: definicion.correo, estado: 'activo', claveDerivada }
      : { personaId: persona.id, correo: definicion.correo, estado: 'invitado' },
  })
  await asegurarHabilitacion(usuario.id, consorcioId, 'consorcista')
  const unidad = await prismaBase.unidad.findUniqueOrThrow({
    where: { consorcioId_designacion: { consorcioId, designacion: definicion.unidad } },
  })
  await prismaBase.$executeRaw`
    INSERT INTO "Ocupacion" (unidad_id, persona_id, tipo, vigencia)
    VALUES (${unidad.id}::uuid, ${persona.id}::uuid, 'propietario'::"TipoOcupacion", daterange(${HOY}::date, NULL))
  `
  return usuario.id
}
