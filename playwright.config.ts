import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional: set PLAYWRIGHT_CHROME_PATH to use an already-installed Chrome.
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROME_PATH || undefined },
      },
    },
  ],
  webServer: {
    // Fake Supabase URL/key: every Supabase and GitHub request is mocked inside the tests.
    command: `npm run dev -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'e2e-test-key',
    },
  },
})
