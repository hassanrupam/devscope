import { useQuery } from '@tanstack/react-query'
import { repoService } from './repoService'

/** `username` null means nothing is selected yet. */
export function useRepos(username: string | null) {
  return useQuery({
    queryKey: ['repos', username?.trim().replace(/^@/, '').toLowerCase()],
    queryFn: () => repoService.getRepos(username ?? ''),
    enabled: username !== null,
  })
}
