import { z } from 'zod'

/** ISO timestamp string from the database -> Date (invalid dates fail validation). */
export const fetchedAtSchema = z.string().transform((v, ctx) => {
  const date = new Date(v)
  if (Number.isNaN(date.getTime())) {
    ctx.issues.push({ code: 'custom', message: 'Invalid fetched_at', input: v })
    return z.NEVER
  }
  return date
})
