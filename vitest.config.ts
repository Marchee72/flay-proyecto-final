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
