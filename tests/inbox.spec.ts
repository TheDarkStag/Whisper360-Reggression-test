import { test, expect } from '@playwright/test';
import { InboxPage } from './pages/InboxPage';

// The inbox spec targets this conversation specifically since it's the designated fixture
// in this test workspace. It has to be a *Website chat* conversation: email conversations
// open a separate email workspace that covers the standard controls these tests click
// (Take ownership, Assign, Resolve, ...), so they can't drive it. If it's ever deleted or
// renamed, update this const (the previous fixture, "Lolo", was deleted — see README).
const TEST_CONVERSATION = 'james bond';

// A teammate in this workspace's "ASSIGN TO" list, used for the assign/unassign test.
// If this person is ever removed from the workspace, update this const to another teammate.
const TEST_TEAMMATE = 'Abraham';

// An existing saved reply in this workspace, used for the saved-reply-selection test.
// If it's ever deleted/renamed, update this const.
const TEST_SAVED_REPLY = { title: 'delivery postponed', snippet: 'we will attend to you shortly' };

// Tests that change the fixture's state and put it back in a `finally` get a generous limit.
// When a test hits its time limit Playwright aborts it mid-flight — including a half-finished
// `finally` — which leaves the fixture changed (Resolved, Snoozed, assigned to someone) and
// makes every later test, and every later run, fail until someone fixes it by hand. That is
// exactly how the first runs against this fixture broke.
const STATE_CHANGING_TEST_TIMEOUT = 360_000;

/** statusOf() but retried: the fixture can be briefly unfindable on a slow load. */
async function knownStatusOf(inbox: InboxPage, name: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const status = await inbox.statusOf(name);
    if (status !== 'unknown') return status;
  }
  throw new Error(`Could not find "${name}" to put it back — its status may have been left changed. Check it by hand.`);
}

