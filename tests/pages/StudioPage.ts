import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * AI Studio's agent creation & management. `suite=ai&page=agents` isn't a reliable deep
 * link (it can silently land on Overview instead), so this page object always navigates
 * via `suite=ai` (Overview, which also carries the "Create an agent" entry point) and, for
 * the Agents list specifically, clicks the sidebar link explicitly.
 */
export class StudioPage extends BasePage {
  /**
   * Lands in Agent Studio — the familiar overview that carries "Create an agent". `suite=ai`
   * can start from any of three places depending on the account's remembered choice:
   *   1. the first-time "What are you building today?" screen (Bot Studio vs. Agent Studio),
   *   2. straight into Bot Studio (the header dropdown "Switch AI studio" reads "bot"), or
   *   3. already in Agent Studio.
   * Wait for whichever one loads, then move to Agent Studio if we're not already there.
   *
   * The card is matched with `:not(option)` because the header dropdown also contains a
   * (hidden) `<option>Agent Studio</option>` that a plain text match picks up first.
   */
  async gotoOverview(): Promise<void> {
    await this.page.goto('/v2?suite=ai');

    const createAgentButton = this.page.locator('[data-winnie="studio-new-agent"]');
    const studioSwitcher = this.page.getByRole('combobox', { name: 'Switch AI studio' });
    const agentStudioCard = this.page.locator(':not(option):text-is("Agent Studio")').first();

    await createAgentButton.or(studioSwitcher).or(agentStudioCard).first().waitFor({ state: 'visible', timeout: 30_000 });

    if (await createAgentButton.isVisible()) return;

    if (await studioSwitcher.isVisible()) {
      await studioSwitcher.selectOption('agent');
    } else {
      await agentStudioCard.click();
    }
    await createAgentButton.waitFor({ state: 'visible', timeout: 30_000 });
  }

  async gotoAgentsList(): Promise<void> {
    await this.gotoOverview();
    await this.page.getByRole('button', { name: 'Agents', exact: true }).click();
    await this.dismissCopilot();
    await expect(this.page.getByPlaceholder(/^Search \d+ agents…$/)).toBeVisible({ timeout: 15_000 });
  }

  /** Opens the "Create an agent" screen listing all starting-point methods. */
  async openCreateAgent(): Promise<void> {
    await this.gotoOverview();
    // The "studio-new-agent" data attribute disambiguates this from an unrelated small
    // nav-pill button that happens to carry the same visible label.
    await this.page.locator('[data-winnie="studio-new-agent"]').click();
    await expect(this.page.getByRole('heading', { name: 'Create an agent' })).toBeVisible();
    // A separate Winnie copilot instance mounts for this screen and can intercept clicks.
    await this.dismissCopilot();
  }

  /**
   * Opens the Standard Agent Builder. Note: this immediately creates a persisted draft
   * named "New agent" in the workspace — it is not a no-op preview.
   */
  async openStandardBuilder(): Promise<void> {
    await this.openCreateAgent();
    await this.page.getByText('Standard 11 stages').click();
    await expect(this.page.getByRole('heading', { name: 'Identity & persona' })).toBeVisible({ timeout: 10_000 });
  }

  async saveDraft(): Promise<void> {
    // exact:true avoids matching the neighboring "Save draft" button.
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
  }

  /** Deletes every agent with this exact name from the Agents list (used for test cleanup). */
  async deleteAllAgentsNamed(name: string): Promise<void> {
    await this.gotoAgentsList();

    for (let i = 0; i < 20; i++) {
      // Wait out any leftover modal backdrop from a previous loop iteration.
      await this.waitForModalBackdropGone();
      await this.dismissCopilot();
      await this.page.getByPlaceholder(/^Search \d+ agents…$/).fill(name);
      const row = this.page.getByText(name, { exact: true }).first();
      if (!(await row.isVisible().catch(() => false))) break;

      await row.click();
      await this.page.getByRole('button', { name: 'Delete agent' }).click();
      // The confirm modal has no ARIA dialog role; its input's placeholder is the agent name.
      await this.page.getByPlaceholder(name, { exact: true }).fill(name);
      await this.page.getByRole('button', { name: 'Delete permanently' }).click();
      await expect(this.page.getByRole('button', { name: 'Delete permanently' })).not.toBeVisible({ timeout: 15_000 });
    }
  }
}
