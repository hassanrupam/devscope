import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * These tests mock GitHub and a stateful in-memory stand-in for the Supabase RPC
 * functions. The "database" object is shared between separate browser contexts, which
 * models the shared cache seen by different visitors.
 */

const octocat = {
  id: 583231,
  login: 'octocat',
  type: 'User',
  avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
  html_url: 'https://github.com/octocat',
  name: 'The Octocat',
  bio: 'Mascot of GitHub',
  company: '@github',
  location: 'San Francisco',
  blog: 'https://github.blog',
  public_repos: 8,
  followers: 1000,
  following: 9,
  created_at: '2011-01-25T18:44:36Z',
}

const octocatfan = {
  ...octocat,
  id: 999,
  login: 'octocatfan',
  name: 'Octo Fan',
  bio: 'Fan of the Octocat',
  avatar_url: 'https://avatars.githubusercontent.com/u/999?v=4',
  html_url: 'https://github.com/octocatfan',
  followers: 50,
  following: 3,
  public_repos: 1,
}

const repo = (id: number, owner: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  html_url: `https://github.com/${owner}/${name}`,
  description: `${name} description`,
  language: 'Go',
  stargazers_count: 0,
  forks_count: 0,
  fork: false,
  archived: false,
  pushed_at: '2026-10-01T00:00:00Z',
  ...extra,
})

// octocat: 2 own repos (120 stars, 15 forks) + 1 fork that must be ignored in every figure
const REPOS: Record<string, unknown[]> = {
  octocat: [
    repo(101, 'octocat', 'hello-world', { stargazers_count: 100, forks_count: 10, language: 'Go' }),
    repo(102, 'octocat', 'spoon-knife', { stargazers_count: 20, forks_count: 5, language: 'TypeScript' }),
    repo(103, 'octocat', 'forked-thing', { stargazers_count: 5000, forks_count: 900, language: 'Rust', fork: true }),
  ],
  octocatfan: [repo(201, 'octocatfan', 'fan-site', { stargazers_count: 7, forks_count: 1, language: 'Go' })],
}

interface FakeDb {
  rows: Map<string, { profile: unknown; fetched_at: string }>
  searchRows: Map<string, { results: unknown; fetched_at: string }>
  repoRows: Map<string, { repos: unknown; fetched_at: string }>
  repoRequests: string[]
  githubRequests: string[]
  searchRequests: string[]
  githubStatus: number
}

const newDb = (): FakeDb => ({
  rows: new Map(),
  searchRows: new Map(),
  repoRows: new Map(),
  repoRequests: [],
  githubRequests: [],
  searchRequests: [],
  githubStatus: 200,
})

const KNOWN_LOGINS = ['octocat', 'octocatfan', 'foo-octocat'] // last one must be filtered out for prefix "octo"
const searchItem = (id: number, login: string) => ({
  id,
  login,
  type: 'User',
  avatar_url: `https://avatars.githubusercontent.com/u/${id}?v=4`,
  html_url: `https://github.com/${login}`,
})

