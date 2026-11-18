import { defineConfig, devices } from '@playwright/test'

const port = 3100

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'off',
  },
  webServer: {
    command: `npx next dev -p ${port}`,
    url: `http://127.0.0.1:${port}/preview?screen=Login&bare=1`,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      PATH: process.env.PATH || '',
      HOME: process.env.HOME || '',
      NEXT_PUBLIC_SCREENSHOTS: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-preview-anon-key',
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
})
