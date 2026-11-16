// Supabase Edge Function entry point (runs on Deno; excluded from the app's tsc/Vite build).
// Secrets are set with `supabase secrets set` and are never exposed to the browser:
//   GITHUB_API_TOKEN  required  GitHub personal access token
//   ALLOWED_ORIGINS   optional  comma-separated browser origins, e.g. https://my-app.vercel.app
//   RATE_LIMIT_USERNAME and RATE_LIMIT_PASSWORD  required for the private /rate_limit endpoint
//   SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL are provided by the Supabase runtime for private snapshots
import { handleRequest } from './handler.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

Deno.serve((request) =>
  handleRequest(request, {
    githubToken: Deno.env.get('GITHUB_API_TOKEN'),
    allowedOrigins: Deno.env.get('ALLOWED_ORIGINS'),
    rateLimitUsername: Deno.env.get('RATE_LIMIT_USERNAME'),
    rateLimitPassword: Deno.env.get('RATE_LIMIT_PASSWORD'),
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    supabaseServiceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  }),
)
