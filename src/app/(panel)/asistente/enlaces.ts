import type { EnlaceDeDatos } from '@/aplicacion/asistente/conversar'

/**
 * A que pantalla lleva cada lectura del asistente (RF-27). La ruta es cosa de
 * presentacion; sin `'use client'` para poder importarse desde el widget.
 * Sin entrada = la lectura no tiene pantalla propia y no se dibuja enlace.
 */

type Destino = { href: string; titulo: string }

const FIJAS: Record<string, [ruta: string, titulo: string]> = {
  ver_resumen: ['', 'Resumen'],
  ver_expensas: ['expensas', 'Expensas'],
  ver_morosidad: ['morosidad', 'Morosidad'],
  ver_gastos: ['gastos', 'Gastos'],
  ver_extracciones: ['gastos/asistida', 'Carga asistida'],
  ver_periodos: ['periodos', 'Períodos'],
  ver_reclamos: ['reclamos', 'Reclamos'],
  ver_reservas: ['reservas', 'Reservas'],
  ver_historial_reservas: ['reservas/historial', 'Historial de reservas'],
  ver_espacios: ['espacios', 'Espacios'],
  ver_suspensiones: ['espacios', 'Espacios'],
  ver_novedades: ['novedades', 'Novedades'],
  ver_documentos: ['documentos', 'Documentación'],
  ver_padron: ['unidades', 'Unidades'],
  ver_usuarios: ['usuarios', 'Usuarios'],
  ver_proveedores: ['proveedores', 'Proveedores'],
  ver_indicador_morosidad: ['indicadores/morosidad', 'Indicadores'],
  ver_indicador_gastos: ['indicadores/gastos', 'Indicadores'],
  ver_indicador_proveedores: ['indicadores/proveedores', 'Indicadores'],
  ver_indicador_reclamos: ['indicadores/reclamos', 'Indicadores'],
  ver_indicador_carga: ['indicadores/carga', 'Indicadores'],
}

/** Lecturas con id: [ruta, argumento, titulo]. */
const CON_ID: Record<string, [ruta: string, arg: string, titulo: string]> = {
  ver_expensa: ['expensas', 'detalleId', 'la expensa'],
  ver_gasto: ['gastos', 'gastoId', 'el gasto'],
  ver_extraccion: ['gastos/asistida', 'extraccionId', 'la carga asistida'],
  ver_vista_previa_liquidacion: ['periodos', 'periodoId', 'el período'],
  ver_liquidacion: ['liquidaciones', 'liquidacionId', 'la liquidación'],
  ver_reclamo: ['reclamos', 'reclamoId', 'el reclamo'],
  ver_documento: ['documentos', 'documentoId', 'el documento'],
}

const FUERA_DEL_CONSORCIO: Record<string, Destino> = {
  listar_mis_consorcios: { href: '/consorcios', titulo: 'Mis consorcios' },
  ver_mis_administradoras: { href: '/consorcios', titulo: 'Mis consorcios' },
  ver_panel_cartera: { href: '/consorcios', titulo: 'Mis consorcios' },
  ver_bandeja: { href: '/bandeja', titulo: 'Bandeja' },
}

export function destinoDe(e: EnlaceDeDatos): Destino | null {
  const afuera = FUERA_DEL_CONSORCIO[e.herramienta]
  if (afuera) return afuera
  const base = `/consorcios/${e.consorcioId}`
  const fija = FIJAS[e.herramienta]
  if (fija) return { href: fija[0] ? `${base}/${fija[0]}` : base, titulo: fija[1] }
  const conId = CON_ID[e.herramienta]
  if (conId) {
    const id = e.argumentos[conId[1]]
    return typeof id === 'string' && id
      ? { href: `${base}/${conId[0]}/${encodeURIComponent(id)}`, titulo: conId[2] }
      : null
  }
  if (e.herramienta === 'ver_estado_cuenta') {
    const u = e.argumentos.unidadId
    return typeof u === 'string' && u
      ? { href: `${base}/pagos?unidad=${encodeURIComponent(u)}`, titulo: 'Pagos' }
      : { href: `${base}/pagos`, titulo: 'Pagos' }
  }
  return null
}

/** «ver_reclamos» → «Reclamos»; sin pantalla propia, null. Para decir en que paso va el asistente. */
export function tituloDe(herramienta: string): string | null {
  return (
    FIJAS[herramienta]?.[1] ??
    CON_ID[herramienta]?.[2] ??
    FUERA_DEL_CONSORCIO[herramienta]?.titulo ??
    (herramienta === 'ver_estado_cuenta' ? 'Pagos' : null)
  )
}
