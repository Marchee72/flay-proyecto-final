import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'

import './globals.css'

// Poppins en todo, con las cifras en tabular (§3.1 de la guia de estilos).
const poppins = Poppins({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--tipografia',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Flay — Tu consorcio online',
  description: 'Administración de consorcios de propiedad horizontal',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={poppins.variable}>
      <body>{children}</body>
    </html>
  )
}
