import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { reportService } from './reportService'

const normalize = (username: string | null) => username?.trim().replace(/^@/, '').toLowerCase()

/** `username` null means no report is open. Reports are not retried: a missing proxy is not transient. */
export function useReport(username: string | null) {
  return useQuery({
    queryKey: ['report', normalize(username)],
    queryFn: () => reportService.getReport(username ?? ''),
    enabled: username !== null,
    staleTime: 30 * 60 * 1000,
  })
}

/** "Refresh data": rebuilds the report if the shared copy is older than an hour. */
export function useRefreshReport(username: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => reportService.getReport(username ?? '', { refresh: true }),
    onSuccess: (result) => queryClient.setQueryData(['report', normalize(username)], result),
  })
}
