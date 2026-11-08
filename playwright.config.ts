import { defineConfig } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
const run = process.env.GUANDAN_BROWSER_RUN ?? randomUUID();
process.env.GUANDAN_BROWSER_RUN = run;
const control = process.env.GUANDAN_TEST_CONTROL ?? randomBytes(32).toString('hex');
process.env.GUANDAN_TEST_CONTROL = control;
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  timeout: 180_000, expect: { timeout: 6000 },
  outputDir: '.local/browser-results/' + run,
  reporter: [['line'], ['json', { outputFile: '.local/browser-report.json' }]],
  use: { baseURL: 'http://127.0.0.1:3211' },
  webServer: {
    command: 'node dist/src/server.js', url: 'http://127.0.0.1:3211/api/health', reuseExistingServer: false,
    env: { GUANDAN_PORT: '3211', GUANDAN_DATA_DIR: resolve('.local/browser-server/' + run),
      GUANDAN_BOT_DELAY_MS: '8', GUANDAN_GRACE_MS: '1000', GUANDAN_TEST_CONTROL: control, GUANDAN_TEST_SEED: '1729' }
  }
});
