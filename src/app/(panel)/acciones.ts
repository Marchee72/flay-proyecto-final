'use server'

import { signOut } from '@/aplicacion/identidad/sesion'

/** Cierra la sesion y vuelve a la pantalla de ingreso. */
export async function salir() {
  await signOut({ redirectTo: '/ingresar' })
}
