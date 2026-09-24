import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export const TEST_URL = process.env.TEST_URL ?? 'https://whisper360.io/v2?suite=messenger&page=inbox&auth=login';
export const TEST_EMAIL = process.env.TEST_EMAIL ?? '';
export const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto(TEST_URL);
  }

  async login(email: string, password: string): Promise<void> {
    await this.goto();
    await this.page.getByPlaceholder(/you@yourbusiness\.com/i).fill(email);
    await this.page.getByPlaceholder('••••••••').fill(password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
  }
}