async function mockBackends(page: Page, db: FakeDb) {
  await page.route('https://avatars.githubusercontent.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }),
  )

  await page.route('https://api.github.com/users/*', async (route) => {
    const username = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '')
    db.githubRequests.push(username)
    const cors = { 'access-control-allow-origin': '*' }
    if (db.githubStatus !== 200) {
      return route.fulfill({ status: db.githubStatus, headers: cors, json: {} })
    }
    if (username === 'octocat') return route.fulfill({ status: 200, headers: cors, json: octocat })
    if (username === 'octocatfan') return route.fulfill({ status: 200, headers: cors, json: octocatfan })
    return route.fulfill({ status: 404, headers: cors, json: { message: 'Not Found' } })
  })

  await page.route('https://api.github.com/users/*/repos*', async (route) => {
    const cors = { 'access-control-allow-origin': '*' }
    const username = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[2] ?? '')
    db.repoRequests.push(username)
    if (db.githubStatus !== 200) return route.fulfill({ status: db.githubStatus, headers: cors, json: {} })
    const repos = REPOS[username]
    if (!repos) return route.fulfill({ status: 404, headers: cors, json: { message: 'Not Found' } })
    return route.fulfill({ status: 200, headers: cors, json: repos })
  })

  await page.route('https://api.github.com/search/users*', async (route) => {
    const cors = { 'access-control-allow-origin': '*' }
    const q = new URL(route.request().url()).searchParams.get('q') ?? ''
    const prefix = q.replace(' in:login', '')
    db.searchRequests.push(prefix)
    if (db.githubStatus !== 200) return route.fulfill({ status: db.githubStatus, headers: cors, json: {} })
    // Like GitHub, match anywhere in the login (the app must filter down to prefix matches).
    const items = KNOWN_LOGINS.filter((l) => l.includes(prefix)).map((l, i) => searchItem(i + 1, l))
    return route.fulfill({ status: 200, headers: cors, json: { total_count: items.length, items } })
  })

  await page.route('http://127.0.0.1:54321/rest/v1/rpc/*', async (route) => {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
    }
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })

    const fn = new URL(request.url()).pathname.split('/').pop()
    const args = request.postDataJSON() as {
      p_username?: string
      p_profile?: unknown
      p_prefix?: string
      p_results?: unknown
      p_repos?: unknown
    }
    const key = args.p_username ?? args.p_prefix ?? ''
    switch (fn) {
      case 'get_cached_profile':
        return route.fulfill({ status: 200, headers: cors, json: db.rows.get(key) ?? null })
      case 'get_cached_repos':
        return route.fulfill({ status: 200, headers: cors, json: db.repoRows.get(key) ?? null })
      case 'upsert_cached_repos': {
        const fetched_at = new Date().toISOString()
        db.repoRows.set(key, { repos: args.p_repos, fetched_at })
        return route.fulfill({ status: 200, headers: cors, json: fetched_at })
      }
      case 'get_cached_search':
        return route.fulfill({ status: 200, headers: cors, json: db.searchRows.get(key) ?? null })
      case 'acquire_profile_refresh_lock':
      case 'acquire_search_refresh_lock':
      case 'acquire_repos_refresh_lock':
        return route.fulfill({ status: 200, headers: cors, json: true })
      case 'release_profile_refresh_lock':
      case 'release_search_refresh_lock':
      case 'release_repos_refresh_lock':
        return route.fulfill({ status: 204, headers: cors })
      case 'upsert_cached_search': {
        const fetched_at = new Date().toISOString()
        db.searchRows.set(key, { results: args.p_results, fetched_at })
        return route.fulfill({ status: 200, headers: cors, json: fetched_at })
      }
      case 'upsert_cached_profile': {
        const fetched_at = new Date().toISOString()
        db.rows.set(key, { profile: args.p_profile, fetched_at })
        return route.fulfill({ status: 200, headers: cors, json: fetched_at })
      }
      default:
        return route.fulfill({ status: 404, headers: cors, json: {} })
    }
  })
}

async function newVisitor(browser: Browser, db: FakeDb) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await mockBackends(page, db)
  await page.goto('/')
  return { page, context }
}

async function search(page: Page, username: string) {
  await page.getByLabel('GitHub username').fill(username)
  await page.getByRole('button', { name: 'Search' }).click()
}

test('first search hits GitHub and stores the profile; a second visitor gets the shared cache', async ({ browser }) => {
  const db = newDb()

  const first = await newVisitor(browser, db)
  await search(first.page, 'octocat')
  await expect(first.page.getByRole('heading', { name: 'The Octocat' })).toBeVisible()
  await expect(first.page.getByTestId('result-status')).toContainText('Live from GitHub')
  expect(db.githubRequests).toEqual(['octocat'])
  expect(db.rows.has('octocat')).toBe(true)

  // Separate browser context = separate visitor with empty browser storage.
  const second = await newVisitor(browser, db)
  await search(second.page, 'OctoCat') // different capitalisation
  await expect(second.page.getByRole('heading', { name: 'The Octocat' })).toBeVisible()
  await expect(second.page.getByTestId('result-status')).toContainText('Shared cache')
  expect(db.githubRequests).toEqual(['octocat']) // still exactly one GitHub request

  await first.context.close()
  await second.context.close()
})

test('unknown user shows a not-found state and nothing is cached', async ({ browser }) => {
  const db = newDb()
  const { page, context } = await newVisitor(browser, db)

  await search(page, 'definitely-not-a-user')
  await expect(page.getByText('No GitHub user named "definitely-not-a-user" was found.')).toBeVisible()
  await expect(page.getByText('No users found whose username starts with')).toBeVisible()
  expect(db.rows.size).toBe(0)
  await context.close()
})

test('invalid input is rejected client-side without any request', async ({ browser }) => {
  const db = newDb()
  const { page, context } = await newVisitor(browser, db)

  await search(page, 'bad name!')
  await expect(page.getByRole('alert')).toContainText('not a valid GitHub username')
  expect(db.githubRequests).toHaveLength(0)
  await context.close()
})

