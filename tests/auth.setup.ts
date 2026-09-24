import { test as setup, expect } from '@playwright/test';
import { LoginPage, TEST_EMAIL, TEST_PASSWORD } from './pages/LoginPage';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  const login = new LoginPage(page);
  await login.login(TEST_EMAIL, TEST_PASSWORD);
  await expect(page.getByText('Team Inbox').first()).toBeVisible({ timeout: 20_000 });
  await page.context().storageState({ path: authFile });
});
