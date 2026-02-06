import { expect, test } from '@playwright/test';
import { mockApi, seedAuth } from './helpers';

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

const PUBLIC_ROUTES = ['/onboarding', '/legal/privacy', '/legal/terms'];
const AUTH_ROUTES = ['/home', '/settings', '/matches'];

for (const viewport of VIEWPORTS) {
  for (const route of PUBLIC_ROUTES) {
    test(`desktop layout ${route} at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();

      const overflow = await page.evaluate(() => {
        const htmlOverflow = document.documentElement.scrollWidth - window.innerWidth;
        const bodyOverflow = document.body.scrollWidth - window.innerWidth;
        return Math.max(htmlOverflow, bodyOverflow);
      });

      expect(overflow).toBeLessThanOrEqual(2);
    });
  }

  for (const route of AUTH_ROUTES) {
    test(`desktop layout ${route} (authed) at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedAuth(page);
      await mockApi(page);
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();

      const overflow = await page.evaluate(() => {
        const htmlOverflow = document.documentElement.scrollWidth - window.innerWidth;
        const bodyOverflow = document.body.scrollWidth - window.innerWidth;
        return Math.max(htmlOverflow, bodyOverflow);
      });

      expect(overflow).toBeLessThanOrEqual(2);
    });
  }
}
