import { Page, Locator, expect } from '@playwright/test';

const pagesWithOverlayHandlers = new WeakSet<Page>();

/**
 * Several floating overlays mount on their own schedule — often a second or two *after* the
 * page looks ready, and later on a slow CI runner than on a dev machine — and cover whatever
 * a test is about to click. Dismissing them once after navigation isn't enough (that's what
 * broke the first scheduled CI runs), so each is registered as a Playwright locator handler:
 * it fires automatically, right before any click/fill or auto-waiting assertion, whenever
 * the overlay is on screen.
 */
function registerOverlayHandlers(page: Page): void {
  if (pagesWithOverlayHandlers.has(page)) return;
  pagesWithOverlayHandlers.add(page);

  // "Winnie" AI copilot popup — only the expanded panel (it has a Close button); the
  // collapsed launcher pill doesn't cover anything and shouldn't trigger the handler. It
  // renders in two shapes: `aside[data-winnie-pilot]` (bottom-right) and
  // `div[data-winnie-dropdown]` (anchored over the inbox tabs, with "Start interactive
  // tour" / "Don't pop up again"). Always use Close — "Don't pop up again" would change a
  // saved setting on the account.
  const winnieOpen = page
    .locator('aside[data-winnie-pilot], div[data-winnie-dropdown]')
    .filter({ has: page.getByRole('button', { name: /^Close / }) })
    .first();
  void page.addLocatorHandler(winnieOpen, async (overlay) => {
    await overlay.getByRole('button', { name: /^Close / }).first().click();
  });

  // "Receive calls when Whisper360 is closed" banner — its dismiss control has no visible
  // text, only aria-label="Not now".
  void page.addLocatorHandler(page.getByRole('button', { name: 'Not now', exact: true }).first(), async (overlay) => {
    await overlay.click();
  });

  // "Product session recording" notice, bottom-right, covers the email composer's Send.
  void page.addLocatorHandler(page.getByRole('button', { name: 'Got it', exact: true }).first(), async (overlay) => {
    await overlay.click();
  });

  // Customer-support webchat widget (`#whisper360-webchat`, toggled by `#w360-launcher`).
  void page.addLocatorHandler(
    page.locator('#whisper360-webchat').getByText('Start a conversation').first(),
    async () => {
      await page.locator('#w360-launcher').click();
    }
  );
}

/**
 * Shared behavior every module page object needs: dismissing the floating overlays that
 * auto-open across the app and can intercept clicks on whatever they happen to cover.
 */
export class BasePage {
  constructor(protected readonly page: Page) {
    registerOverlayHandlers(page);
  }

  /**
   * Waits up to `timeout` for `locator` to become visible and reports whether it did.
   * Use this — never `locator.isVisible({ timeout })` — to branch on something that may
   * still be loading: `isVisible()` ignores any timeout and answers instantly, so it reports
   * "not there" for anything that simply hasn't rendered yet (the cause of several CI-only
   * failures).
   */
  protected async appears(locator: Locator, timeout = 5_000): Promise<boolean> {
    try {
      await locator.waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Best-effort sweep for overlays that are already up right now. The locator handlers
   * registered above are what protect against overlays that show up *later*; this just
   * clears the ones present at the moment it's called (e.g. before a screenshot-style read).
   */
  async dismissCopilot(): Promise<void> {
    const closeButtons = this.page.getByRole('button', { name: /^Close / });
    const count = await closeButtons.count();
    for (let i = 0; i < count; i++) {
      try {
        await closeButtons.nth(i).click({ timeout: 1000 });
      } catch {
        // popup already gone
      }
    }

    for (const name of ['Not now', 'Got it']) {
      const button = this.page.getByRole('button', { name, exact: true });
      if (await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 1000 }).catch(() => {});
      }
    }

    const webchatPanel = this.page.locator('#whisper360-webchat').getByText('Start a conversation');
    if (await webchatPanel.isVisible().catch(() => false)) {
      await this.page.locator('#w360-launcher').click({ timeout: 1000 }).catch(() => {});
    }
  }

  /**
   * Closes a custom (non-native) dropdown/popover by clicking its own invisible
   * click-outside backdrop (`div.fixed.inset-0`), rather than guessing at a page
   * coordinate that might not actually be "outside" the popover.
   */
  async closePopoverViaBackdrop(): Promise<void> {
    await this.page.locator('div.fixed.inset-0').first().click({ timeout: 5_000 }).catch(() => {});
  }

  /** Waits for any leftover modal backdrop from a previous action to fully close. */
  async waitForModalBackdropGone(timeout = 8_000): Promise<void> {
    await this.page.locator('div.fixed.inset-0').first().waitFor({ state: 'detached', timeout }).catch(() => {});
  }

  /**
   * Closes a modal dialog (Log a task, Macros, Create Support case, …) without submitting
   * it: tries a "Cancel" button first, then a "Close ..." icon button, then the backdrop
   * itself. Never presses Escape as a first resort — several of these dialogs don't bind
   * it, leaving the modal (and its backdrop) still up and blocking the next action.
   */
  async closeDialog(): Promise<void> {
    const cancel = this.page.getByRole('button', { name: 'Cancel', exact: true });
    if (await this.appears(cancel, 2_000)) {
      await cancel.click();
      await this.waitForModalBackdropGone();
      return;
    }

    const closeIcon = this.page.getByRole('button', { name: /^Close /i }).first();
    if (await this.appears(closeIcon, 2_000)) {
      await closeIcon.click();
      await this.waitForModalBackdropGone();
      return;
    }

    await this.closePopoverViaBackdrop();
    await this.waitForModalBackdropGone();
  }

  get body(): Locator {
    return this.page.locator('body');
  }

  async openAccountMenu(): Promise<void> {
    await this.dismissCopilot();
    await this.page.getByRole('button', { name: 'Account menu' }).click();
  }

  async signOut(): Promise<void> {
    await this.openAccountMenu();
    await this.page.getByText('Sign out', { exact: true }).click();
    await expect(this.page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible();
  }
}

export { expect };
