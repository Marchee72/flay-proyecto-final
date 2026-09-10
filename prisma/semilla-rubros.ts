import { PrismaClient } from '@prisma/client'

/**
 * Lista semilla de rubros de gasto (FR-014, cierra el hueco H-07).
 *
 * Es un catalogo **global**: dos edificios no pueden llamar distinto a la misma
 * cosa, o los indicadores de la etapa 4 comparan peras con manzanas. El alta y
 * la modificacion estan diferidas (§ 9.11): se operan por soporte sobre esta
 * lista.
 *
 * La clasificacion es la de la regla RN-04 y decide como se prorratea:
 * **ordinario** es el gasto corriente de administracion y mantenimiento, que
 * paga el ocupante; **extraordinario** es la obra o el gasto no recurrente, que
 * en general paga el propietario. Se congela en el gasto al registrarlo, para
 * que reclasificar un rubro no le cambie el sentido a una liquidacion vieja.
 *
 * Se corre sola —`node prisma/semilla-rubros.ts`— o desde otra semilla.
 * Idempotente: dos corridas dejan lo mismo y no pisan nada cargado a mano.
 */

export type Clasificacion = 'ordinario' | 'extraordinario'

export const RUBROS: readonly { nombre: string; clasificacion: Clasificacion }[] = [
  // Corrientes: el mes a mes de cualquier edificio.
  { nombre: 'Sueldo del encargado', clasificacion: 'ordinario' },
  { nombre: 'Cargas sociales', clasificacion: 'ordinario' },
  { nombre: 'Honorarios de administracion', clasificacion: 'ordinario' },
  { nombre: 'Energia electrica', clasificacion: 'ordinario' },
  { nombre: 'Agua', clasificacion: 'ordinario' },
  { nombre: 'Gas', clasificacion: 'ordinario' },
  { nombre: 'Limpieza', clasificacion: 'ordinario' },
  { nombre: 'Mantenimiento de ascensores', clasificacion: 'ordinario' },
  { nombre: 'Mantenimiento de bombas y tanques', clasificacion: 'ordinario' },
  { nombre: 'Matafuegos y seguridad', clasificacion: 'ordinario' },
  { nombre: 'Seguro del edificio', clasificacion: 'ordinario' },
  { nombre: 'Reparaciones menores', clasificacion: 'ordinario' },
  { nombre: 'Insumos y ferreteria', clasificacion: 'ordinario' },
  { nombre: 'Servicios profesionales', clasificacion: 'ordinario' },
  { nombre: 'Impuestos y tasas', clasificacion: 'ordinario' },
  { nombre: 'Gastos bancarios', clasificacion: 'ordinario' },

  // No recurrentes: obra, reemplazo de equipos, contingencias.
  { nombre: 'Obra de fachada', clasificacion: 'extraordinario' },
  { nombre: 'Impermeabilizacion de terraza', clasificacion: 'extraordinario' },
  { nombre: 'Renovacion de instalacion electrica', clasificacion: 'extraordinario' },
  { nombre: 'Renovacion de instalacion sanitaria', clasificacion: 'extraordinario' },
  { nombre: 'Reemplazo de equipos', clasificacion: 'extraordinario' },
  { nombre: 'Gastos judiciales', clasificacion: 'extraordinario' },
  { nombre: 'Fondo de reserva', clasificacion: 'extraordinario' },
]

export async function sembrarRubros(cliente: PrismaClient): Promise<number> {
  for (const rubro of RUBROS) {
    await cliente.rubroGasto.upsert({
      where: { nombre: rubro.nombre },
      // No se pisa lo cargado: si alguien reclasifico un rubro por soporte,
      // volver a correr la semilla no puede deshacerlo.
      update: {},
      create: rubro,
    })
  }

  return RUBROS.length
}

if (process.argv[1]?.endsWith('semilla-rubros.ts')) {
  const cliente = new PrismaClient()
  try {
    const cargados = await sembrarRubros(cliente)
    console.log(`Rubros de gasto asegurados: ${cargados}.`)
  } finally {
    await cliente.$disconnect()
  }
}
