import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Team Inbox (Messenger OS). Encapsulates the conversation list, a conversation's
 * controls (tags, assignment, saved replies, customer details), filters, and follow-ups.
 *
 * Notes on quirks this page object exists to hide from specs:
 * - Two floating overlays (Winnie copilot, customer-support webchat) auto-open per screen
 *   and can intercept clicks; `dismissCopilot()` must be called after most navigations.
 * - The tag editor is a custom dropdown, not a native `<select>`: its own suggestion list
 *   only refreshes with brand-new tags after a full page reload, and closing it requires
 *   clicking its own invisible backdrop rather than pressing Escape.
 */
export class InboxPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto('/v2?suite=messenger&page=inbox');
    await this.dismissCopilot();
    await expect(this.page.getByText('Team Inbox').first()).toBeVisible({ timeout: 30_000 });
  }

  async openConversation(name: string): Promise<void> {
    await this.page.getByText(name, { exact: true }).first().click();
    await this.dismissCopilot();
  }

  async openFilters(): Promise<void> {
    await this.page.getByText('Filters', { exact: false }).first().click();
  }

  async selectStateFilter(state: 'Active work' | 'Open now' | 'Waiting' | 'Resolved'): Promise<void> {
    await this.page.getByText(state, { exact: true }).first().click();
  }

  get replyBox() {
    return this.page.getByPlaceholder('Reply to customer…');
  }

  async reply(message: string): Promise<void> {
    await this.replyBox.fill(message);
    await this.page.getByTestId('reply-send').click();
  }

  async openMoreConversationControls(): Promise<void> {
    await this.page.getByRole('button', { name: 'More conversation controls' }).click();
    await this.dismissCopilot();
  }

  /** Opens the tag editor dropdown (label reads "Add" with no tags, an icon once tags exist). */
  private tagEditorTrigger() {
    return this.page.getByText('Add', { exact: true }).or(this.page.locator('button[aria-label="Edit tags"]'));
  }

  private tagsHeaderRow() {
    return this.page.locator('text=TAGS').locator('..');
  }

  private tagDropdown() {
    return this.page.locator('div').filter({ has: this.page.getByPlaceholder('New tag…') }).last();
  }

  /** Adds `tagName` to the currently-open conversation and confirms it's applied. */
  async addTag(tagName: string): Promise<void> {
    await this.openMoreConversationControls();
    await this.tagEditorTrigger().first().click();
    await this.dismissCopilot();

    const input = this.page.getByPlaceholder('New tag…');
    await input.fill(tagName);
    // Enter is more reliable than the small "+" button, which sits close to overlays.
    await input.press('Enter');

    await expect(this.tagsHeaderRow().getByText(tagName, { exact: true })).toBeVisible({ timeout: 20_000 });
  }

  /**
   * Removes `tagName` from the currently-open conversation. Reloads the page first: the
   * tag dropdown's suggestion list only picks up a tag created moments ago after a reload.
   */
  async removeTag(tagName: string, conversationName: string): Promise<void> {
    await this.page.reload();
    await expect(this.page.getByText('Team Inbox').first()).toBeVisible({ timeout: 30_000 });
    await this.dismissCopilot();
    await this.openConversation(conversationName);
    await this.openMoreConversationControls();
    await this.tagEditorTrigger().first().click();

    const dropdown = this.tagDropdown();
    await expect(dropdown.getByText(tagName, { exact: true })).toBeVisible({ timeout: 20_000 });
    await dropdown.getByText(tagName, { exact: true }).click();

    // The dropdown stays open after this click and, while open, is a DOM descendant of the
    // same container as the header chips — so its own (now-unchecked) suggestion-list entry
    // would otherwise still satisfy a header text match. Close it via its backdrop first.
    await this.closePopoverViaBackdrop();
    await expect(this.tagsHeaderRow().getByText(tagName, { exact: true })).toHaveCount(0, { timeout: 20_000 });
  }

  /** Best-effort: removes `tagName` if still applied, swallowing errors. Use in cleanup. */
  async removeTagIfPresent(tagName: string, conversationName: string): Promise<void> {
    try {
      await this.page.reload();
      await expect(this.page.getByText('Team Inbox').first()).toBeVisible({ timeout: 30_000 });
      await this.dismissCopilot();
      await this.openConversation(conversationName);
      await this.openMoreConversationControls();

      if (!(await this.tagsHeaderRow().getByText(tagName, { exact: true }).isVisible({ timeout: 2000 }).catch(() => false))) {
        return;
      }

      await this.tagEditorTrigger().first().click({ timeout: 5000 });
      await this.tagDropdown().getByText(tagName, { exact: true }).click({ timeout: 5000 });
    } catch {
      // best-effort only — a leftover tag here just means the next run's cleanup tries again.
    }
  }

  // --- Assignment & handling ---

  async openAssignPanel(): Promise<void> {
    await this.page.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(this.page.getByText('Assignment & handling')).toBeVisible();
  }

  async closeAssignPanel(): Promise<void> {
    await this.page.getByRole('button', { name: 'Close Assignment & handling' }).click();
  }

  async takeOwnership(): Promise<void> {
    await this.page.getByRole('button', { name: 'Take ownership' }).first().click();
  }

  /**
   * Assigns the currently-open conversation to a specific teammate from the "ASSIGN TO"
   * chip list (opened via the Assign panel). Each chip's accessible text is the person's
   * name followed by their role on a separate line (e.g. "Abraham\nadmin"), so an exact
   * match on the name alone won't hit — use a substring match instead.
   */
  async assignToTeammate(name: string): Promise<void> {
    await this.openAssignPanel();
    await this.page.getByText(name, { exact: false }).first().click();
  }

  async resolve(): Promise<void> {
    await this.page.getByRole('button', { name: 'Resolve', exact: true }).click();
  }

  // --- Saved replies ---

  async openSavedReplies(): Promise<void> {
    await this.page.getByText('Saved replies', { exact: true }).click();
  }

  async closeSavedReplies(): Promise<void> {
    await this.page.getByText('Saved replies', { exact: true }).click();
  }

  get savedRepliesSearch() {
    return this.page.getByPlaceholder('Search title, shortcut or message');
  }

  /** Opens the saved-replies list and picks the entry titled `title`, populating the reply box. */
  async selectSavedReply(title: string): Promise<void> {
    await this.openSavedReplies();
    await this.page.getByText(title, { exact: true }).click();
  }

  /** The reply box is a real textarea — read its value with inputValue(), not innerText(). */
  async currentReplyText(): Promise<string> {
    return this.replyBox.inputValue();
  }

  // --- Customer details ---

  async openMoreMenu(): Promise<void> {
    await this.page.getByRole('button', { name: 'More', exact: true }).click();
  }

  async openCustomerDetails(): Promise<void> {
    await this.openMoreMenu();
    await this.page.getByText('Details', { exact: true }).click();
    await expect(this.page.getByText('Customer details')).toBeVisible();
  }

  async closeCustomerDetails(): Promise<void> {
    await this.page.getByRole('button', { name: 'Close Customer details' }).click();
  }

  // --- More menu: Log a task / Macros / Create Support case ---
  // These open a modal dialog (a `div.fixed.inset-0` backdrop, same component the tag
  // editor's popover shares) rather than an inline panel. Only entry is verified here —
  // each is closed via Cancel/close-icon/Escape (see BasePage.closeDialog) without
  // submitting, so nothing persistent (a task, a macro run, a support case) is created.

  async openLogTaskDialog(): Promise<void> {
    await this.openMoreMenu();
    await this.page.getByText('Log a task', { exact: true }).click();
    await expect(this.page.getByText('What needs to happen', { exact: true })).toBeVisible({ timeout: 10_000 });
  }

  async openMacrosDialog(): Promise<void> {
    await this.openMoreMenu();
    await this.page.getByText('Macros', { exact: true }).click();
    await expect(this.modalBackdrop()).toBeVisible({ timeout: 10_000 });
  }

  async openCreateSupportCaseDialog(): Promise<void> {
    await this.openMoreMenu();
    await this.page.getByText('Create Support case', { exact: true }).click();
    await expect(this.modalBackdrop()).toBeVisible({ timeout: 10_000 });
  }

  private modalBackdrop() {
    return this.page.locator('div.fixed.inset-0').first();
  }

  // --- Follow-ups ---

  async gotoFollowUps(): Promise<void> {
    await this.page.getByRole('tab', { name: 'Follow-ups' }).click();
    await expect(this.page.getByText('Customer follow-ups')).toBeVisible();
  }

  async selectFollowUpTab(tab: 'Open' | 'Mine' | 'Unassigned' | 'Completed'): Promise<void> {
    await this.page.getByRole('button', { name: tab, exact: true }).click();
  }

  // --- Search ---

  async search(query: string): Promise<void> {
    await this.page.getByPlaceholder('Search name, subject or message text').fill(query);
  }

  // --- Ownership-based tabs (Unread, Unattended, My conversations, Assigned, Team, All, Groups) ---

  async selectTopTab(tab: 'Unread' | 'Unattended' | 'My conversations' | 'Assigned' | 'Team' | 'All' | 'Groups'): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(`^${tab} \\d+$`) }).click();
  }

  // --- Channel filter (inside the Filters panel) ---

  async selectChannelFilter(channel: 'WebChat' | 'Email' | 'Voice'): Promise<void> {
    await this.page.getByRole('button', { name: `Filter to ${channel} conversations` }).click();
  }

  // --- Conversation status (native <select>: New, Open, Pending, Waiting on customer, Resolved, Closed) ---

  private statusSelect() {
    return this.page.getByRole('combobox', { name: 'Conversation status' });
  }

  async setStatus(
    label: 'New' | 'Open' | 'Pending' | 'Waiting on customer' | 'Resolved' | 'Closed'
  ): Promise<void> {
    await this.statusSelect().selectOption({ label });
  }

  async currentStatus(): Promise<string> {
    // A native <select>'s own innerText lists every option, not just the selected one —
    // inputValue() (the selected option's value attribute, e.g. "open") is the reliable read.
    return this.statusSelect().inputValue();
  }

  // --- Snooze ---

  async snoozeFor(duration: '1 hour' | '4 hours' | 'Tomorrow' | 'Next week'): Promise<void> {
    await this.page.getByRole('button', { name: 'Snooze', exact: true }).click();
    await this.page.getByText(duration, { exact: true }).click();
  }

  // --- Ownership release ---

  /** Hands a conversation you own back to the unassigned queue. */
  async releaseOwnership(): Promise<void> {
    await this.page.getByRole('button', { name: 'Reassign', exact: true }).click();
    await this.page.getByText('Return to unassigned queue', { exact: true }).click();
  }

  /**
   * Reliably re-opens `name` after a status/ownership change, regardless of which tab or
   * state filter it now falls under (e.g. once Resolved or reassigned, it can disappear
   * from whatever view was active and the app auto-selects a different conversation).
   * Used to safely apply a revert step after a state-mutating test action.
   *
   * There is no single "all states" filter pill — only Active work / Open now / Waiting /
   * Resolved, each mutually exclusive. So this tries the state filter most likely to
   * surface `name` (Active work, which also covers Snoozed) and falls back to Resolved.
   */
  async findAndOpen(name: string): Promise<void> {
    await this.goto();
    await this.selectTopTab('All');
    await this.search(name);

    if (await this.page.getByText(name, { exact: true }).first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.openConversation(name);
      return;
    }

    await this.openFilters();
    await this.selectStateFilter('Resolved');
    await this.search(name);
    await this.openConversation(name);
  }
}
