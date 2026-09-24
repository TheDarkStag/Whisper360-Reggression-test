import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/DashboardPage';

test.describe('Dashboards', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
  });

  test('overview dashboard loads with key widgets', async ({ page }) => {
    await expect(page.getByText('Channel mix')).toBeVisible();
    await expect(page.getByText('Conversation states')).toBeVisible();
    await expect(page.getByText('Team workload')).toBeVisible();
    await expect(page.getByText('Speed & SLA')).toBeVisible();
  });

  test('switching to Operations detail tab renders without error', async ({ page }) => {
    await dashboard.selectTab('Operations detail');
    await expect(page.getByRole('button', { name: 'Agent efficiency', exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('switching to Agent efficiency tab renders without error', async ({ page }) => {
    await dashboard.selectTab('Agent efficiency');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('changing the reporting period (7 days / 30 days) updates the view', async ({ page }) => {
    await expect(page.getByText('7 days', { exact: true })).toBeVisible();
    await dashboard.selectPeriod('30 days');
    await expect(page.getByText('Messenger operations')).toBeVisible();
  });
});
