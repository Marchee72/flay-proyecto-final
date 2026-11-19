import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'

import { PilaDeAvisos } from './avisos'

import './globals.css'

// Plus Jakarta Sans en todo, con las cifras en tabular (§3.1 de la guia de
// estilos). La variable la lee el token --tipografia de globals.css.
const fuente = Plus_Jakarta_Sans({
  weight: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
  variable: '--fuente-marca',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Flay — Tu consorcio online',
  description: 'Administración de consorcios de propiedad horizontal',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={fuente.variable}>
      <body>
        {/* El degradado del icono de la IA (`IconoIA`): una sola definicion para toda la app.
            `userSpaceOnUse`: las cruces chicas de los destellos son trazos sin ancho y con
            `objectBoundingBox` no se pintarian. */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient
              id="ia-trazo"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="24"
              y2="24"
            >
              <stop offset="0" stopColor="#2563eb" />
              <stop offset="0.55" stopColor="#7c3aed" />
              <stop offset="1" stopColor="#9333ea" />
            </linearGradient>
          </defs>
        </svg>
        {children}
        {/* La pila de avisos se monta una sola vez, aca: asi alcanza al panel,
            al ingreso y a la landing. Suspense porque lee la direccion. */}
        <Suspense>
          <PilaDeAvisos />
        </Suspense>
      </body>
    </html>
  )
}