test('theme toggle switches between light and dark and remembers the choice', async ({ browser }) => {
  const db = newDb()
  const context = await browser.newContext({ colorScheme: 'light' })
  const page = await context.newPage()
  await mockBackends(page, db)
  await page.goto('/')

  const headingCenter = await page.getByRole('heading', { name: 'DevExplore' }).evaluate((element) => {
    const box = element.getBoundingClientRect()
    return box.top + box.height / 2
  })
  const toggleCenter = await page.getByRole('button', { name: 'Switch to dark theme' }).evaluate((element) => {
    const box = element.getBoundingClientRect()
    return box.top + box.height / 2
  })
  expect(Math.abs(headingCenter - toggleCenter)).toBeLessThan(1)

  const switchToDark = page.getByRole('button', { name: 'Switch to dark theme' })
  await expect(switchToDark).toHaveAttribute('aria-pressed', 'false')
  await switchToDark.click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.reload()
  const switchToLight = page.getByRole('button', { name: 'Switch to light theme' })
  await expect(switchToLight).toHaveAttribute('aria-pressed', 'true')
  await switchToLight.click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  await context.close()
})

test('expired cache entry is shown as stale when GitHub fails', async ({ browser }) => {
  const db = newDb()
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
  db.rows.set('octocat', { profile: octocat, fetched_at: tenDaysAgo })
  db.githubStatus = 503

  const { page, context } = await newVisitor(browser, db)
  await search(page, 'octocat')

  await expect(page.getByRole('heading', { name: 'The Octocat' })).toBeVisible()
  await expect(page.getByTestId('result-status')).toContainText('may be outdated')
  await expect(page.getByRole('status').first()).toContainText('may be out of date')
  await context.close()
})

test('typing a prefix lists matching users, caches the list, and a tile opens the full profile', async ({ browser }) => {
  const db = newDb()

  const first = await newVisitor(browser, db)
  await search(first.page, 'octo')

  // "foo-octocat" contains the text but does not start with it, so it must not be listed.
  const tiles = first.page.getByTestId('user-list').getByRole('listitem')
  await expect(tiles).toHaveCount(2)
  await expect(tiles.nth(0)).toContainText('octocat')
  await expect(tiles.nth(1)).toContainText('octocatfan')
  await expect(first.page.getByTestId('search-status')).toContainText('Live from GitHub')
  expect(db.searchRequests).toEqual(['octo'])
  expect(db.searchRows.has('octo')).toBe(true)

  // Selecting a tile opens the (cached) full profile.
  await first.page.getByRole('button', { name: 'View profile of octocat', exact: true }).click()
  await expect(first.page.getByRole('heading', { name: 'The Octocat' })).toBeVisible()
  expect(db.rows.has('octocat')).toBe(true)

  // A different visitor searching the same prefix (different capitalisation) hits the shared cache only.
  const second = await newVisitor(browser, db)
  await search(second.page, 'OCTO')
  await expect(second.page.getByTestId('user-list').getByRole('listitem')).toHaveCount(2)
  await expect(second.page.getByTestId('search-status')).toContainText('Shared cache')
  expect(db.searchRequests).toEqual(['octo']) // still exactly one GitHub search request

  await first.context.close()
  await second.context.close()
})

test('Explore search can clear its input separately from clearing the results', async ({ browser }) => {
  const db = newDb()
  const { page, context } = await newVisitor(browser, db)

  await search(page, 'octo')
  const results = page.getByTestId('user-list')
  await expect(results).toBeVisible()

  await page.getByRole('button', { name: 'Clear username' }).click()
  await expect(page.getByLabel('GitHub username')).toHaveValue('')
  await expect(results).toBeVisible()

  await page.getByRole('button', { name: 'Clear results' }).click()
  await expect(page.getByText('Enter a username above to see their public profile, repositories and matching users.')).toBeVisible()
  await expect(results).toHaveCount(0)
  await expect(page).not.toHaveURL(/[?&]u=/)
  await context.close()
})

test('a full username still shows its profile and also lists users that start with it', async ({ browser }) => {
  const db = newDb()
  const { page, context } = await newVisitor(browser, db)

  await search(page, 'octocat')
  await expect(page.getByRole('heading', { name: 'The Octocat' })).toBeVisible()
  await expect(page.getByTestId('user-list').getByRole('listitem')).toHaveCount(2)
  await context.close()
})

test('profile shows repository details (forks excluded) and a second visitor gets them from the shared cache', async ({ browser }) => {
  const db = newDb()

  const first = await newVisitor(browser, db)
  await search(first.page, 'octocat')
  await expect(first.page.getByRole('heading', { name: 'Repositories & languages' })).toBeVisible()

  const totals = first.page.getByTestId('repo-totals')
  await expect(totals).toContainText('120') // 100 + 20 stars, the 5,000-star fork is ignored
  await expect(totals).toContainText('15') // forks received
  await expect(first.page.getByTestId('repos-status')).toContainText('Live from GitHub')
  await expect(first.page.getByRole('img', { name: /Languages: Go 50%, TypeScript 50%/ })).toBeVisible()
  const topRepos = first.page.getByTestId('top-repos').getByRole('listitem')
  await expect(topRepos).toHaveCount(2)
  await expect(topRepos.first()).toContainText('hello-world')
  expect(db.repoRequests).toEqual(['octocat'])
  expect(db.repoRows.has('octocat')).toBe(true)

  const second = await newVisitor(browser, db)
  await search(second.page, 'OctoCat')
  await expect(second.page.getByTestId('repos-status')).toContainText('Shared cache')
  await expect(second.page.getByTestId('repo-totals')).toContainText('120')
  expect(db.repoRequests).toEqual(['octocat']) // no second GitHub repos request

  await first.context.close()
  await second.context.close()
})

