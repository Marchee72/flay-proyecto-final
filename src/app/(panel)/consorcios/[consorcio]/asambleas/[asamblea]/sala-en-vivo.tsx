'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import {
  crearEscucha,
  type Oyentes,
  type Permiso,
  type ResultadoPermiso,
} from '@/compartido/escucha-en-vivo'
import { crearRefrescoAcotado } from '@/compartido/refresco-acotado'

import { EnVivo } from '../../../../en-vivo'

const REALTIME = 'https://main.realtime.ably.net'
const SONDEO_CONECTADO_MS = 15_000
const SONDEO_DESCONECTADO_MS = 3000

async function pedirPermiso(consorcioId: string, asambleaId: string): Promise<ResultadoPermiso> {
  const respuesta = await fetch(`/api/asambleas/${asambleaId}/en-vivo?consorcio=${consorcioId}`)
  if ([204, 401, 404].includes(respuesta.status)) return 'sin-servicio'
  return respuesta.ok ? ((await respuesta.json()) as Permiso) : 'reintentar'
}

function abrirCanal({ canal, token }: Permiso, oyentes: Oyentes) {
  const consulta = `v=1.2&channels=${encodeURIComponent(canal)}&accessToken=${encodeURIComponent(token)}`
  const fuente = new EventSource(`${REALTIME}/sse?${consulta}`)
  fuente.onopen = () => oyentes.alAbrir()
  fuente.onmessage = () => oyentes.alMensaje()
  fuente.onerror = () => oyentes.alError()
  return { cerrar: () => fuente.close() }
}

/**
 * La sala se relee apenas llega un aviso. `EnVivo` queda de resguardo: cubre un
 * aviso perdido, sigue drenando la cola (nota 21) y, sin conexión con el
 * servicio, vuelve a ser la vista en vivo de siempre.
 */
export function SalaEnVivo({
  consorcioId,
  asambleaId,
}: {
  consorcioId: string
  asambleaId: string
}) {
  const router = useRouter()
  const [conectado, setConectado] = useState(false)
  const [releyendo, iniciarTransicion] = useTransition()
  const refresco = useRef<ReturnType<typeof crearRefrescoAcotado>>(null)

  useEffect(() => {
    if (!releyendo) refresco.current?.terminado()
  }, [releyendo])

  useEffect(() => {
    const acotado = crearRefrescoAcotado({
      refrescar: () => iniciarTransicion(() => router.refresh()),
      puedeRefrescar: () => !document.hidden && navigator.onLine,
    })
    const escucha = crearEscucha({
      pedirPermiso: () => pedirPermiso(consorcioId, asambleaId),
      abrir: abrirCanal,
      alCambio: acotado.avisar,
      alConectado: setConectado,
    })
    refresco.current = acotado
    document.addEventListener('visibilitychange', acotado.reanudar)
    window.addEventListener('online', acotado.reanudar)
    escucha.iniciar()
    return () => {
      document.removeEventListener('visibilitychange', acotado.reanudar)
      window.removeEventListener('online', acotado.reanudar)
      escucha.detener()
      acotado.cancelar()
    }
  }, [router, consorcioId, asambleaId])

  return <EnVivo cadaMs={conectado ? SONDEO_CONECTADO_MS : SONDEO_DESCONECTADO_MS} />
}
