import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto('/v2?suite=messenger&page=dashboard');
    await this.dismissCopilot();
    await expect(this.page.getByText('Messenger operations')).toBeVisible({ timeout: 20_000 });
  }

  async selectTab(tab: 'Overview' | 'Operations detail' | 'Agent efficiency'): Promise<void> {
    await this.page.getByRole('button', { name: tab, exact: true }).click();
  }

  async selectPeriod(period: 'Today' | '7 days' | '30 days'): Promise<void> {
    await this.page.getByText(period, { exact: true }).click();
  }
}
