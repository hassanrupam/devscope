// Supabase Edge Function entry point (runs on Deno; excluded from the app's tsc/Vite build).
// Secrets are set with `supabase secrets set` and are never exposed to the browser:
//   GITHUB_API_TOKEN  required  GitHub personal access token
//   ALLOWED_ORIGINS   optional  comma-separated browser origins, e.g. https://my-app.vercel.app
import { handleRequest } from './handler.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

Deno.serve((request) =>
  handleRequest(request, {
    githubToken: Deno.env.get('GITHUB_API_TOKEN'),
    allowedOrigins: Deno.env.get('ALLOWED_ORIGINS'),
  }),
)
