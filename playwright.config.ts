import { defineConfig } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve('.output/chrome-mv3');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  projects: [
    {
      name: 'chromium-extension',
      use: {
        browserName: 'chromium',
        headless: false,
        launchOptions: {
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
          ],
        },
      },
    },
  ],
});