test.describe('Messenger / Team Inbox', () => {
  let inbox: InboxPage;

  test.beforeEach(async ({ page }) => {
    inbox = new InboxPage(page);
    await inbox.goto();
  });

  test('core layout renders: conversation list, message pane, filters', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Conversations' })).toBeVisible();
    await expect(page.getByPlaceholder('Search name, subject or message text')).toBeVisible();
    await expect(page.getByText('Unread', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Unassigned', { exact: true }).first()).toBeVisible();
  });

  test('opening the filters panel shows state and channel filters', async ({ page }) => {
    await inbox.openFilters();
    await expect(inbox.stateFilterPill('Active work')).toBeVisible();
    await expect(inbox.stateFilterPill('Open now')).toBeVisible();
    await expect(inbox.stateFilterPill('Waiting')).toBeVisible();
    await expect(inbox.stateFilterPill('Resolved')).toBeVisible();
    await expect(page.getByText('All channels', { exact: true })).toBeVisible();
  });

  test('applying and clearing a filter updates the conversation list without error', async ({ page }) => {
    await inbox.openFilters();
    await inbox.selectStateFilter('Resolved');
    await expect(inbox.stateFilterPill('Active work')).toBeVisible();

    await inbox.selectStateFilter('Active work');
    await expect(inbox.stateFilterPill('Resolved')).toBeVisible();
  });

  test('replying to a conversation sends the message', async ({ page }) => {
    await inbox.openConversation(TEST_CONVERSATION);
    await expect(inbox.replyBox).toBeVisible();

    const message = `QA automated reply ${new Date().toISOString()}`;
    await inbox.reply(message);

    // The message text appears both in the sent bubble and the conversation list preview.
    await expect(page.getByText(message).first()).toBeVisible({ timeout: 10_000 });
  });

  test('adding and removing a tag on a conversation', async ({ page }) => {
    test.setTimeout(STATE_CHANGING_TEST_TIMEOUT);
    await inbox.openConversation(TEST_CONVERSATION);
    const tagName = `qa-test-${Date.now()}`;

    try {
      await inbox.addTag(tagName);
      await inbox.removeTag(tagName, TEST_CONVERSATION);
    } finally {
      // Best-effort safety net: if an assertion above threw, make sure this run's tag
      // doesn't linger on the conversation for the next run to trip over.
      await inbox.removeTagIfPresent(tagName, TEST_CONVERSATION);
    }
  });

  test('assignment panel shows current owner and team members', async ({ page }) => {
    await inbox.openConversation(TEST_CONVERSATION);
    await inbox.openAssignPanel();
    await expect(page.getByText('Current owner', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take ownership' }).first()).toBeVisible();
    await inbox.closeAssignPanel();
  });

  test('saved replies panel opens with a searchable list', async ({ page }) => {
    await inbox.openConversation(TEST_CONVERSATION);
    await inbox.openSavedReplies();
    await expect(inbox.savedRepliesSearch).toBeVisible();
    await inbox.closeSavedReplies();
  });

  test('customer details panel shows contact and conversation history', async ({ page }) => {
    await inbox.openConversation(TEST_CONVERSATION);
    await inbox.openCustomerDetails();
    await expect(page.getByText('Conversation history')).toBeVisible();
    await expect(page.getByText('Full profile')).toBeVisible();
    await inbox.closeCustomerDetails();
  });

  test('follow-ups tab switches between Open, Mine, Unassigned and Completed', async ({ page }) => {
    await inbox.gotoFollowUps();
    for (const tab of ['Mine', 'Unassigned', 'Completed', 'Open'] as const) {
      await inbox.selectFollowUpTab(tab);
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });

  test('searching narrows the conversation list to the matching conversation', async ({ page }) => {
    await inbox.search(TEST_CONVERSATION);
    await expect(page.getByText(TEST_CONVERSATION, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('switching the top ownership tabs updates the list without error', async ({ page }) => {
    for (const tab of ['Unattended', 'My conversations', 'All', 'Unread'] as const) {
      await inbox.selectTopTab(tab);
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });

  test('filtering by channel narrows the conversation list without error', async ({ page }) => {
    await inbox.openFilters();
    await inbox.selectChannelFilter('WebChat');
    await expect(page.getByText(TEST_CONVERSATION, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('resolving a conversation updates its status, then reopens it', async () => {
    test.setTimeout(STATE_CHANGING_TEST_TIMEOUT);
    await inbox.openConversation(TEST_CONVERSATION);

    try {
      await inbox.resolve();
      // Resolving moves the conversation to another list and the app auto-selects a different
      // one, so the status select on screen is no longer this conversation's: find it again.
      await expect.poll(() => inbox.statusOf(TEST_CONVERSATION), { timeout: 120_000 }).toBe('resolved');
    } finally {
      if ((await knownStatusOf(inbox, TEST_CONVERSATION)) === 'resolved') {
        await inbox.reopen(TEST_CONVERSATION);
      }
    }
  });

  test('snoozing a conversation updates its status, then reopens it', async () => {
    test.setTimeout(STATE_CHANGING_TEST_TIMEOUT);
    await inbox.openConversation(TEST_CONVERSATION);
    await inbox.openMoreConversationControls();

    try {
      await inbox.snoozeFor('1 hour');
      await expect.poll(() => inbox.currentStatus(), { timeout: 45_000 }).toBe('snoozed');
    } finally {
      // A snoozed conversation stays in the Active work list, so the status select on screen
      // is still this conversation's. The change can take a while to apply — wait for it.
      await inbox.findAndOpen(TEST_CONVERSATION);
      await inbox.openMoreConversationControls();
      if ((await inbox.currentStatus()) !== 'open') {
        await inbox.setStatus('Open');
      }
      await expect.poll(() => inbox.currentStatus(), { timeout: 90_000 }).toBe('open');
    }
  });

  test('taking ownership assigns the conversation, then releases it', async ({ page }) => {
    test.setTimeout(STATE_CHANGING_TEST_TIMEOUT);
    await inbox.openConversation(TEST_CONVERSATION);

    try {
      await inbox.takeOwnership(TEST_CONVERSATION);
      await expect(page.getByRole('button', { name: 'Reassign', exact: true })).toBeVisible({ timeout: 30_000 });
    } finally {
      // Taking ownership can immediately remove the conversation from the current view
      // (the app auto-selects a different one), so re-locate by name before releasing it.
      await inbox.findAndOpen(TEST_CONVERSATION);
      await inbox.releaseOwnershipIfAssigned();
      await expect(page.getByRole('button', { name: 'Take ownership' }).first()).toBeEnabled({ timeout: 30_000 });
    }
  });

  test('assigning to a specific teammate, then unassigning', async ({ page }) => {
    test.setTimeout(STATE_CHANGING_TEST_TIMEOUT);
    await inbox.openConversation(TEST_CONVERSATION);

    try {
      await inbox.assignToTeammate(TEST_CONVERSATION, TEST_TEAMMATE);
      // "Reassign" isn't shown while the assignment panel is open.
      await inbox.closeAssignPanelIfOpen();
      await expect(page.getByRole('button', { name: 'Reassign', exact: true })).toBeVisible({ timeout: 30_000 });
    } finally {
      await inbox.findAndOpen(TEST_CONVERSATION);
      await inbox.releaseOwnershipIfAssigned();
      await expect(page.getByRole('button', { name: 'Take ownership' }).first()).toBeEnabled({ timeout: 30_000 });
    }
  });

  test('selecting a saved reply populates the reply box', async ({ page }) => {
    await inbox.openConversation(TEST_CONVERSATION);

    await inbox.selectSavedReply(TEST_SAVED_REPLY.title);
    await expect.poll(() => inbox.currentReplyText()).toContain(TEST_SAVED_REPLY.snippet);

    // Leave the box empty for the next test/run rather than an unsent draft.
    await inbox.replyBox.fill('');
  });

  test('More menu: Log a task, Macros and Create Support case open and close cleanly', async ({ page }) => {
    await inbox.openConversation(TEST_CONVERSATION);

    await inbox.openLogTaskDialog();
    await inbox.closeDialog();
    await expect(page.getByText('What needs to happen', { exact: true })).not.toBeVisible();

    await inbox.openMoreMenuDrawer('Macros');
    await inbox.closeMoreMenuDrawer('Macros');

    await inbox.openMoreMenuDrawer('Create Support case');
    await inbox.closeMoreMenuDrawer('Create Support case');
  });
});
