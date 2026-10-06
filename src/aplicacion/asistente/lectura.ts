import { z } from 'zod'

import { conAutorizacion } from '@/aplicacion/autorizacion'
import { misAdministradoras } from '@/aplicacion/administradoras/mis-administradoras'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { verResumenConsorcio } from '@/aplicacion/consorcios/resumen'
import { consultarDocumentacion } from '@/aplicacion/comunicacion/consultar'
import { listarDocumentos, verDocumento } from '@/aplicacion/comunicacion/documentos'
import { misNotificaciones } from '@/aplicacion/comunicacion/mis-notificaciones'
import { destinatariosPosibles, listarNovedades } from '@/aplicacion/comunicacion/novedades'
import { listarExtracciones, verExtraccion } from '@/aplicacion/gastos/extraccion'
import { listarGastos } from '@/aplicacion/gastos/listar-gastos'
import { verGasto } from '@/aplicacion/gastos/ver-gasto'
import {
  verCargaAdministrativa,
  verGastoPorRubro,
  verMorosidad as verMorosidadIndicador,
  verPanel,
  verProveedores as verDesempenoProveedores,
  verResolucionReclamos,
} from '@/aplicacion/indicadores/indicadores'
import { previsualizarLiquidacion } from '@/aplicacion/liquidacion/liquidar'
import { verLiquidacion } from '@/aplicacion/liquidacion/ver-liquidacion'
import { misExpensas, verExpensa } from '@/aplicacion/liquidacion/ver-expensa'
import { verEstadoDeCuenta, verMorosidad } from '@/aplicacion/pagos/estado-de-cuenta'
import { verBandeja } from '@/aplicacion/pendientes/bandeja'
import { listarPeriodos } from '@/aplicacion/periodos/periodos'
import { listarProveedores, listarRubros } from '@/aplicacion/proveedores/proveedores'
import { posiblesResponsables } from '@/aplicacion/reclamos/asignar'
import { listarReclamos, verReclamo } from '@/aplicacion/reclamos/consultar'
import { unidadesParaReclamar } from '@/aplicacion/reclamos/registrar'
import { listarEspacios, suspensionesEnRango } from '@/aplicacion/reservas/espacios'
import {
  historialDeReservas,
  listarReservas,
  unidadesParaReservar,
} from '@/aplicacion/reservas/reservar'
import { listarUsuarios } from '@/aplicacion/identidad/listar-usuarios'
import {
  DIA,
  aFecha,
  generico,
  vacio,
  type ContextoHerramienta,
  type Herramienta,
  type ResultadoHerramienta,
} from '@/aplicacion/asistente/base'

/**
 * Lecturas del asistente (RF-27): una por cada pantalla de lectura de la
 * interfaz. Cada una llama al caso de uso que la pagina llama, con los mismos
 * filtros; el rol, la ocupacion y el consorcio ya los recorta el caso de uso.
 */

const T = { type: 'string' }
const ID = z.string().min(1)
const Libre = z.object({}).passthrough()

type Fn = (a: Record<string, unknown>, ctx: ContextoHerramienta) => Promise<unknown>

function lec(
  nombre: string,
  descripcion: string,
  roles: Herramienta['roles'],
  fn: Fn,
  props: Record<string, unknown> = {},
  requeridos: string[] = [],
  validar: z.ZodTypeAny = Libre,
  sinConsorcio = false,
): Herramienta {
  return {
    nombre,
    descripcion,
    parametros:
      Object.keys(props).length === 0
        ? vacio
        : { type: 'object', properties: props, required: requeridos },
    validar,
    roles,
    escritura: false,
    sinConsorcio,
    async ejecutar(args, ctx): Promise<ResultadoHerramienta> {
      return generico(await fn(args as Record<string, unknown>, ctx))
    },
  }
}

const quien = (c: ContextoHerramienta) => ({ usuarioId: c.usuarioId, consorcioId: c.consorcioId })
const ADMIN = ['administrador'] as const
const PRIV = ['administrador', 'consejo'] as const
const rangoDe = (a: Record<string, unknown>, c: ContextoHerramienta, dias: number) => ({
  desde: a.desde ? aFecha(a.desde) : c.reloj.ahora(),
  hasta: a.hasta ? aFecha(a.hasta) : new Date(c.reloj.ahora().getTime() + dias * DIA),
})
const RANGO = {
  desde: { type: 'string', description: 'ISO' },
  hasta: { type: 'string', description: 'ISO' },
}
const ZRANGO = { desde: z.string().optional(), hasta: z.string().optional() }

