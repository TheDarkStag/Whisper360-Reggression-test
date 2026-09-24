import { test, expect } from '@playwright/test';
import { EmailPage } from './pages/EmailPage';

// "test email 2" is an existing fixture ticket in this test workspace (its subject line is
// literally a test artifact), used here the same way "Lolo" is used in inbox.spec.ts — a
// stable, safe-to-interact-with record for reply/status flows. If it's ever deleted or
// renamed, update this const.
const TEST_TICKET = 'test email 2';

test.describe('Email', () => {
  let email: EmailPage;

  test.beforeEach(async ({ page }) => {
    email = new EmailPage(page);
    await email.goto();
  });

  test('ticket list loads with filter tabs and counts', async ({ page }) => {
    await expect(page.getByPlaceholder('Search email tickets…')).toBeVisible();
    await expect(page.getByRole('button', { name: /^All \d+$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Open \d+$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pending \d+$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Resolved \d+$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Closed \d+$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New ticket' })).toBeVisible();
  });

  test('switching filter tabs updates the ticket list without error', async ({ page }) => {
    await email.selectFilterTab('Open');
    await expect(page.locator('body')).not.toBeEmpty();

    await email.selectFilterTab('Resolved');
    await expect(page.locator('body')).not.toBeEmpty();

    await email.selectFilterTab('All');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('searching narrows the ticket list', async ({ page }) => {
    await email.search(TEST_TICKET);
    await expect(page.getByText(TEST_TICKET, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('opening a ticket shows its thread and reply composer', async ({ page }) => {
    await email.openTicket(TEST_TICKET);
    await expect(page.getByRole('button', { name: 'Reply', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resolve', exact: true })).toBeVisible();
    await expect(email.replyBody).toBeVisible();
  });

  test('replying to a ticket sends the message', async ({ page }) => {
    await email.openTicket(TEST_TICKET);
    const message = `QA automated reply ${new Date().toISOString()}`;
    await email.reply(message);
    // The message text may appear both in the sent thread and the ticket list preview.
    await expect(page.getByText(message).first()).toBeVisible({ timeout: 10_000 });
  });
});
