import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, seedAuth } from './helpers';

function toSeriousViolations(results: Awaited<ReturnType<AxeBuilder['analyze']>>) {
  return results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  );
}

async function expectNoSeriousViolations(page: Page) {
  // Disable motion to avoid transient contrast values while cards fade in.
  await page.addStyleTag({
    content:
      '*,*::before,*::after{animation:none !important;transition:none !important;}',
  });
  const results = await new AxeBuilder({ page }).analyze();
  const serious = toSeriousViolations(results);
  expect(
    serious,
    serious
      .map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.help} [${violation.nodes.length} node(s)]`,
      )
      .join('\n'),
  ).toEqual([]);
}

test('onboarding has no serious/critical accessibility violations', async ({
  page,
}) => {
  await page.goto('/onboarding');
  await expect(
    page.getByRole('heading', { name: /no profiles\.?\s*just chemistry\.?/i }),
  ).toBeVisible();
  await page.locator('input[type="date"]').fill('1995-01-01');
  await expectNoSeriousViolations(page);
});

test('home has no serious/critical accessibility violations', async ({ page }) => {
  await seedAuth(page);
  await mockApi(page);
  await page.goto('/home');
  await expect(
    page.getByRole('heading', { name: /no profiles\.?\s*just chemistry\.?/i }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /go live/i }).first()).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('settings has no serious/critical accessibility violations', async ({
  page,
}) => {
  await seedAuth(page);
  await mockApi(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: /account/i })).toBeVisible();
  await expectNoSeriousViolations(page);
});
