import { test, expect } from '@playwright/test';
import { InboxPage } from './pages/InboxPage';

// The inbox spec targets the "Lolo" conversation specifically since it's a stable fixture
// in this test workspace. If that conversation is ever deleted/renamed, update this const.
const TEST_CONVERSATION = 'Lolo';

// A teammate in this workspace's "ASSIGN TO" list, used for the assign/unassign test.
// If this person is ever removed from the workspace, update this const to another teammate.
const TEST_TEAMMATE = 'Abraham';

// An existing saved reply in this workspace, used for the saved-reply-selection test.
// If it's ever deleted/renamed, update this const.
const TEST_SAVED_REPLY = { title: 'delivery postponed', snippet: 'we will attend to you shortly' };

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
    await expect(page.getByText('Active work', { exact: true })).toBeVisible();
    await expect(page.getByText('Open now', { exact: true })).toBeVisible();
    await expect(page.getByText('Waiting', { exact: true })).toBeVisible();
    await expect(page.getByText('Resolved', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('All channels', { exact: true })).toBeVisible();
  });

  test('applying and clearing a filter updates the conversation list without error', async ({ page }) => {
    await inbox.openFilters();
    await inbox.selectStateFilter('Resolved');
    await expect(page.getByText('Active work', { exact: true })).toBeVisible();

    await inbox.selectStateFilter('Active work');
    await expect(page.getByText('Resolved', { exact: true }).first()).toBeVisible();
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

  test('resolving a conversation updates its status, then reopens it', async ({ page }) => {
    await inbox.openConversation(TEST_CONVERSATION);
    await inbox.openMoreConversationControls();

    try {
      await inbox.resolve();
      await expect.poll(() => inbox.currentStatus(), { timeout: 20_000 }).toBe('resolved');
    } finally {
      // Resolved conversations can drop out of the current view, so re-locate by name
      // rather than assuming the panel still shows this conversation. "Resolve" is a
      // toggle (clicking it again un-resolves) — that's the reliable way back to Open;
      // the status <select> itself doesn't offer a working reverse transition from
      // Resolved the way it does from Snoozed.
      await inbox.findAndOpen(TEST_CONVERSATION);
      await inbox.openMoreConversationControls();
      if ((await inbox.currentStatus()) === 'resolved') {
        await inbox.resolve();
      }
      await expect.poll(() => inbox.currentStatus(), { timeout: 20_000 }).toBe('open');
    }
  });

  test('snoozing a conversation updates its status, then reopens it', async ({ page }) => {
    await inbox.openConversation(TEST_CONVERSATION);
    await inbox.openMoreConversationControls();

    try {
      await inbox.snoozeFor('1 hour');
      await expect.poll(() => inbox.currentStatus(), { timeout: 20_000 }).toBe('snoozed');
    } finally {
      await inbox.findAndOpen(TEST_CONVERSATION);
      await inbox.openMoreConversationControls();
      await inbox.setStatus('Open');
      await expect.poll(() => inbox.currentStatus(), { timeout: 20_000 }).toBe('open');
    }
  });

  test('taking ownership assigns the conversation, then releases it', async ({ page }) => {
    await inbox.openConversation(TEST_CONVERSATION);

    try {
      await inbox.takeOwnership();
      await expect(page.getByRole('button', { name: 'Reassign', exact: true })).toBeVisible({ timeout: 20_000 });
    } finally {
      // Taking ownership can immediately remove the conversation from the current view
      // (the app auto-selects a different one), so re-locate by name before releasing it.
      await inbox.findAndOpen(TEST_CONVERSATION);
      const reassignButton = page.getByRole('button', { name: 'Reassign', exact: true });
      if (await reassignButton.isVisible().catch(() => false)) {
        await inbox.releaseOwnership();
      }
      await expect(page.getByText('Unassigned', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test('assigning to a specific teammate, then unassigning', async ({ page }) => {
    await inbox.openConversation(TEST_CONVERSATION);

    try {
      await inbox.assignToTeammate(TEST_TEAMMATE);
      await expect(page.getByRole('button', { name: 'Reassign', exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(TEST_TEAMMATE, { exact: false }).first()).toBeVisible();
    } finally {
      // Same reasoning as the ownership test above: an assignment change can knock the
      // conversation out of the current view, so re-locate it before releasing.
      await inbox.findAndOpen(TEST_CONVERSATION);
      const reassignButton = page.getByRole('button', { name: 'Reassign', exact: true });
      if (await reassignButton.isVisible().catch(() => false)) {
        await inbox.releaseOwnership();
      }
      await expect(page.getByText('Unassigned', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
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

    await inbox.openMacrosDialog();
    await inbox.closeDialog();

    await inbox.openCreateSupportCaseDialog();
    await inbox.closeDialog();
  });
});
