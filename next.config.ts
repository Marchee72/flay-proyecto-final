import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * `@react-pdf/renderer` trae las metricas de sus tipografias incorporadas
   * como archivos de datos, y el empaquetado de la funcion serverless no los
   * incluye: en el entorno desplegado el primer documento fallaba con
   * `Cannot read properties of undefined (reading 'unitsPerEm')`. Al dejarlo
   * fuera del empaquetado se carga entero desde `node_modules`, con sus datos.
   * Local nunca fallo, porque ahi el paquete siempre esta completo.
   */
  serverExternalPackages: ['@react-pdf/renderer'],
}

export default nextConfig
