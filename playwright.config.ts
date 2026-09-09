import { defineConfig, devices } from '@playwright/test'

/**
 * Escritorio y telefono (390x844): RNF-01 se verifica con una prueba y no con
 * una opinion (FR-015, condicion 4 de §8.3.4). El proyecto `a11y` corre axe
 * sobre las mismas pantallas y exige 0 infracciones A/AA (I-09, RNF-11).
 */
const PUERTO = process.env.PUERTO ?? '3000'
const URL_BASE = process.env.URL_BASE ?? `http://localhost:${PUERTO}`

export default defineConfig({
  testDir: 'pruebas/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: URL_BASE, trace: 'on-first-retry' },
  webServer: {
    command: `npm run start -- --port ${PUERTO}`,
    url: `${URL_BASE}/api/salud`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'escritorio',
      testIgnore: /.*\.a11y\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'telefono',
      testIgnore: /.*\.a11y\.spec\.ts/,
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'a11y',
      testMatch: /.*\.a11y\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
