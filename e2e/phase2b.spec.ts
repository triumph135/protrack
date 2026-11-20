import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

test.afterEach(async ({ page }, info) => {
  await mkdir('/opt/cursor/artifacts', { recursive: true })
  const slug = info.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  await page.screenshot({ path: `/opt/cursor/artifacts/${slug}-${info.project.name}.png`, fullPage: true })
})

test('sign-in screen is ready', async ({ page }) => {
  await page.goto('/preview?screen=Login&bare=1')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue('master-a@example.test')
})

test('a reversal shows the net copy and the reversed rows', async ({ page }) => {
  await page.goto('/preview?screen=Reverse&bare=1')
  await expect(page.getByText('Net $0.00 after the reversal')).toBeVisible()
  await expect(page.getByLabel('Amount')).toHaveValue('250')
  await expect(page.getByText('This will net $250.00 against the original. Remaining will be $0.00.')).toBeVisible()
  await expect(page.getByText('past zero')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Post reversal' })).toBeVisible()
})

test('a credit memo confirms the remaining billed amount', async ({ page }) => {
  await page.goto('/preview?screen=Credit&bare=1')
  await expect(page.getByRole('heading', { name: 'Post a credit memo' })).toBeVisible()
  await expect(page.getByLabel('Amount')).toHaveValue('1800')
  await expect(page.getByText('This will net $1,800.00 against the original. Remaining will be $0.00.')).toBeVisible()
  await expect(page.getByText('past zero')).toHaveCount(0)
  await expect(page.getByLabel('Date billed')).toBeVisible()
})

test('moving a labor entry warns before it leaves labor', async ({ page }) => {
  await page.goto('/preview?screen=Move&bare=1')
  await page.locator('#move-category').selectOption({ label: 'Others' })
  await expect(page.getByText('This entry leaves labor.')).toBeVisible()
})

test('a new cost can hold a file before it is saved', async ({ page }) => {
  await page.goto('/preview?screen=Attachments&bare=1')
  await expect(page.getByText('steel-ticket.pdf')).toBeVisible()
  await expect(page.getByText('1 file on the project')).toBeVisible()
})

test('a project rate shows its effective date', async ({ page }) => {
  await page.goto('/preview?screen=Rates&bare=1')
  await expect(page.getByText('Used for labor dated on or after this date on that project.')).toBeVisible()
  await expect(page.getByRole('listitem').getByText('JOB-A-001 · Acme Test Job')).toBeVisible()
  await expect(page.getByText(/Effective 2026-06-01/)).toBeVisible()
})

test('overview labels gross profit as invoiced minus cost', async ({ page }) => {
  await page.goto('/preview?screen=Overview&bare=1')
  await expect(page.getByText('Gross profit')).toBeVisible()
  await expect(page.getByText('Invoiced minus cost')).toBeVisible()
})
