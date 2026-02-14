import { expect, test } from '@playwright/test';

test('onboarding guard rails and consent gating', async ({ page }) => {
  await page.goto('/onboarding');

  await expect(
    page.getByRole('heading', {
      name: /no profiles\.?\s*just chemistry\.?/i,
    }),
  ).toBeVisible();

  const startButton = page.getByRole('button', { name: /go live/i });
  await expect(startButton).toBeDisabled();

  await page.getByLabel(/date of birth/i).fill('2000-01-01');
  await page.getByLabel(/i am 18 years or older/i).check();
  await page.getByLabel(/i consent to 45s video calls/i).check();
  await page.getByLabel(/i consent to real-time ai moderation/i).check();
  await page.getByLabel(/i agree to the/i).check();

  await expect(startButton).toBeEnabled();
});
