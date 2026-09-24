import { test, expect } from '@playwright/test';
import { LoginPage, TEST_EMAIL, TEST_PASSWORD } from './pages/LoginPage';

// Matches either the normal invalid-credentials message or the rate-limit message the
// backend returns after several failed attempts in quick succession (both are a correct
// rejection — the suite deliberately sends multiple bad logins across this file's tests).
const loginRejectionMessage = /Those details do not match an account\.|Too many attempts\. Try again shortly\./;

test.describe('Auth', () => {
  test('signs in with valid credentials and loads the app', async ({ page }) => {
    const login = new LoginPage(page);
    const start = Date.now();
    await login.login(TEST_EMAIL, TEST_PASSWORD);
    await expect(page.getByText('Team Inbox').first()).toBeVisible({ timeout: 20_000 });
    const loadMs = Date.now() - start;
    console.log(`Login -> app loaded in ${loadMs}ms`);
    // Generous ceiling: this just catches a gross regression (e.g. a broken redirect loop),
    // not a tight performance budget — real-world load time varies with backend conditions.
    expect(loadMs).toBeLessThan(25_000);
  });

  test('signs out back to the login screen', async ({ page }) => {
    const login = new LoginPage(page);
    await login.login(TEST_EMAIL, TEST_PASSWORD);
    await expect(page.getByText('Team Inbox').first()).toBeVisible({ timeout: 20_000 });
    await login.signOut();
  });

  test('rejects an incorrect password', async ({ page }) => {
    const login = new LoginPage(page);
    await login.login(TEST_EMAIL, 'this-is-not-the-password');
    await expect(page.getByText(loginRejectionMessage)).toBeVisible();
    await expect(page).toHaveURL(/auth=login|\/v2/);
  });

  test('rejects a non-existent user', async ({ page }) => {
    const login = new LoginPage(page);
    await login.login(`no-such-user-${Date.now()}@example.com`, 'whatever12345');
    await expect(page.getByText(loginRejectionMessage)).toBeVisible();
  });

  test('rejects empty credentials', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    // The Sign in button stays disabled until both fields have a value.
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    await expect(page.getByPlaceholder(/you@yourbusiness\.com/i)).toBeVisible();
  });

  test('stays signed in across a reload (session persistence)', async ({ page }) => {
    const login = new LoginPage(page);
    await login.login(TEST_EMAIL, TEST_PASSWORD);
    await expect(page.getByText('Team Inbox').first()).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await expect(page.getByText('Team Inbox').first()).toBeVisible({ timeout: 20_000 });
  });
});
