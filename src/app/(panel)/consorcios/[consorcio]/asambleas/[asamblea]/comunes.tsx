import { Decimal } from '@/compartido/dinero'
import { coeficienteParaMostrar } from '@/compartido/formato'
import type { ConteoVista, PuntoVista, VistaAsamblea } from '@/aplicacion/asambleas/ver'

/** Los dos campos que toda acción de la asamblea necesita. */
export function Ocultos({ vista }: { vista: Pick<VistaAsamblea, 'consorcioId' | 'id'> }) {
  return (
    <>
      <input type="hidden" name="consorcio" value={vista.consorcioId} />
      <input type="hidden" name="asamblea" value={vista.id} />
    </>
  )
}

export const ETIQUETA_SENTIDO = {
  positivo: 'Positivo',
  negativo: 'Negativo',
  abstencion: 'Abstención',
} as const

export const ETIQUETA_MAYORIA = {
  absoluta: 'Mayoría absoluta',
  dos_tercios: 'Dos tercios',
  unanimidad: 'Unanimidad',
} as const

/** Opciones del punto con su clave de conteo: los tres sentidos o las opciones cargadas. */
export function opcionesDe(punto: PuntoVista): { clave: string; texto: string }[] {
  return punto.modalidad === 'binaria'
    ? (['positivo', 'negativo', 'abstencion'] as const).map((k) => ({
        clave: k,
        texto: ETIQUETA_SENTIDO[k],
      }))
    : punto.opciones.map((o) => ({ clave: o.id, texto: o.texto }))
}

/** Ancho de barra en `%`, sin pasar por `number`: es un coeficiente, no se redondea antes. */
const ancho = (parte: string, total: string): string => {
  const base = new Decimal(total)
  return base.lessThanOrEqualTo(0) ? '0%' : `${new Decimal(parte).div(base).times(100).toFixed(2)}%`
}

/** El conteo de un punto, en unidades y en coeficientes, contra la base de presentes con voto. */
export function TablaConteo({ punto, conteo }: { punto: PuntoVista; conteo: ConteoVista }) {
  const base = conteo.basePresentes
  return (
    <div className="conteo" aria-live="polite">
      {opcionesDe(punto).map(({ clave, texto }) => {
        const cuenta = conteo.porOpcion[clave] ?? { unidades: 0, coeficiente: '0' }
        return (
          <div key={clave} className="conteo__fila">
            <div className="conteo__titulo">
              <span>{texto}</span>
              <span className="apagado">
                {cuenta.unidades} {cuenta.unidades === 1 ? 'unidad' : 'unidades'} ·{' '}
                {coeficienteParaMostrar(cuenta.coeficiente)} %
              </span>
            </div>
            <div className="progreso__barra" aria-hidden="true">
              <div
                className="progreso__relleno"
                style={{ width: ancho(cuenta.coeficiente, base.coeficiente) }}
              />
            </div>
          </div>
        )
      })}
      <p className="progreso__texto">
        Base: {base.unidades} {base.unidades === 1 ? 'unidad presente' : 'unidades presentes'} con
        voto, {coeficienteParaMostrar(base.coeficiente)} % de los coeficientes.
      </p>
    </div>
  )
}

export function textoResultado(p: PuntoVista): string {
  if (p.resultado === 'aprobado') {
    return p.modalidad === 'opcion_multiple' && p.opcionGanadora
      ? `Aprobada: ${p.opcionGanadora}`
      : 'Aprobado'
  }
  if (p.resultado === 'rechazado') return 'Rechazado'
  if (p.resultado === 'sin_decision') return 'Sin decisión'
  return ''
}

export const ETIQUETA_DECISION = {
  firme: 'Firme',
  provisoria: 'Provisoria',
  caida: 'Caída por oposición',
} as const
