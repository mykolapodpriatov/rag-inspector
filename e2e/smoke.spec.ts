import { expect, test } from '@playwright/test';

// A placeholder that still asserts something real: the built app boots and
// mounts. Replaced by the journey specs once there are screens to walk through.
test('the built app mounts', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#root')).not.toBeEmpty();
});
