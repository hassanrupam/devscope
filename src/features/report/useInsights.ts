import { useQuery } from '@tanstack/react-query'
import { insightsService } from './insightsService'

/** Loaded separately from the report so the main sections never wait for it. Not retried. */
export function useInsights(username: string | null) {
  return useQuery({
    queryKey: ['insights', username?.trim().replace(/^@/, '').toLowerCase()],
    queryFn: () => insightsService.getInsights(username ?? ''),
    enabled: username !== null,
    staleTime: 30 * 60 * 1000,
    retry: false,
  })
}
