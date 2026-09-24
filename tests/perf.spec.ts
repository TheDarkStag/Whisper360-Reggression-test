import { test, expect } from '@playwright/test';
import { InboxPage } from './pages/InboxPage';
import { timeAction, captureResponses, findRepeatedRequests, findOversizedResponses } from './utils/timing';

// Same fixture inbox.spec.ts uses — see "Test data notes" in README.md.
const TEST_CONVERSATION = 'Lolo';

/**
 * Performance diagnostics for Team Inbox, not correctness checks (see inbox.spec.ts for
 * that). Runs under the `perf` project, which turns tracing fully on (see
 * playwright.config.ts) so `npm run report` also gives a per-action network waterfall
 * for these tests specifically.
 *
 * Timings are logged, not tightly asserted — we don't have a real budget yet. Each test
 * keeps only a generous ceiling to catch a gross regression (e.g. a hang or infinite
 * retry loop), matching the pattern in auth.spec.ts.
 */
test.describe('Team Inbox / Performance', () => {
  let inbox: InboxPage;

  test.beforeEach(async ({ page }) => {
    inbox = new InboxPage(page);
    await inbox.goto();
  });

  test('opening a conversation', async ({ page }) => {
    const ms = await timeAction('Open conversation', () => inbox.openConversation(TEST_CONVERSATION));
    await expect(inbox.replyBox).toBeVisible();
    expect(ms).toBeLessThan(15_000);
  });

  test('switching a state filter', async () => {
    await inbox.openFilters();
    const ms = await timeAction('Switch filter (Active work -> Resolved)', () => inbox.selectStateFilter('Resolved'));
    expect(ms).toBeLessThan(10_000);
  });

  test('switching an ownership tab', async () => {
    const ms = await timeAction('Switch tab (All -> My conversations)', () => inbox.selectTopTab('My conversations'));
    expect(ms).toBeLessThan(10_000);
  });

  test('sending a reply', async ({ page }) => {
    await inbox.openConversation(TEST_CONVERSATION);
    await expect(inbox.replyBox).toBeVisible();

    const message = `QA perf reply ${new Date().toISOString()}`;
    const ms = await timeAction('Send reply', async () => {
      await inbox.reply(message);
      await expect(page.getByText(message).first()).toBeVisible({ timeout: 10_000 });
    });
    expect(ms).toBeLessThan(12_000);
  });

  test('searching the conversation list', async ({ page }) => {
    const ms = await timeAction('Search', async () => {
      await inbox.search(TEST_CONVERSATION);
      await expect(page.getByText(TEST_CONVERSATION, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    });
    expect(ms).toBeLessThan(10_000);
  });

  // --- Network auditing: catches N+1 request bursts / oversized payloads on a given action ---

  test('network audit: switching a state filter', async ({ page }) => {
    await inbox.openFilters();

    const logs = await captureResponses(page, () => inbox.selectStateFilter('Resolved'));

    const repeated = findRepeatedRequests(logs);
    const oversized = findOversizedResponses(logs);

    console.log(`Switch filter -> ${logs.length} responses, ${logs.reduce((sum, l) => sum + l.sizeBytes, 0)} bytes total`);
    if (repeated.length) {
      console.warn('Possible N+1 pattern (same path called repeatedly):', repeated);
    }
    if (oversized.length) {
      console.warn('Oversized responses (>=500KB):', oversized.map((r) => `${r.url} (${r.sizeBytes}b)`));
    }

    // Gross sanity ceiling only — not a real budget yet.
    expect(logs.length).toBeLessThan(200);
  });

  test('network audit: searching the conversation list', async ({ page }) => {
    const logs = await captureResponses(page, () => inbox.search(TEST_CONVERSATION));

    const repeated = findRepeatedRequests(logs);
    const oversized = findOversizedResponses(logs);

    console.log(`Search -> ${logs.length} responses, ${logs.reduce((sum, l) => sum + l.sizeBytes, 0)} bytes total`);
    if (repeated.length) {
      console.warn('Possible N+1 pattern (same path called repeatedly):', repeated);
    }
    if (oversized.length) {
      console.warn('Oversized responses (>=500KB):', oversized.map((r) => `${r.url} (${r.sizeBytes}b)`));
    }

    expect(logs.length).toBeLessThan(200);
  });
});
