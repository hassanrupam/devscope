import { useQueries, type UseQueryResult } from '@tanstack/react-query'
import { toAppError } from '@/lib/errors'
import { profileService } from '@/features/profile/profileService'
import { repoService } from '@/features/repos/repoService'
import { isTruncated, summarizeRepos } from '@/features/repos/summarize'
import type { ComparisonColumn } from './metrics'

function stateOf(query: UseQueryResult): 'loading' | 'ready' | 'error' {
  if (query.isError) return 'error'
  return query.data === undefined ? 'loading' : 'ready'
}

/**
 * Loads profile + repositories for each username, sharing query keys (and therefore the in-memory and
 * shared Supabase caches) with the Explore view.
 */
export function useComparison(usernames: string[]): ComparisonColumn[] {
  const profiles = useQueries({
    queries: usernames.map((username) => ({
      queryKey: ['profile', username],
      queryFn: () => profileService.getProfile(username),
    })),
  })
  const repos = useQueries({
    queries: usernames.map((username) => ({
      queryKey: ['repos', username],
      queryFn: () => repoService.getRepos(username),
    })),
  })

  return usernames.map((username, index) => {
    const profile = profiles[index]
    const repo = repos[index]
    const profileData = profile?.data?.profile ?? null
    const repoData = repo?.data?.repos ?? null
    return {
      username,
      profile: profileData,
      profileState: profile ? stateOf(profile) : 'loading',
      profileError: profile?.error ? toAppError(profile.error) : null,
      summary: repoData ? summarizeRepos(repoData) : null,
      repoState: repo ? stateOf(repo) : 'loading',
      truncated: profileData !== null && repoData !== null && isTruncated(profileData.public_repos, repoData.length),
    }
  })
}
