import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Email module (Messenger OS) — a ticket-based view distinct from Team Inbox's
 * conversation view, with its own status/priority/assignment controls per ticket.
 */
export class EmailPage extends BasePage {
  async goto(): Promise<void> {
    // The suite=messenger&page=email query param isn't a reliable deep link (it can
    // silently land on the Dashboard instead), so navigate via the sidebar link explicitly.
    await this.page.goto('/v2?suite=messenger&page=inbox');
    await this.dismissCopilot();
    await expect(this.page.getByText('Team Inbox').first()).toBeVisible({ timeout: 30_000 });
    // The nav click is occasionally swallowed right after the inbox first renders (a
    // hydration timing race, not a real bug) — retry it rather than failing outright.
    const newTicketButton = this.page.getByRole('button', { name: 'New ticket' });
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.page.getByRole('button', { name: 'Email', exact: true }).click();
      await this.dismissCopilot();
      if (await newTicketButton.isVisible({ timeout: 8_000 }).catch(() => false)) return;
    }
    await expect(newTicketButton).toBeVisible({ timeout: 20_000 });
  }

  async selectFilterTab(tab: 'All' | 'Open' | 'Pending' | 'Resolved' | 'Closed'): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(`^${tab} \\d+$`) }).click();
  }

  async search(query: string): Promise<void> {
    await this.page.getByPlaceholder('Search email tickets…').fill(query);
  }

  async openTicket(subject: string): Promise<void> {
    await this.page.getByText(subject, { exact: true }).first().click();
    await this.dismissCopilot();
  }

  get replyBody() {
    return this.page.getByPlaceholder(/Write your reply/i);
  }

  async reply(message: string): Promise<void> {
    await this.replyBody.fill(message);
    await this.page.getByRole('button', { name: 'Send', exact: true }).click();
  }

  async takeOwnership(): Promise<void> {
    await this.page.getByRole('button', { name: 'Take ownership' }).click();
  }

  async resolve(): Promise<void> {
    await this.page.getByRole('button', { name: 'Resolve', exact: true }).click();
  }
}
