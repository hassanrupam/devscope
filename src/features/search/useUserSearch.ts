import { useQuery } from '@tanstack/react-query'
import { searchService } from './searchService'

/** `prefix` is the submitted search; null means nothing has been searched yet. */
export function useUserSearch(prefix: string | null) {
  return useQuery({
    queryKey: ['user-search', prefix],
    queryFn: () => searchService.searchUsers(prefix ?? ''),
    enabled: prefix !== null,
  })
}
