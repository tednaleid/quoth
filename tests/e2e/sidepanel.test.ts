import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve('.output/chrome-mv3');

test.describe('Side Panel', () => {
  let context: BrowserContext;
  let extensionId: string;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });

    // Get extension ID from the service worker
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    extensionId = background.url().split('/')[2];
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('side panel page renders with header and placeholder', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    await expect(page.locator('h1')).toHaveText('Quoth');
    await expect(page.locator('.status-bar')).toBeVisible();
    await expect(page.locator('.placeholder')).toContainText(
      'Open a YouTube video to see its transcript.',
    );

    await page.close();
  });
});
