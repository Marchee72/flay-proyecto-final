import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { consorciosAlAlcance } from '../con-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, destinoDeEntrada } from '../consorcio-activo'
import { BLOQUES } from '../secciones'

const SECCIONES = new Set(BLOQUES.flatMap((b) => b.secciones.map((s) => s.ruta)))

/**
 * Las direcciones de antes del rediseno (`/gastos`, `/periodos?consorcio=x`)
 * siguen andando: van a la misma seccion del consorcio pedido, del recordado
 * o del unico al alcance; si hay varios y ninguno recordado, a la lista.
 * Cualquier otra cosa es un 404 de verdad.
 */
export default async function RutaVieja({
  params,
  searchParams,
}: {
  params: Promise<{ ruta: string[] }>
  searchParams: Promise<{ consorcio?: string }>
}) {
  const { ruta } = await params
  if (!SECCIONES.has(ruta[0]) && ruta[0] !== 'pendientes') notFound()
  if (ruta[0] === 'pendientes') redirect('/bandeja')

  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcios = await consorciosAlAlcance(usuarioId)
  const pedido = (await searchParams).consorcio
  const recordado = (await cookies()).get(NOMBRE_GALLETA_CONSORCIO)?.value
  redirect(destinoDeEntrada(consorcios, pedido ?? recordado, `/${ruta.join('/')}`))
}
