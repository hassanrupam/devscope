import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

// Browser-local caching only smooths UX; the shared cache lives in Supabase.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
})

// A small signature for the curious who open DevTools.
console.info(
  '%cDevExplore%c  built & maintained by Hassan Rupam — https://hassanrupam.vercel.app/',
  'background:#4f46e5;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700',
  'color:#818cf8',
)

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
