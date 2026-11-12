import { useQuery } from '@tanstack/react-query'
import { profileService } from './profileService'

/** `username` is the submitted search; null means nothing has been searched yet. */
export function useProfile(username: string | null) {
  return useQuery({
    queryKey: ['profile', username?.trim().replace(/^@/, '').toLowerCase()],
    queryFn: () => profileService.getProfile(username ?? ''),
    enabled: username !== null,
  })
}
