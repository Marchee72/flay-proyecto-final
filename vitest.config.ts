import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

/**
 * Dos proyectos separados: la separacion es la prueba viva del Principio III.
 * `dominio` corre sin DATABASE_URL; si el dominio tocara la base, fallaria aca
 * en el primer minuto (FR-014, SC-002).
 */
export default defineConfig({
  test: {
    /**
     * El unico umbral de cobertura del repositorio, y es del 100 % de ramas
     * (SC-014): el motor de liquidacion es el lugar donde un error invalida el
     * sistema. Poner un umbral global mas bajo seria peor que no tenerlo, asi
     * que el resto queda sin exigencia y esta carpeta con la maxima.
     */
    coverage: {
      provider: 'v8',
      include: ['src/dominio/liquidacion/**'],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'dominio',
          include: ['pruebas/dominio/**/*.spec.ts'],
          environment: 'node',
          setupFiles: ['pruebas/dominio/sin-base.ts'],
        },
      },
      {
        /**
         * La validacion contra las tres liquidaciones reales del cliente
         * (paquete 4.6, SC-005). Proyecto propio y **sin base**: es la condicion
         * de aceptacion del entregable, no una prueba de integracion mas, y
         * tiene que poder correrse sola.
         */
        resolve: { alias },
        test: {
          name: 'planillas',
          include: ['pruebas/planillas/**/*.spec.ts'],
          environment: 'node',
          setupFiles: ['pruebas/dominio/sin-base.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integracion',
          include: ['pruebas/integracion/**/*.spec.ts'],
          environment: 'node',
          setupFiles: ['pruebas/integracion/entorno.ts'],
          testTimeout: 30_000,
          // Comparten una sola base: en paralelo, la limpieza de un archivo
          // borra las filas que otro esta usando. `fileParallelism` es de raiz,
          // asi que la serializacion por proyecto va por el pool.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
})
