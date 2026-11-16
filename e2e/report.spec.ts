import { expect, test, type Page } from '@playwright/test'
import { profile, repos, report } from './fixtures/report'

/** Mocks the github-proxy function and the Supabase RPC cache; counts how often GitHub-side work happens. */
async function mock(page: Page, cached: { report?: unknown } = {}) {
  const calls = { report: 0, saves: 0 }
  const cors = { 'access-control-allow-origin': '*', 'x-devscope-proxy': '1' }

  await page.route('https://avatars.githubusercontent.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }),
  )
  await page.route('http://127.0.0.1:54321/functions/v1/github-proxy/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/functions/v1/github-proxy', '')
    if (path === '/users/octocat') return route.fulfill({ status: 200, headers: cors, json: profile })
    if (path === '/users/octocat/repos') return route.fulfill({ status: 200, headers: cors, json: repos })
    if (path === '/users/octocat/report') {
      calls.report++
      return route.fulfill({ status: 200, headers: cors, json: report })
    }
    return route.fulfill({ status: 404, headers: cors, json: {} })
  })
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/*', (route) => {
    const c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c })
    const fn = new URL(route.request().url()).pathname.split('/').pop() ?? ''
    if (fn === 'get_cached_report' && cached.report) return route.fulfill({ status: 200, headers: c, json: { report: cached.report, fetched_at: new Date().toISOString() } })
    if (fn.startsWith('get_')) return route.fulfill({ status: 200, headers: c, json: null })
    if (fn.startsWith('acquire_')) return route.fulfill({ status: 200, headers: c, json: true })
    if (fn.startsWith('release_')) return route.fulfill({ status: 204, headers: c })
    if (fn === 'upsert_cached_report') calls.saves++
    return route.fulfill({ status: 200, headers: c, json: new Date().toISOString() })
  })
  return calls
}

test('profile CTA opens the full report with every section, and Back returns to the profile', { tag: '@proxy' }, async ({ page }) => {
  const calls = await mock(page)
  await page.goto('/?u=octocat')
  await page.getByTestId('open-report').click()

  await expect(page).toHaveURL(/view=report&report=octocat/)
  for (const id of ['dna-card', 'heatmap-card', 'velocity-card', 'tree-card', 'network-card', 'sentiment-card']) {
    await expect(page.getByTestId(id)).toBeVisible()
  }
  await expect(page.getByTestId('longest-streak')).toContainText('days')
  await expect(page.getByTestId('heatmap-card').getByRole('img', { name: /Isometric contribution heatmap/ })).toBeVisible()
  expect(calls.report).toBe(1)
  await expect.poll(() => calls.saves).toBe(1) // stored in the shared cache for the next visitor

  await page.getByRole('button', { name: 'Flat' }).click()
  await expect(page.getByRole('img', { name: /^Contribution heatmap/ })).toBeVisible()

  await page.goBack() // browser Back works: report is its own history entry
  await expect(page.getByTestId('open-report')).toBeVisible()
  await page.goForward()
  await expect(page.getByTestId('report-page')).toBeVisible()
})

test('a cached report is used without asking GitHub again', { tag: '@proxy' }, async ({ page }) => {
  const calls = await mock(page, { report })
  await page.goto('/?view=report&report=octocat')
  await expect(page.getByTestId('heatmap-card').getByRole('img').first()).toBeVisible()
  expect(calls.report).toBe(0)
})

test('shows a friendly message when the report cannot be built, while profile sections still render', { tag: '@proxy' }, async ({ page }) => {
  await mock(page)
  await page.route('http://127.0.0.1:54321/functions/v1/github-proxy/users/octocat/report', (r) =>
    r.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*', 'x-devscope-proxy': '1' }, json: {} }),
  )
  await page.goto('/?view=report&report=octocat')
  await expect(page.getByTestId('dna-card')).toContainText('The Octocat')
  await expect(page.getByTestId('tree-card').getByRole('img')).toBeVisible()
  await expect(page.getByTestId('heatmap-card').getByRole('button', { name: 'Try again' })).toBeVisible()
})
