import { BadgeCheck, Circle, CircleDot, Siren, type LucideIcon } from 'lucide-react'

/**
 * La base guarda `abierto`/`cerrado`/`liquidado`/`anulado` en minúsculas; en
 * pantalla van con mayúscula inicial y `.etiqueta` (guía §3.4). Abierto es el
 * estado de trabajo (ámbar, admite gastos; sin triángulo, que no es una
 * alerta), Cerrado espera (gris), Liquidado cierra (verde), Anulado advierte
 * (rojo). El icono reutiliza la escala de urgencias de la guía
 * §3.2 con el mismo color: color + icono + palabra, nunca color solo.
 * Solo presentación.
 *
 * Vive acá y no en `periodos/` porque Expensas muestra la misma pastilla sobre
 * la misma lista de períodos: dos copias se despintan la una de la otra.
 */
const ETIQUETA_ESTADO_PERIODO: Record<string, { texto: string; clase: string; Icono: LucideIcon }> =
  {
    abierto: { texto: 'Abierto', clase: 'etiqueta--propietario', Icono: CircleDot },
    cerrado: { texto: 'Cerrado', clase: 'etiqueta--pendiente', Icono: Circle },
    liquidado: { texto: 'Liquidado', clase: 'etiqueta--rendido', Icono: BadgeCheck },
    anulado: { texto: 'Anulado', clase: 'etiqueta--vencido', Icono: Siren },
  }

export function EstadoDelPeriodo({ estado }: { estado: string }) {
  const etiqueta = ETIQUETA_ESTADO_PERIODO[estado] ?? {
    texto: estado,
    clase: 'etiqueta--pendiente',
    Icono: Circle,
  }

  return (
    <span className={`etiqueta ${etiqueta.clase}`}>
      <etiqueta.Icono className="icono" aria-hidden="true" />
      {etiqueta.texto}
    </span>
  )
}
