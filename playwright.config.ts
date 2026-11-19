import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const preinstalledHeadlessShell =
  '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'off',
    ...(existsSync(preinstalledHeadlessShell)
      ? { launchOptions: { executablePath: preinstalledHeadlessShell } }
      : {}),
  },
  webServer: {
    command: 'npx vite --port=3100 --host=127.0.0.1',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_USE_FIREBASE_EMULATOR: 'true',
      VITE_FIREBASE_PROJECT_ID: 'demo-medicore',
      DISABLE_HMR: 'true',
    },
  },
});