export const lectura: Herramienta[] = [
  // —— Fuera de un consorcio concreto ——
  lec(
    'listar_mis_consorcios',
    'Lista los consorcios que el usuario puede ver.',
    'todos',
    (_a, c) => misConsorcios(c.repositorio, c.reloj, c.usuarioId),
    {},
    [],
    Libre,
    true,
  ),
  lec(
    'ver_mis_administradoras',
    'Lista las administradoras del usuario.',
    'todos',
    (_a, c) => misAdministradoras(c.repositorio, c.reloj, c.usuarioId),
    {},
    [],
    Libre,
    true,
  ),
  lec(
    'ver_panel_cartera',
    'Panel consolidado de todos los consorcios que administra.',
    ADMIN,
    (_a, c) => verPanel(c.repositorio, c.reloj, { usuarioId: c.usuarioId }),
    {},
    [],
    Libre,
    true,
  ),
  lec(
    'ver_bandeja',
    'Bandeja: reclamos y períodos pendientes de los consorcios que administra.',
    ADMIN,
    (_a, c) => verBandeja(c.repositorio, c.reloj, { usuarioId: c.usuarioId }),
    {},
    [],
    Libre,
    true,
  ),
  lec(
    'ver_mis_notificaciones',
    'Notificaciones del usuario.',
    'todos',
    (_a, c) => misNotificaciones(c.usuarioId),
    {},
    [],
    Libre,
    true,
  ),

  // —— Reservas y espacios ——
  lec('ver_espacios', 'Espacios comunes con sus reglas y si están habilitados.', 'todos', (_a, c) =>
    listarEspacios(c.repositorio, c.reloj, { ...quien(c), incluirInactivos: true }),
  ),
  lec(
    'ver_reservas',
    'Reservas de espacios en un rango (ISO). Por defecto, 60 días.',
    'todos',
    (a, c) =>
      listarReservas(c.repositorio, c.reloj, {
        ...quien(c),
        ...rangoDe(a, c, 60),
        espacioId: a.espacioId as string | undefined,
      }),
    { ...RANGO, espacioId: T },
    [],
    z.object({ ...ZRANGO, espacioId: z.string().optional() }),
  ),
  lec('ver_mis_unidades', 'Unidades para las que el usuario puede reservar.', 'todos', (_a, c) =>
    unidadesParaReservar(c.repositorio, c.reloj, quien(c)),
  ),
  lec(
    'ver_unidades_para_reclamar',
    'Unidades sobre las que el usuario puede reclamar.',
    'todos',
    (_a, c) => unidadesParaReclamar(c.repositorio, c.reloj, quien(c)),
  ),
  lec(
    'ver_historial_reservas',
    'Historial de reservas con quién reservó (administrador).',
    ADMIN,
    (a, c) =>
      historialDeReservas(c.repositorio, c.reloj, {
        ...quien(c),
        desde: a.desde ? aFecha(a.desde) : new Date(c.reloj.ahora().getTime() - 90 * DIA),
        hasta: a.hasta ? aFecha(a.hasta) : new Date(c.reloj.ahora().getTime() + 90 * DIA),
        espacioId: a.espacioId as string | undefined,
        unidadId: a.unidadId as string | undefined,
      }),
    { ...RANGO, espacioId: T, unidadId: T },
    [],
    z.object({ ...ZRANGO, espacioId: z.string().optional(), unidadId: z.string().optional() }),
  ),
  lec(
    'ver_suspensiones',
    'Tramos en que un espacio estuvo deshabilitado (administrador).',
    ADMIN,
    (a, c) =>
      suspensionesEnRango(c.repositorio, c.reloj, {
        ...quien(c),
        desde: a.desde ? aFecha(a.desde) : new Date(c.reloj.ahora().getTime() - 90 * DIA),
        hasta: a.hasta ? aFecha(a.hasta) : new Date(c.reloj.ahora().getTime() + 90 * DIA),
        espacioId: a.espacioId as string | undefined,
      }),
    { ...RANGO, espacioId: T },
    [],
    z.object({ ...ZRANGO, espacioId: z.string().optional() }),
  ),

  // —— Expensas, pagos y morosidad ——
  lec(
    'ver_expensas',
    'Expensas de las unidades que el usuario puede ver, con saldo y estado.',
    'todos',
    (_a, c) => misExpensas(c.almacen, c.repositorio, c.reloj, quien(c)),
  ),
  lec(
    'ver_expensa',
    'Una expensa por detalleId.',
    'todos',
    (a, c) =>
      verExpensa(c.almacen, c.repositorio, c.reloj, {
        ...quien(c),
        detalleId: String(a.detalleId),
      }),
    { detalleId: T },
    ['detalleId'],
    z.object({ detalleId: ID }),
  ),
  lec(
    'ver_estado_cuenta',
    'Estado de cuenta (movimientos y saldo) de una unidad.',
    'todos',
    (a, c) =>
      verEstadoDeCuenta(c.repositorio, c.reloj, { ...quien(c), unidadId: String(a.unidadId) }),
    { unidadId: T },
    ['unidadId'],
    z.object({ unidadId: ID }),
  ),
  lec(
    'ver_morosidad',
    'Morosidad del consorcio: agregada para el consorcista, nominada para administrador y consejo.',
    'todos',
    (_a, c) => verMorosidad(c.repositorio, c.reloj, quien(c)),
  ),
  lec(
    'ver_periodos',
    'Períodos del consorcio con su estado, gastos y liquidación.',
    'todos',
    (_a, c) => listarPeriodos(c.repositorio, c.reloj, quien(c)),
  ),
  lec(
    'ver_liquidacion',
    'Una liquidación emitida, con el detalle por unidad (administrador y consejo).',
    PRIV,
    (a, c) =>
      verLiquidacion(c.repositorio, c.reloj, {
        ...quien(c),
        liquidacionId: String(a.liquidacionId),
      }),
    { liquidacionId: T },
    ['liquidacionId'],
    z.object({ liquidacionId: ID }),
  ),
  lec(
    'ver_vista_previa_liquidacion',
    'Vista previa de la liquidación de un período (administrador).',
    ADMIN,
    (a, c) =>
      previsualizarLiquidacion(c.repositorio, c.reloj, {
        ...quien(c),
        periodoId: String(a.periodoId),
      }),
    { periodoId: T },
    ['periodoId'],
    z.object({ periodoId: ID }),
  ),

  // —— Consorcio y unidades ——
  lec(
    'ver_resumen',
    'Resumen del consorcio: lo que el usuario ve en su tablero.',
    'todos',
    (_a, c) => verResumenConsorcio(c.repositorio, c.reloj, quien(c)),
  ),
  lec(
    'ver_padron',
    'Datos del consorcio y padrón de unidades con coeficientes (administrador y consejo).',
    PRIV,
    (_a, c) => verConsorcio(c.repositorio, c.reloj, quien(c)),
  ),
  lec('ver_usuarios', 'Usuarios del consorcio y su estado (administrador).', ADMIN, (_a, c) =>
    listarUsuarios(c.repositorio, c.reloj, quien(c)),
  ),

  // —— Gastos, proveedores y carga asistida ——
  lec(
    'ver_gastos',
    'Gastos del edificio, con filtros opcionales.',
    'todos',
    (a, c) =>
      listarGastos(c.repositorio, c.reloj, {
        ...quien(c),
        periodoId: a.periodoId as string | undefined,
        rubroId: a.rubroId as string | undefined,
        clasificacion: a.clasificacion as 'ordinario' | 'extraordinario' | undefined,
        pagina: a.pagina as number | undefined,
      }),
    {
      periodoId: T,
      rubroId: T,
      clasificacion: { type: 'string', enum: ['ordinario', 'extraordinario'] },
      pagina: { type: 'integer' },
    },
    [],
    z.object({
      periodoId: z.string().optional(),
      rubroId: z.string().optional(),
      clasificacion: z.enum(['ordinario', 'extraordinario']).optional(),
      pagina: z.number().int().positive().optional(),
    }),
  ),
  lec(
    'ver_gasto',
    'Un gasto con sus comprobantes.',
    'todos',
    (a, c) =>
      verGasto(c.almacen, c.repositorio, c.reloj, { ...quien(c), gastoId: String(a.gastoId) }),
    { gastoId: T },
    ['gastoId'],
    z.object({ gastoId: ID }),
  ),
  lec('ver_proveedores', 'Proveedores del consorcio.', 'todos', (_a, c) =>
    listarProveedores(c.repositorio, c.reloj, quien(c)),
  ),
  lec('ver_rubros', 'Rubros de gasto.', 'todos', () => listarRubros()),
  lec('ver_extracciones', 'Comprobantes en carga asistida (administrador).', ADMIN, (_a, c) =>
    listarExtracciones(c.repositorio, c.reloj, quien(c)),
  ),
  lec(
    'ver_extraccion',
    'Una carga asistida con los datos propuestos (administrador).',
    ADMIN,
    (a, c) =>
      verExtraccion(c.almacen, c.repositorio, c.reloj, {
        ...quien(c),
        extraccionId: String(a.extraccionId),
      }),
    { extraccionId: T },
    ['extraccionId'],
    z.object({ extraccionId: ID }),
  ),

  // —— Reclamos ——
  lec(
    'ver_reclamos',
    'Reclamos que el usuario puede ver (propios y generales; todos, si administra).',
    'todos',
    (a, c) => listarReclamos(c.repositorio, c.reloj, { ...quien(c), estado: a.estado as never }),
    {
      estado: {
        type: 'string',
        enum: ['abierto', 'asignado', 'en_curso', 'resuelto', 'cerrado', 'rechazado'],
      },
    },
    [],
    z.object({
      estado: z
        .enum(['abierto', 'asignado', 'en_curso', 'resuelto', 'cerrado', 'rechazado'])
        .optional(),
    }),
  ),
  lec(
    'ver_reclamo',
    'Detalle e historial de un reclamo.',
    'todos',
    (a, c) => verReclamo(c.repositorio, c.reloj, { ...quien(c), reclamoId: String(a.reclamoId) }),
    { reclamoId: T },
    ['reclamoId'],
    z.object({ reclamoId: ID }),
  ),
  lec(
    'ver_responsables',
    'Personas que pueden ser responsables de un reclamo (administrador).',
    ADMIN,
    (_a, c) =>
      conAutorizacion(
        c.repositorio,
        c.reloj,
        { ...quien(c), rolesPermitidos: ADMIN, accion: 'ver responsables' },
        async () => posiblesResponsables(c.consorcioId),
      ),
  ),

  // —— Novedades y documentos ——
  lec(
    'ver_novedades',
    'Novedades del consorcio que el usuario puede ver.',
    'todos',
    (a, c) =>
      listarNovedades(c.repositorio, c.reloj, {
        ...quien(c),
        soloVigentes: a.soloVigentes === true,
      }),
    { soloVigentes: { type: 'boolean' } },
    [],
    z.object({ soloVigentes: z.boolean().optional() }),
  ),
  lec(
    'ver_destinatarios',
    'Unidades, divisiones y pisos del padrón para dirigir una novedad (administrador).',
    ADMIN,
    (_a, c) => destinatariosPosibles(c.repositorio, c.reloj, quien(c)),
  ),
  lec(
    'ver_documentos',
    'Documentos del consorcio (reglamentos, actas, contratos).',
    'todos',
    (_a, c) => listarDocumentos(c.repositorio, c.reloj, quien(c)),
  ),
  lec(
    'ver_documento',
    'Un documento por documentoId.',
    'todos',
    (a, c) =>
      verDocumento(c.almacen, c.repositorio, c.reloj, {
        ...quien(c),
        documentoId: String(a.documentoId),
      }),
    { documentoId: T },
    ['documentoId'],
    z.object({ documentoId: ID }),
  ),

  // —— Indicadores ——
  lec(
    'ver_indicador_morosidad',
    'Evolución mensual de la morosidad (administrador y consejo).',
    PRIV,
    (_a, c) => verMorosidadIndicador(c.repositorio, c.reloj, quien(c)),
  ),
  lec(
    'ver_indicador_gastos',
    'Gasto por rubro y desvíos (administrador y consejo).',
    PRIV,
    (_a, c) => verGastoPorRubro(c.repositorio, c.reloj, quien(c)),
  ),
  lec('ver_indicador_proveedores', 'Desempeño de proveedores (administrador).', ADMIN, (_a, c) =>
    verDesempenoProveedores(c.repositorio, c.reloj, quien(c)),
  ),
  lec(
    'ver_indicador_reclamos',
    'Tiempo de resolución de reclamos (administrador y consejo).',
    PRIV,
    (_a, c) => verResolucionReclamos(c.repositorio, c.reloj, quien(c)),
  ),
  lec('ver_indicador_carga', 'Carga administrativa (administrador).', ADMIN, (_a, c) =>
    verCargaAdministrativa(c.repositorio, c.reloj, quien(c)),
  ),

  // —— Documentacion (RAG) ——
  {
    nombre: 'consultar_reglamentos',
    descripcion:
      'Responde una pregunta sobre el reglamento, actas o contratos del consorcio, citando la fuente. Si no hay respaldo, lo dice.',
    parametros: { type: 'object', properties: { pregunta: T }, required: ['pregunta'] },
    validar: z.object({ pregunta: z.string().min(3) }),
    roles: 'todos',
    escritura: false,
    async ejecutar(args, ctx) {
      const r = await consultarDocumentacion(ctx.asistencia, ctx.repositorio, ctx.reloj, {
        ...quien(ctx),
        pregunta: (args as { pregunta: string }).pregunta,
      })
      const texto =
        r.modo === 'respuesta'
          ? r.respuesta
          : r.modo === 'sin_respaldo'
            ? 'No lo encontré en la documentación cargada del consorcio.'
            : `No puedo consultar la documentación en este momento: ${r.motivo}`
      return {
        paraUI: r,
        paraModelo: { modo: r.modo },
        citas: r.modo === 'respuesta' ? r.citas : [],
        terminal: true,
        textoUI: texto,
      }
    },
  },
]
