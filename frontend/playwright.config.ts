import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    launchOptions: { channel: 'chrome' },
  },
  webServer: [
    {
      command: 'python manage.py runserver 127.0.0.1:8000 --noreload',
      cwd: '../backend/job',
      url: 'http://127.0.0.1:8000/admin/login/',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
