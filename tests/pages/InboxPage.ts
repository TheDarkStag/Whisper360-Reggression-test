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
    // The nav label renders well before the inbox itself is interactive on a slow load.
    await expect(this.page.getByPlaceholder('Search name, subject or message text')).toBeVisible({ timeout: 45_000 });
  }

  /**
   * Opens a conversation by name. Searches for it first: the list holds dozens of
   * conversations ordered by recency and only renders the rows near the top, so a fixture
   * that newer mail has pushed down isn't in the page at all until you search for it.
   */
  async openConversation(name: string): Promise<void> {
    await this.search(name);
    await this.page.getByText(name, { exact: true }).first().click();
    await this.dismissCopilot();
  }

  async openFilters(): Promise<void> {
    await this.page.getByText('Filters', { exact: false }).first().click();
  }

  /**
   * A state-filter pill. Its accessible name carries a live count ("Active work 26",
   * "Resolved 4"), so match the label plus an optional number — an exact-text match on the
   * bare label can never succeed, and a loose one can land on a hidden `<option>Resolved</option>`
   * in the conversation-status select instead of the pill.
   */
  stateFilterPill(state: 'Active work' | 'Open now' | 'Waiting' | 'Resolved') {
    return this.page.getByRole('button', { name: new RegExp(`^${state}(\\s+\\d+)?$`) });
  }

  async selectStateFilter(state: 'Active work' | 'Open now' | 'Waiting' | 'Resolved'): Promise<void> {
    await this.stateFilterPill(state).click();
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

    // `.first()`: once the editor's suggestion list refreshes (fast on a healthy app) the new
    // tag is listed there as well as in the header, so there can be two matches. Either one
    // proves it was applied.
    await expect(this.tagsHeaderRow().getByText(tagName, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  }

  /**
   * Removes `tagName` from the open conversation and confirms the chip is gone. Reloads the
   * page first: the tag dropdown's suggestion list only picks up a tag created moments ago
   * after a reload. The click on the tag in the dropdown can be swallowed on a slow machine
   * (the chip then stays), so verify and redo the whole sequence from a fresh load.
   */
  async removeTag(tagName: string, conversationName: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
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
      try {
        await expect(this.tagsHeaderRow().getByText(tagName, { exact: true })).toHaveCount(0, { timeout: 12_000 });
        return;
      } catch {
        // click swallowed, or not applied yet — go round again from a fresh load
      }
    }
    throw new Error(`Tag "${tagName}" was still on the conversation after 3 removal attempts.`);
  }

  /** Best-effort: removes `tagName` if still applied, swallowing errors. Use in cleanup. */
  async removeTagIfPresent(tagName: string, conversationName: string): Promise<void> {
    try {
      await this.page.reload();
      await expect(this.page.getByText('Team Inbox').first()).toBeVisible({ timeout: 30_000 });
      await this.dismissCopilot();
      await this.openConversation(conversationName);
      await this.openMoreConversationControls();

      if (!(await this.appears(this.tagsHeaderRow().getByText(tagName, { exact: true }), 2_000))) {
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

  async closeAssignPanelIfOpen(): Promise<void> {
    const close = this.page.getByRole('button', { name: 'Close Assignment & handling' });
    if (await this.appears(close, 3_000)) await close.click();
  }

  private takeOwnershipButton() {
    return this.page.getByRole('button', { name: 'Take ownership' }).first();
  }

  /** True when the named conversation is currently owned (it shows "Reassign"). */
  private async isOwned(conversation: string): Promise<boolean> {
    await this.findAndOpen(conversation);
    return this.appears(this.page.getByRole('button', { name: 'Reassign', exact: true }), 8_000);
  }

  /**
   * Takes ownership of the open conversation and confirms it. A click made right after a
   * conversation opens can be swallowed before its controls are wired up, so verify and retry.
   * Verification must re-find the conversation by name: ownership moves it out of the
   * "Unassigned" list and the app auto-selects a different one, so the "Take ownership" button
   * on screen afterwards belongs to some other conversation — never click it a second time
   * without re-opening this one first.
   */
  async takeOwnership(conversation: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await this.openConversation(conversation);
      await this.takeOwnershipButton().click();
      if (await this.isOwned(conversation)) return;
    }
    throw new Error('Taking ownership did not take effect after 3 attempts.');
  }

  /**
   * Assigns the open conversation to a specific teammate from the "ASSIGN TO" chip list
   * (opened via the Assign panel), and confirms it by re-finding the conversation by name (see
   * takeOwnership). A chip's accessible name is an avatar initial, the person's name and their
   * role ("A Abraham admin"). A click made the instant the panel appears can be swallowed
   * before the panel has finished loading, hence the verify-and-retry.
   */
  async assignToTeammate(conversation: string, name: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await this.openConversation(conversation);
      await this.openAssignPanel();
      await this.page.getByRole('button', { name: new RegExp(`\\b${name}\\b.*\\b(admin|owner|agent)\\b`) }).click();
      if (await this.isOwned(conversation)) return;
    }
    throw new Error(`Assigning the conversation to ${name} did not take effect after 3 attempts.`);
  }

  async resolve(): Promise<void> {
    await this.page.getByRole('button', { name: 'Resolve', exact: true }).click();
  }

  // --- Saved replies ---

  /**
   * The composer's "Saved replies / Copilot / Help article" toolbar sits under a collapsed
   * "+ Writing tools" toggle: the button is in the page but hidden until it's expanded. Read
   * `aria-expanded` rather than guessing from visibility, so a toggle that's already open
   * isn't clicked shut.
   */
  async openSavedReplies(): Promise<void> {
    const writingTools = this.page.getByRole('button', { name: /Writing tools/ });
    if ((await writingTools.getAttribute('aria-expanded')) !== 'true') {
      await writingTools.click();
    }
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
    // Shows "More" but its aria-label is "More actions", which is what the accessible name
    // is (older builds: plain "More"). The regex excludes "More inbox controls" and
    // "More conversation controls", which are different buttons.
    await this.page.getByRole('button', { name: /^More( actions)?$/ }).click();
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
  // Log a task opens a modal dialog (closed via its Cancel button, see BasePage.closeDialog).
  // Macros and Create Support case open a right-hand *drawer* instead, each with its own
  // "Close <title>" button. Only entry and exit are verified: nothing is submitted, so no task,
  // macro run or support case is created. (The Create Support case drawer has a real
  // "Create Support case" submit button — never click that one.)

  async openLogTaskDialog(): Promise<void> {
    await this.openMoreMenu();
    await this.page.getByText('Log a task', { exact: true }).click();
    await expect(this.page.getByText('What needs to happen', { exact: true })).toBeVisible({ timeout: 10_000 });
  }

  async openMoreMenuDrawer(title: 'Macros' | 'Create Support case'): Promise<void> {
    await this.openMoreMenu();
    await this.page.getByText(title, { exact: true }).click();
    await expect(this.drawerCloseButton(title)).toBeVisible({ timeout: 15_000 });
  }

  async closeMoreMenuDrawer(title: 'Macros' | 'Create Support case'): Promise<void> {
    await this.drawerCloseButton(title).click();
    await expect(this.drawerCloseButton(title)).toBeHidden({ timeout: 15_000 });
  }

  private drawerCloseButton(title: string) {
    return this.page.getByRole('button', { name: `Close ${title}`, exact: true });
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

  /**
   * Moves the open Resolved conversation `name` back to Open, and confirms it. The status
   * `<select>` is the way: on a resolved conversation the Resolve button is *disabled*.
   *
   * Once it leaves the Resolved list the app auto-selects a *different* conversation, so the
   * select on screen no longer belongs to `name` — reading it (or clicking anything else,
   * e.g. Resolve) would act on an unrelated conversation. So confirm by finding `name` again.
   */
  async reopen(name: string): Promise<void> {
    await this.setStatus('Open');
    await this.findAndOpen(name);
    await this.openMoreConversationControls();
    await expect.poll(() => this.currentStatus(), { timeout: 20_000 }).toBe('open');
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

  /**
   * Snoozes the open conversation and confirms the status select reads "snoozed". The click on
   * the duration can be swallowed on a slow machine, so verify and retry from a fresh open
   * (a snoozed conversation stays in the Active work list, so the on-screen status is its own).
   */
  async snooze(conversation: string, duration: '1 hour' | '4 hours' | 'Tomorrow' | 'Next week'): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await this.openConversation(conversation);
        await this.openMoreConversationControls();
      }
      await this.snoozeFor(duration);
      try {
        await expect.poll(() => this.currentStatus(), { timeout: 20_000 }).toBe('snoozed');
        return;
      } catch {
        // swallowed, or not applied yet — go round again
      }
    }
    throw new Error('Snoozing did not take effect after 3 attempts.');
  }

  // --- Ownership release ---

  /**
   * Hands a conversation you own back to the unassigned queue, and confirms it. The drawer's
   * button can swallow a click made right as the drawer appears (it hasn't finished loading),
   * so verify — "Take ownership" is only enabled again once nobody owns it — and retry.
   */
  async releaseOwnership(): Promise<void> {
    const reassign = this.page.getByRole('button', { name: 'Reassign', exact: true });
    const release = this.page.getByText('Return to unassigned queue', { exact: true });
    const takeOwnership = this.takeOwnershipButton();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!(await release.isVisible())) await reassign.click();
      if (!(await this.appears(release, 8_000))) continue;
      await release.click();
      try {
        await expect(takeOwnership).toBeEnabled({ timeout: 10_000 });
        return;
      } catch {
        // swallowed, or not applied yet — go round again
      }
    }
    throw new Error('Could not return the conversation to the unassigned queue after 3 attempts.');
  }

  /**
   * Cleanup helper: if the open conversation is assigned to anyone, return it to the
   * unassigned queue and wait until that has taken effect. "Reassign" only exists while
   * someone owns it, but it renders a moment after the conversation opens — an instant
   * visibility check there silently skips the release, which is how the fixture got left
   * "Assigned to Abraham". So wait for it before deciding.
   */
  async releaseOwnershipIfAssigned(): Promise<void> {
    const reassign = this.page.getByRole('button', { name: 'Reassign', exact: true });
    if (await this.appears(reassign, 10_000)) {
      await this.releaseOwnership();
      await expect(reassign).toBeHidden({ timeout: 30_000 });
    }
  }

  /**
   * Finds `name` from scratch (see findAndOpen) and reads its status. Use this instead of
   * reading the status select on screen after an action that moves the conversation to a
   * different list — the app then auto-selects another conversation, whose status is what
   * the select shows. Returns 'unknown' if it can't be found right now, so it can be polled.
   */
  async statusOf(name: string): Promise<string> {
    try {
      await this.findAndOpen(name);
      await this.openMoreConversationControls();
      return await this.currentStatus();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Reliably re-opens `name` after a status/ownership change, regardless of which tab or
   * state filter it now falls under (e.g. once Resolved or reassigned, it can disappear
   * from whatever view was active and the app auto-selects a different conversation).
   * Used to safely apply a revert step after a state-mutating test action.
   *
   * There is no single "all states" filter pill — only Active work / Open now / Waiting /
   * Resolved, each mutually exclusive. "Active work" already covers New / Open / Pending /
   * Waiting / Snoozed, so trying it and then Resolved reaches every state the fixture can
   * end up in. The search is cleared and retyped after each filter change: typing the same
   * text again is a no-op, which leaves the new list unfiltered/stale.
   */
  async findAndOpen(name: string): Promise<void> {
    await this.goto();
    await this.selectTopTab('All');
    await this.openFilters();

    const match = this.page.getByText(name, { exact: true }).first();
    for (const state of ['Active work', 'Resolved'] as const) {
      await this.selectStateFilter(state);
      // Changing the filter reloads the list and can wipe a search typed a moment too early,
      // so retype it until the result shows up rather than trusting a single attempt.
      for (let attempt = 0; attempt < 3; attempt++) {
        await this.search('');
        await this.search(name);
        if (await this.appears(match, 6_000)) {
          await match.click();
          await this.dismissCopilot();
          return;
        }
      }
    }
    throw new Error(
      `"${name}" wasn't found under Active work or Resolved (with the All owners tab). Was the ` +
        `fixture conversation deleted or renamed? See "Test data notes" in the README.`
    );
  }
}
