import { dirname } from 'path'
import { fileURLToPath } from 'url'

import { FlatCompat } from '@eslint/eslintrc'
import configPrettier from 'eslint-config-prettier'

import sinAritmeticaMonetaria from './reglas-eslint/sin-aritmetica-monetaria.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const compat = new FlatCompat({ baseDirectory: __dirname })

/** Importaciones prohibidas en el dominio: no conoce base, web ni proveedores (Principio III). */
const FUERA_DEL_DOMINIO = [
  {
    group: ['@prisma/client', '@prisma/client/*', '.prisma/*'],
    message:
      'El dominio no conoce la base de datos. Definir un puerto en src/dominio/contratos y que lo implemente la infraestructura.',
  },
  {
    group: ['next', 'next/*', 'react', 'react-dom', 'server-only'],
    message: 'El dominio no conoce el entorno web.',
  },
  {
    group: ['next-auth', 'next-auth/*', '@auth/*'],
    message: 'El dominio no conoce el mecanismo de autenticacion.',
  },
  {
    group: ['@vercel/blob', 'resend', '@react-pdf/*', 'recharts', '@node-rs/*'],
    message:
      'El dominio no conoce proveedores externos. Definir un puerto en src/dominio/contratos.',
  },
  {
    group: ['@/infraestructura/*', '**/infraestructura/**'],
    message: 'La regla de dependencia apunta al dominio: el dominio no importa infraestructura.',
  },
  {
    group: ['@/app/*', '@/aplicacion/*', '**/aplicacion/**'],
    message: 'El dominio no importa capas de arriba.',
  },
]

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
      // Las fixtures negativas DEBEN fallar: las corre su propia prueba (FR-022).
      'pruebas/fixtures-negativas/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // Informacion de tipos: la necesita flay/sin-aritmetica-monetaria.
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
    plugins: { flay: { rules: { 'sin-aritmetica-monetaria': sinAritmeticaMonetaria } } },
    rules: { 'flay/sin-aritmetica-monetaria': 'error' },
  },
  {
    // Las fixtures negativas quedan fuera del tsconfig raiz (deben fallar), asi
    // que la regla con tipos necesita su propio proyecto para poder juzgarlas.
    files: ['pruebas/fixtures-negativas/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './pruebas/fixtures-negativas/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    // Principio I: el cliente crudo de Prisma vive solo en infraestructura.
    files: ['**/src/**/*.ts', '**/src/**/*.tsx'],
    ignores: ['**/src/infraestructura/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/client', '@prisma/client/*', '.prisma/*'],
              message:
                'Ninguna consulta usa el cliente crudo: usar el cliente aislado de src/infraestructura/cliente-aislado.ts (RN-12, RT-04).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/src/app/**/*.ts', '**/src/app/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/dominio/*',
                '**/dominio/**',
                '@/infraestructura/*',
                '**/infraestructura/**',
              ],
              message: 'Presentacion solo importa src/aplicacion y src/compartido (§12.1.2).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/src/aplicacion/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/app/*', '**/src/app/**'], message: 'Aplicacion no importa presentacion.' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/src/dominio/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: FUERA_DEL_DOMINIO }] },
  },
  {
    files: ['**/src/infraestructura/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '**/src/app/**', '@/aplicacion/*', '**/aplicacion/**'],
              message: 'Infraestructura solo importa src/dominio/contratos y src/compartido.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/src/compartido/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@/*'], message: 'Lo transversal no importa nada del proyecto.' }] },
      ],
    },
  },
  configPrettier,
]

export default eslintConfig
