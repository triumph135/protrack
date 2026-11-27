import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const shots: Array<[string, string, string]> = [
  ['Reports', "This year's activity", 'reports-landing'],
  ['Activity', 'Activity for a period', 'activity-last-year'],
  ['Job cost', 'Job cost summary', 'job-cost-summary'],
  ['Vendor', 'Vendor spend', 'vendor-spend'],
  ['Builder', 'Pick what to report on', 'custom-builder'],
  ['Schedule', 'Every Monday at 7:00 AM (America/New_York)', 'schedule-sheet'],
  ['History', "Email isn't set up yet", 'run-history'],
  ['Unsubscribe', 'Unsubscribe from this report', 'unsubscribe'],
]

test.afterEach(async ({ page }, info) => {
  await mkdir('/opt/cursor/artifacts', { recursive: true })
  const slug = info.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  await page.screenshot({ path: `/opt/cursor/artifacts/${slug}-${info.project.name}.png`, fullPage: true })
})

test('schedule wizard walks when, who, and format', async ({ page }) => {
  await page.goto('/preview?screen=Schedule&bare=1')
  await expect(page.getByText('Every Monday at 7:00 AM (America/New_York)')).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('master-a@example.test')).toBeVisible()
  await page.screenshot({ path: '/opt/cursor/artifacts/schedule-who-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Next 3 sends')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create schedule' })).toBeVisible()
  await page.screenshot({ path: '/opt/cursor/artifacts/schedule-format-desktop.png', fullPage: true })
})

test('custom builder preview changes with the source', async ({ page }) => {
  await mkdir('/opt/cursor/artifacts', { recursive: true })
  await page.setViewportSize({ width: 1280, height: 1100 })
  await page.goto('/preview?screen=Builder&bare=1&theme=light')
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Build a custom report')
  await expect(page.getByRole('link', { name: /All reports/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pick a source' })).toBeVisible()
  await page.getByRole('button', { name: /^Costs/ }).click()
  await expect(page.getByText(/each cost row/)).toBeVisible()
  await expect(page.getByText('Home Depot')).toBeVisible()
  await page.screenshot({ path: '/opt/cursor/artifacts/builder-breadcrumb-light.png', fullPage: true })
  await page.screenshot({ path: '/opt/cursor/artifacts/builder-costs-light.png', fullPage: true })
  await page.getByRole('button', { name: /^Labor/ }).click()
  await expect(page.getByText(/each labor row/)).toBeVisible()
  await expect(page.getByText('Home Depot')).toHaveCount(0)
  await expect(page.getByRole('cell', { name: 'Alex Rivera' })).toBeVisible()
  await page.screenshot({ path: '/opt/cursor/artifacts/builder-labor-light.png', fullPage: true })
  await page.goto('/preview?screen=Builder&bare=1&theme=dark')
  await page.getByRole('button', { name: /^Invoices/ }).click()
  await expect(page.getByText(/each invoice row/)).toBeVisible()
  await expect(page.getByText('INV-100')).toBeVisible()
  await page.screenshot({ path: '/opt/cursor/artifacts/builder-invoices-dark.png', fullPage: true })
})

test('reports landing in light and dark, and team without job selectors', async ({ page }) => {
  await mkdir('/opt/cursor/artifacts', { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/preview?screen=Reports&bare=1&theme=dark')
  await expect(page.getByText("This year's activity")).toBeVisible()
  await expect(page.locator('header').getByText('All change orders')).toHaveCount(0)
  await page.screenshot({ path: '/opt/cursor/artifacts/reports-landing-dark.png', fullPage: true })
  await page.goto('/preview?screen=Reports&bare=1&theme=light')
  await expect(page.getByText('Build a custom report')).toBeVisible()
  await page.screenshot({ path: '/opt/cursor/artifacts/reports-landing-light.png', fullPage: true })
  await page.goto('/preview?screen=Team&bare=1&theme=dark')
  await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
  await expect(page.locator('header').getByText('JOB-A-001')).toHaveCount(0)
  await expect(page.locator('header').getByText('All change orders')).toHaveCount(0)
  await expect(page.getByText('Ada Master').first()).toBeVisible()
  await page.screenshot({ path: '/opt/cursor/artifacts/team-no-selectors-dark.png', fullPage: true })
  await page.goto('/preview?screen=Activity&bare=1&theme=light')
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Activity for a period')
  await expect(page.getByRole('link', { name: /All reports/ })).toBeVisible()
  await page.screenshot({ path: '/opt/cursor/artifacts/activity-results-light.png', fullPage: true })
})

test('all projects overview is the portfolio dashboard', async ({ page }) => {
  await mkdir('/opt/cursor/artifacts', { recursive: true })
  await page.setViewportSize({ width: 1280, height: 1400 })
  await page.goto('/preview?screen=All%20projects&bare=1&theme=light')
  await expect(page.getByRole('heading', { name: 'All projects' })).toBeVisible()
  await expect(page.getByText('Budget versus actual')).toBeVisible()
  await expect(page.getByText('Cost trend')).toBeVisible()
  await expect(page.getByText('Invoices over time')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Margin' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'JOB-A-001' })).toBeVisible()
  await expect(page.getByText('Materials').first()).toBeVisible()
  await expect(page.getByText('Cap Leases').first()).toBeVisible()
  await expect(page.getByText('$15,550.00').first()).toBeVisible()
  await expect(page.getByText('$28,000.00').first()).toBeVisible()
  await expect(page.getByText('$152,000.00').first()).toBeVisible()
  await expect(page.locator('header').getByText('All change orders')).toHaveCount(0)
  await expect(page.locator('header').getByText('JOB-A-001')).toBeVisible()
  await page.screenshot({ path: '/opt/cursor/artifacts/overview-all-projects-light.png', fullPage: true })
  await page.goto('/preview?screen=All%20projects&bare=1&theme=dark')
  await expect(page.getByText('Invoices over time')).toBeVisible()
  await expect(page.locator('header').getByText('All change orders')).toHaveCount(0)
  await page.screenshot({ path: '/opt/cursor/artifacts/overview-all-projects-dark.png', fullPage: true })
})

for (const [screen, heading, slug] of shots) {
  test(`report preview ${slug} shows ${heading}`, async ({ page }, info) => {
    const mobile = info.project.name === 'mobile'
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/preview?screen=${encodeURIComponent(screen)}&bare=1${mobile ? '&width=mobile' : ''}`)
    await expect(page.getByText(heading).first()).toBeVisible()
    await page.screenshot({ path: `/opt/cursor/artifacts/${slug}-${info.project.name}.png`, fullPage: true })
  })
}
