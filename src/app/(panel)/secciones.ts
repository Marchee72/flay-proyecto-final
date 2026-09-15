import {
  Building2,
  CalendarCheck,
  CalendarDays,
  DoorOpen,
  FileText,
  Gauge,
  Megaphone,
  BookOpen,
  MessageSquareWarning,
  Receipt,
  TriangleAlert,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'

type Seccion = { ruta: string; titulo: string; Icono: typeof Receipt; roles?: readonly string[] }
type Bloque = { titulo: string; secciones: Seccion[] }

/**
 * Las secciones de un consorcio, en cuatro bloques (diseno 2026-09-13 § 3.3).
 * Solo existen dentro de `/consorcios/[consorcio]`: afuera no hay lateral.
 * `roles` copia lo que exige el caso de uso que abre la pantalla; sin el
 * campo, la ve cualquier rol. Esto solo decide que se dibuja (RNF-03).
 */
export const BLOQUES: Bloque[] = [
  {
    titulo: 'Dinero',
    secciones: [
      { ruta: 'periodos', titulo: 'Períodos', Icono: CalendarDays },
      { ruta: 'expensas', titulo: 'Expensas', Icono: FileText },
      { ruta: 'gastos', titulo: 'Gastos', Icono: Receipt },
      { ruta: 'pagos', titulo: 'Pagos', Icono: Wallet },
      { ruta: 'morosidad', titulo: 'Morosidad', Icono: TriangleAlert },
    ],
  },
  {
    titulo: 'Convivencia',
    secciones: [
      { ruta: 'reclamos', titulo: 'Reclamos', Icono: MessageSquareWarning },
      { ruta: 'reservas', titulo: 'Reservas', Icono: CalendarCheck },
      { ruta: 'espacios', titulo: 'Espacios', Icono: DoorOpen },
      { ruta: 'novedades', titulo: 'Novedades', Icono: Megaphone },
    ],
  },
  {
    titulo: 'Análisis',
    secciones: [
      { ruta: 'documentos', titulo: 'Documentación', Icono: BookOpen },
      {
        ruta: 'indicadores',
        titulo: 'Indicadores',
        Icono: Gauge,
        roles: ['administrador', 'consejo'],
      },
    ],
  },
  {
    titulo: 'Administración',
    secciones: [
      {
        ruta: 'unidades',
        titulo: 'Unidades',
        Icono: Building2,
        roles: ['administrador', 'consejo'],
      },
      { ruta: 'proveedores', titulo: 'Proveedores', Icono: Truck },
      { ruta: 'usuarios', titulo: 'Usuarios', Icono: Users, roles: ['administrador'] },
    ],
  },
]

/** Los bloques con las secciones que esos roles pueden abrir; un bloque vacio no se dibuja. */
export function bloquesPara(roles: readonly string[]): Bloque[] {
  return BLOQUES.map((bloque) => ({
    ...bloque,
    secciones: bloque.secciones.filter(
      (seccion) => !seccion.roles || seccion.roles.some((rol) => roles.includes(rol)),
    ),
  })).filter((bloque) => bloque.secciones.length > 0)
}
