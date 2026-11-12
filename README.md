# DevExplore — GitHub Profile Lookup (MVP)

Search a GitHub username and see the public profile, plus a compact list of users whose username **starts with** what you typed (avatar, username, account type). Profiles and prefix-search results are saved in a **shared Supabase cache**, so the next visitor (any browser, any session) gets the cached copy without another GitHub API request.

Static Vite + React + TypeScript app. No backend, no Vercel Functions, free tiers only.

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

## 3. Tests and build

```bash
npm run typecheck   # tsc --noEmit
npm test            # Vitest unit tests (cache-first logic, GitHub client, validation)
npm run build       # typecheck + production build into dist/
npm run e2e         # Playwright (mocks GitHub and Supabase; no real keys needed)
```

First-time Playwright setup: `npx playwright install chromium`.
To use an already-installed Chrome instead: `PLAYWRIGHT_CHROME_PATH=/path/to/chrome npm run e2e`.

## 4. Deploy to Vercel (your action)

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel: **Add New → Project**, import the repo. The Vite preset is detected (`vercel.json` is included).
3. Under **Environment Variables** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (and optionally `VITE_CACHE_TTL_DAYS`).
4. Deploy. You get a `*.vercel.app` URL. Env vars are baked in at build time, so redeploy after changing them.

## Manual verification of the shared cache

1. Open the deployed app in a normal window, search `octocat`. The badge says **Live from GitHub**. In Supabase **Table Editor → github_profile_cache** a row `octocat` appears.
2. Open an incognito window (or another browser) and search `OCTOCAT`. The badge says **Shared cache**. In DevTools → Network there is no request to `api.github.com`.
3. Search a nonexistent user (e.g. `this-user-should-not-exist-98765`): a not-found message appears and no row is stored.
4. Expiry: in the SQL Editor run
   `update public.github_profile_cache set fetched_at = now() - interval '8 days' where username = 'octocat';`
   then search again: it refetches from GitHub and updates `fetched_at`.
5. Prefix search: search `octo`. A list of tiles appears (badge **Live from GitHub**) and a row `octo` appears in `github_search_cache`. Search `OCTO` in an incognito window: the list shows **Shared cache** and there is no `api.github.com/search/users` request. Click a tile to open that user's full profile (also cached).
6. Stale fallback: repeat step 4, then in DevTools block `api.github.com` (Network → Block request domain) and search: the cached profile shows with an "outdated" warning.

## Architecture

```
src/
  config.ts                      env + cache TTL (default 7 days, VITE_CACHE_TTL_DAYS)
  lib/                           errors, username validation, formatting helpers
  services/github/               Zod schemas + GitHub REST client (profile + user search, error mapping)
  services/cache/                cacheFirst (shared cache-first/lock/stale logic), Supabase client,
                                 profile cache and search cache (RPC only)
  features/profile/              profileService, useProfile hook, profile UI
  features/search/               searchService, useUserSearch hook, user tile list
supabase/migrations/             tables, RLS, RPC functions
e2e/                             Playwright flows with mocked backends
```

**Lookup flow** (`cacheFirst`, used by both `profileService.getProfile` and `searchService.searchUsers`):

1. Validate/normalise the username (trim, strip `@`, lower-case).
2. Read Supabase. Fresh hit → return it; GitHub is never called.
3. Miss or expired → try to acquire a 15-second refresh lock in the database. If another visitor holds it, wait briefly (up to ~3 s) for their result.
4. Fetch GitHub, validate the response with Zod, save to Supabase, return it.
5. GitHub fails but an expired copy exists → show it flagged as outdated. A real 404 never falls back to old data.
6. Supabase unreachable → fall back to GitHub directly and tell the user.

**Prefix search:** `GET /search/users?q=<prefix> in:login`, sorted by followers. GitHub matches the text anywhere in the login, so the client keeps only logins that start with the prefix and caps the list at 12. The list is cached per lower-cased prefix (same 7-day TTL, lock and stale rules as profiles). GitHub's search results contain only username, avatar and account type, so tiles show those; the full profile (name, bio, stats) loads when you select a tile. Showing names/bios in tiles would need one extra GitHub request per user, which would exhaust the unauthenticated rate limit.

TanStack Query adds a small browser-local layer (5 minutes) purely for UX; it is not the shared cache.

**Database security:** both tables have RLS enabled with no policies and all direct privileges revoked from `anon`/`authenticated`. The browser can only call `SECURITY DEFINER` functions (`get_cached_profile`, `acquire_profile_refresh_lock`, `release_profile_refresh_lock`, `upsert_cached_profile`, and the search equivalents `get_cached_search`, `acquire_search_refresh_lock`, `release_search_refresh_lock`, `upsert_cached_search`) which validate usernames/prefixes, payload shape and size (and that every cached search result really starts with the prefix), and pin `search_path`.

## Known limitations

- **Cache poisoning risk:** because there is no backend, any visitor holding the public key can call `upsert_cached_profile`. The function checks that the profile is well-formed, ≤8 KB, and belongs to the username, and it refuses to overwrite a row refreshed in the last minute, but it cannot verify the data really came from GitHub. A malicious visitor could store a plausible-looking fake profile (or a fake match list) for a not-yet-cached user or prefix. Closing this fully needs a trusted server-side writer (e.g. a Supabase Edge Function), which is out of scope for this MVP.
- GitHub's unauthenticated limits are 60 requests/hour per visitor IP for profiles and only **10 requests/minute** for user search; cache hits cost none.
- GitHub search is relevance/popularity based and returns at most the top results, so a very short prefix (e.g. `a`) lists only the most-followed matches, and the list is not exhaustive. Results for a prefix are cached for 7 days, so brand-new accounts may not appear until the entry expires.
- Supabase free projects pause after about a week of inactivity; the app then shows the "cache unavailable" notice and uses GitHub directly until the project is resumed.
- Cached rows are never deleted automatically (no background jobs in the MVP).
- The production JS bundle is ~600 KB (~171 KB gzipped), mostly the Supabase client.
- The refresh lock is advisory and short-lived; in a rare race two visitors may both fetch GitHub (the database throttle keeps the cache consistent).
