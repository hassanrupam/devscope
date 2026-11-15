# DevExplore — Explore and compare GitHub developers

DevExplore turns public GitHub data into something you can browse and compare.

- **Explore:** search a full username for its profile, or type the first letters to list users whose username **starts with** it (avatar, username, account type).
- **Profile details:** for each profile, repository statistics (stars and forks received, original repositories), a language breakdown and the most-starred repositories.
- **Compare:** put 2–3 users side by side (followers, repositories, stars, forks, languages, activity) with the highest value in each row highlighted. A comparison has a shareable URL (`?view=compare&users=a,b`).

Profiles, repositories and prefix-search results are saved in a **shared Supabase cache**, so the next visitor (any browser, any session) gets the cached copy without another GitHub API request.

Static Vite + React + TypeScript app on free tiers. There is no application server; the only server-side code is one **optional** Supabase Edge Function that adds a GitHub token (see [GitHub token](#github-token-optional-recommended)).

## Stack

TypeScript · React · Vite · Tailwind CSS v4 · TanStack Query · Zod · Supabase (PostgreSQL + JS client) · Vitest · Playwright · Vercel Hobby.

UI primitives (`Button`, `Card`, `Badge`) live in `src/components/ui` using the shadcn/ui conventions (Tailwind + `cn()` helper). The shadcn CLI is not required.

## Prerequisites

- Node.js 20+ and npm
- A free [Supabase](https://supabase.com) account (**your action**)
- A free [Vercel](https://vercel.com) account and a Git repo host (**your action**)

## 1. Supabase setup (your action)

1. Create a new Supabase project.
2. Open **SQL Editor** and run, in order, the full contents of:
   1. `supabase/migrations/20261112000000_github_profile_cache.sql` (profile cache)
   2. `supabase/migrations/20261112100000_github_search_cache.sql` (prefix-search cache; **required for the user list to be cached**)
   3. `supabase/migrations/20261112200000_github_repos_cache.sql` (repository cache; **required for repository details and comparison to be cached**)

   (Or with the Supabase CLI: `supabase link --project-ref <ref> && supabase db push`.)
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / publishable key** → `VITE_SUPABASE_ANON_KEY`

> Never use the `service_role` key in this app. Only the public anon/publishable key belongs in the browser.

## 2. Local development

```bash
npm install
cp .env.example .env.local     # then fill in the two values from step 1
npm run dev
```

Without the env vars the app still works, but skips the shared cache and shows a notice.

## GitHub token (optional, recommended)

Without a token, GitHub allows only **60 requests/hour per visitor IP** (and a very low per-minute limit for user search). With a token the app is allowed **5,000 requests/hour** (30 searches/minute), shared by all visitors, so it is much harder to hit a limit. Cache hits never use any quota either way.

Since DevExplore also loads repositories, a profile that is not cached costs **two** GitHub requests (profile + repositories) and comparing three uncached users costs up to six. Without a token that is only ~30 new users per hour per visitor, so the token proxy is strongly recommended for repository details and comparison.

A token must never be placed in the frontend (every visitor could read it from the JavaScript bundle and use up your quota). So the token lives in a **Supabase secret** and the browser calls a small Edge Function, `supabase/functions/github-proxy`, which adds it. The function only allows three read-only requests (`GET /users/{username}`, `GET /users/{username}/repos` and `GET /search/users?q={prefix} in:login`), so it cannot be used as a general GitHub proxy. The app stays a static site on Vercel.

### A. Get the GitHub token (your action)

Use a **fine-grained personal access token** with no permissions, since DevExplore reads only public data:

1. Sign in to GitHub, click your profile picture (top right) → **Settings**.
2. In the left sidebar choose **Developer settings** → **Personal access tokens** → **Fine-grained tokens**.
3. Click **Generate new token**.
4. **Token name:** `devexplore`. **Expiration:** choose one (e.g. 90 days or 1 year) and put a reminder in your calendar to renew it; GitHub also allows no expiry, but an expiry limits damage if it ever leaks.
5. **Resource owner:** your own account.
6. **Repository access:** *Public repositories (read-only)*. Do **not** grant any extra repository, account or organization permissions.
7. Click **Generate token** and copy the value (starts with `github_pat_`). GitHub shows it only once.

Direct link: https://github.com/settings/personal-access-tokens/new

Treat it like a password: never commit it, never paste it into a `VITE_` variable, never put it in `.env.example`.

### B. Deploy the proxy (your action)

Run these from the project root (requires Node.js; `npx` downloads the Supabase CLI on demand):

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF        # ref = the xxxx in https://xxxx.supabase.co

# Store the token as a Supabase secret (replace the value with your own token):
npx supabase secrets set GITHUB_API_TOKEN=github_pat_xxxxxxxxxxxxxxxx

# Recommended: only your own sites may call the proxy from a browser (comma-separated, no paths):
npx supabase secrets set ALLOWED_ORIGINS=https://your-app.vercel.app,http://localhost:5173

npx supabase functions deploy github-proxy --no-verify-jwt
```

`--no-verify-jwt` (also set in `supabase/config.toml`) is intentional: the function does its own allowlisting and the browser sends no credentials. If you add a custom domain or use Vercel preview URLs, add those origins to `ALLOWED_ORIGINS` and run the `secrets set` command again.

Check that it works (the `x-ratelimit-limit` header should say **5000**, not 60):

```bash
curl -i https://YOUR-PROJECT-REF.supabase.co/functions/v1/github-proxy/users/octocat
```

### C. Turn it on in the app

Set `VITE_GITHUB_PROXY=true`:

- locally: add it to `.env.local` and restart `npm run dev`;
- Vercel: **Project → Settings → Environment Variables**, add `VITE_GITHUB_PROXY=true`, then **redeploy** (Vite bakes env vars in at build time).

Leave it unset to keep calling GitHub directly (no token). If the flag is on but the function is not deployed, the app shows a "GitHub is unavailable" error rather than silently falling back.

### Upgrading from an earlier version

Repository details need a new proxy route, so **redeploy the function after upgrading** (the secrets are kept): `npx supabase functions deploy github-proxy --no-verify-jwt --project-ref YOUR-PROJECT-REF`. Also run the new migration (step 1.3). Until the function is redeployed, repository details show "unavailable" when the proxy is enabled.

### Rotating or revoking the token

Generate a new token (step A), run `npx supabase secrets set GITHUB_API_TOKEN=<new value>`, then delete the old token under GitHub → Settings → Developer settings. No redeploy of the function or the app is needed.

### Proxy limitations

- The Edge Function URL is reachable by anyone who knows it, and the browser key cannot prove who is calling. `ALLOWED_ORIGINS` blocks other websites in browsers, but a script could still call the proxy directly and spend your 5,000/hour. The strict allowlist limits what they can ask for, and the Supabase cache means normal use rarely reaches GitHub; if you see abuse, rotate the token or add rate limiting.
- Supabase's free tier includes a monthly allowance of Edge Function invocations; each cache miss costs one.

## 3. Tests and build

```bash
npm run typecheck   # tsc --noEmit
npm test            # Vitest unit tests (cache-first logic, GitHub client, repo statistics, comparison, token proxy)
npm run build       # typecheck + production build into dist/
npm run e2e         # Playwright (mocks GitHub and Supabase; no real keys needed)
```

First-time Playwright setup: `npx playwright install chromium`.
To use an already-installed Chrome instead: `PLAYWRIGHT_CHROME_PATH=/path/to/chrome npm run e2e`.

## 4. Deploy to Vercel (your action)

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel: **Add New → Project**, import the repo. The Vite preset is detected (`vercel.json` is included).
3. Under **Environment Variables** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (and optionally `VITE_CACHE_TTL_DAYS`, and `VITE_GITHUB_PROXY=true` after deploying the proxy).
4. Deploy. You get a `*.vercel.app` URL. Env vars are baked in at build time, so redeploy after changing them.

## Manual verification of the shared cache

1. Open the deployed app in a normal window, search `octocat`. The badge says **Live from GitHub**. In Supabase **Table Editor → github_profile_cache** a row `octocat` appears.
2. Open an incognito window (or another browser) and search `OCTOCAT`. The badge says **Shared cache**. In DevTools → Network there is no request to `api.github.com`.
3. Search a nonexistent user (e.g. `this-user-should-not-exist-98765`): a not-found message appears and no row is stored.
4. Expiry: in the SQL Editor run
   `update public.github_profile_cache set fetched_at = now() - interval '8 days' where username = 'octocat';`
   then search again: it refetches from GitHub and updates `fetched_at`.
5. Prefix search: search `octo`. A list of tiles appears (badge **Live from GitHub**) and a row `octo` appears in `github_search_cache`. Search `OCTO` in an incognito window: the list shows **Shared cache** and there is no `api.github.com/search/users` request. Click a tile to open that user's full profile (also cached).
6. Repository details: with `octocat` shown, the **Repositories & languages** card appears (stars, forks, language bar, most-starred repositories) and a row `octocat` appears in `github_repos_cache`. In an incognito window the card says **Shared cache** and there is no `api.github.com/users/octocat/repos` request.
7. Compare: open the **Compare** tab, add `octocat` and `torvalds` (or use **+ Add to compare** on a profile). A table appears with ▲ on the highest value in each row; the address bar now contains `?view=compare&users=octocat,torvalds`. Open that URL in another window to see the same comparison.
8. Stale fallback: repeat step 4, then in DevTools block `api.github.com` (Network → Block request domain) and search: the cached profile shows with an "outdated" warning.

## Architecture

```
src/
  config.ts                      env + cache TTL (default 7 days, VITE_CACHE_TTL_DAYS), compare limit
  lib/                           errors, username validation, URL state, formatting helpers
  services/github/               Zod schemas + GitHub REST client (profile, repos, user search, error mapping)
  services/cache/                cacheFirst (shared cache-first/lock/stale logic), Supabase client,
                                 profile / search / repository caches (RPC only)
  features/profile/              profileService, useProfile hook, profile UI
  features/search/               searchService, useUserSearch hook, user tile list
  features/repos/                repoService, useRepos, summarizeRepos (stats/languages), repository details UI
  features/compare/              metrics, useComparison, compare table and view
supabase/migrations/             tables, RLS, RPC functions
supabase/functions/github-proxy/ optional Edge Function that adds the GitHub token (handler.ts is unit-tested)
e2e/                             Playwright flows with mocked backends
```

**Lookup flow** (`cacheFirst`, used by `profileService.getProfile`, `repoService.getRepos` and `searchService.searchUsers`):

1. Validate/normalise the username (trim, strip `@`, lower-case).
2. Read Supabase. Fresh hit → return it; GitHub is never called.
3. Miss or expired → try to acquire a 15-second refresh lock in the database. If another visitor holds it, wait briefly (up to ~3 s) for their result.
4. Fetch GitHub, validate the response with Zod, save to Supabase, return it.
5. GitHub fails but an expired copy exists → show it flagged as outdated. A real 404 never falls back to old data.
6. Supabase unreachable → fall back to GitHub directly and tell the user.

**Prefix search:** `GET /search/users?q=<prefix> in:login`, sorted by followers. GitHub matches the text anywhere in the login, so the client keeps only logins that start with the prefix and caps the list at 12. The list is cached per lower-cased prefix (same 7-day TTL, lock and stale rules as profiles). GitHub's search results contain only username, avatar and account type, so tiles show those; the full profile (name, bio, stats) loads when you select a tile. Showing names/bios in tiles would need one extra GitHub request per user, which would exhaust the unauthenticated rate limit.

**Repository details:** `GET /users/{username}/repos?per_page=100&sort=pushed&type=owner` (one request), slimmed to the fields the app uses and cached per username (same TTL, lock and stale rules). Statistics are computed in the browser from the cached list (`summarizeRepos`): forks are excluded from every figure, languages are counted by each repository's primary language (GitHub's `language` field, not lines of code), and the top repositories are ranked by stars.

**Comparison:** `useComparison` loads profile and repositories for each selected user with the same query keys as the Explore view, so anything already viewed is reused. Only metrics where "more" is a meaningful win (followers, repositories, stars, forks, languages) get a highlighted best value; ties are all highlighted, and nothing is highlighted when every value is equal.

TanStack Query adds a small browser-local layer (5 minutes) purely for UX; it is not the shared cache.

**Database security:** all cache tables have RLS enabled with no policies and all direct privileges revoked from `anon`/`authenticated`. The browser can only call `SECURITY DEFINER` functions (`get_cached_profile`, `acquire_profile_refresh_lock`, `release_profile_refresh_lock`, `upsert_cached_profile`, the search equivalents `get_cached_search`, `acquire_search_refresh_lock`, `release_search_refresh_lock`, `upsert_cached_search`, and the repository equivalents `get_cached_repos`, `acquire_repos_refresh_lock`, `release_repos_refresh_lock`, `upsert_cached_repos`) which validate usernames/prefixes, payload shape and size (every cached search result must start with the prefix, every cached repository must belong to the user), and pin `search_path`.

## Known limitations

- **Cache poisoning risk:** because there is no backend, any visitor holding the public key can call `upsert_cached_profile`. The function checks that the profile is well-formed, ≤8 KB, and belongs to the username, and it refuses to overwrite a row refreshed in the last minute, but it cannot verify the data really came from GitHub. A malicious visitor could store a plausible-looking fake profile (or a fake match list) for a not-yet-cached user or prefix. Closing this fully needs a trusted server-side writer (for example, having the Edge Function save to the cache itself), which is not implemented.
- GitHub's unauthenticated limits are 60 requests/hour per visitor IP for profiles/repositories and only about **10 requests/minute** for user search (30/minute with a token); cache hits cost none.
- **Repository figures are approximate.** Only each user's 100 most recently pushed repositories are analysed (one request), so users with more public repositories get partial totals (the UI says so). Stars and forks cover original repositories only, and languages are counted per repository, not by lines of code.
- **No contribution graph or commit/PR activity.** GitHub exposes those mainly through its GraphQL API, which always requires a token; this would be a later phase that needs the proxy.
- Comparison is limited to 3 users.
- GitHub search is relevance/popularity based and returns at most the top results, so a very short prefix (e.g. `a`) lists only the most-followed matches, and the list is not exhaustive. Results for a prefix are cached for 7 days, so brand-new accounts may not appear until the entry expires.
- Supabase free projects pause after about a week of inactivity; the app then shows the "cache unavailable" notice and uses GitHub directly until the project is resumed.
- Cached rows are never deleted automatically (no background jobs in the MVP).
- The production JS bundle is ~600 KB (~171 KB gzipped), mostly the Supabase client.
- The refresh lock is advisory and short-lived; in a rare race two visitors may both fetch GitHub (the database throttle keeps the cache consistent).
