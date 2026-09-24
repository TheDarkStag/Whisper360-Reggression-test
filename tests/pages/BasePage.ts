import { Page, Locator, expect } from '@playwright/test';

/**
 * Shared behavior every module page object needs: dismissing the floating overlays that
 * auto-open across the app and can intercept clicks on whatever they happen to cover.
 */
export class BasePage {
  constructor(protected readonly page: Page) {}

  /**
   * Dismisses the floating overlays that auto-mount across the app and can intercept
   * clicks on whatever they happen to cover: the "Winnie" AI copilot popup, the
   * customer-support webchat widget (`#whisper360-webchat`, toggled by `#w360-launcher`),
   * and the "Receive calls when Whisper360 is closed" notification banner (dismissed via
   * its "Not now" button — it has no visible label, just an aria-label). Call this after
   * any navigation or major state change — fresh instances can mount per screen.
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

    const webchatPanel = this.page.locator('#whisper360-webchat').getByText('Start a conversation');
    if (await webchatPanel.isVisible().catch(() => false)) {
      await this.page.locator('#w360-launcher').click({ timeout: 1000 }).catch(() => {});
    }

    const callAlertsBanner = this.page.getByRole('button', { name: 'Not now', exact: true });
    if (await callAlertsBanner.isVisible().catch(() => false)) {
      await callAlertsBanner.click({ timeout: 1000 }).catch(() => {});
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
    if (await cancel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancel.click();
      await this.waitForModalBackdropGone();
      return;
    }

    const closeIcon = this.page.getByRole('button', { name: /^Close /i }).first();
    if (await closeIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
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