test('compare view lists users side by side and highlights the highest value in each row', async ({ browser }) => {
  const db = newDb()
  const { page, context } = await newVisitor(browser, db)

  const main = page.locator('main')
  const exploreWidth = await main.evaluate((element) => element.getBoundingClientRect().width)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /Compare/ }).click()
  const compareWidth = await main.evaluate((element) => element.getBoundingClientRect().width)
  expect(compareWidth).toBe(exploreWidth)
  await expect(page.getByText('Add at least two users to see them side by side.')).toBeVisible()

  const input = page.getByLabel('Add a GitHub username to compare')
  await input.fill('OctoCat')
  await page.getByRole('button', { name: 'Add user' }).click()
  await expect(page.getByText('Add one more user to start comparing.')).toBeVisible()

  // Duplicates and invalid names are rejected with a message.
  await input.fill('octocat')
  await page.getByRole('button', { name: 'Add user' }).click()
  await expect(page.getByRole('alert')).toContainText('already in the comparison')
  await input.fill('bad name!')
  await page.getByRole('button', { name: 'Add user' }).click()
  await expect(page.getByRole('alert')).toContainText('not a valid GitHub username')

  await input.fill('octocatfan')
  await page.getByRole('button', { name: 'Add user' }).click()

  const table = page.getByTestId('compare-table')
  await expect(table).toBeVisible()
  await expect(table.getByRole('columnheader', { name: /The Octocat/ })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: /Octo Fan/ })).toBeVisible()

  const followers = page.getByTestId('metric-followers')
  await expect(followers.locator('td').nth(0)).toContainText('1,000')
  await expect(followers.locator('td').nth(0)).toContainText('(highest)')
  await expect(followers.locator('td').nth(1)).toContainText('50')
  await expect(followers.locator('td').nth(1)).not.toContainText('(highest)')

  const stars = page.getByTestId('metric-stars')
  await expect(stars.locator('td').nth(0)).toContainText('120')
  await expect(stars.locator('td').nth(1)).toContainText('7')
  await expect(stars.locator('td').nth(0)).toContainText('(highest)')

  // "Following" is not a win-by-more metric, so nothing is highlighted there.
  await expect(page.getByTestId('metric-following')).not.toContainText('(highest)')

  // The comparison is reflected in the URL so it can be shared.
  await expect(page).toHaveURL(/view=compare&users=octocat,octocatfan/)

  const removeOctocatfan = page.getByRole('button', { name: 'Remove octocatfan from comparison' })
  await expect(removeOctocatfan.locator('svg')).toBeVisible()
  await removeOctocatfan.click()
  await expect(page.getByText('Add one more user to start comparing.')).toBeVisible()
  await context.close()
})

test('Compare can clear its input separately from clearing the comparison', async ({ browser }) => {
  const db = newDb()
  const { page, context } = await newVisitor(browser, db)

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /Compare/ }).click()
  const input = page.getByLabel('Add a GitHub username to compare')
  await input.fill('octocat')
  await page.getByRole('button', { name: 'Add user' }).click()
  await expect(page.getByText('Add one more user to start comparing.')).toBeVisible()

  await input.fill('octocatfan')
  await page.getByRole('button', { name: 'Clear comparison username' }).click()
  await expect(input).toHaveValue('')
  await expect(page.getByText('Add one more user to start comparing.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Compare (1)' })).toBeVisible()

  await page.getByRole('button', { name: 'Clear comparison' }).click()
  await expect(page.getByText('Add at least two users to see them side by side.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Compare', exact: true })).toBeVisible()
  await context.close()
})

test('a compare link restores the comparison, and "Add to compare" feeds it from a profile', async ({ browser }) => {
  const db = newDb()
  const { page, context } = await newVisitor(browser, db)

  await page.goto('/?view=compare&users=octocat,octocatfan')
  await expect(page.getByTestId('compare-table')).toBeVisible()
  await expect(page.getByTestId('metric-followers').locator('td').nth(0)).toContainText('1,000')

  // Switching to Explore and adding a profile to the comparison.
  await page.goto('/')
  await search(page, 'octocat')
  await expect(page.getByRole('heading', { name: 'The Octocat' })).toBeVisible()
  await page.getByRole('button', { name: 'Add to compare' }).click()
  await expect(page.getByRole('button', { name: /In comparison/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Compare (1)' })).toBeVisible()
  await context.close()
})

