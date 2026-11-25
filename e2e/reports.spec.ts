import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const shots: Array<[string, string, string]> = [
  ['Reports', "This year's activity", 'reports-landing'],
  ['Activity', 'Activity for a period', 'activity-last-year'],
  ['Job cost', 'Job cost summary', 'job-cost-summary'],
  ['Vendor', 'Vendor spend', 'vendor-spend'],
  ['Builder', 'Vendor months', 'custom-builder'],
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

for (const [screen, heading, slug] of shots) {
  test(`report preview ${slug} shows ${heading}`, async ({ page }, info) => {
    const mobile = info.project.name === 'mobile'
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/preview?screen=${encodeURIComponent(screen)}&bare=1${mobile ? '&width=mobile' : ''}`)
    await expect(page.getByText(heading).first()).toBeVisible()
    await page.screenshot({ path: `/opt/cursor/artifacts/${slug}-${info.project.name}.png`, fullPage: true })
  })
}
