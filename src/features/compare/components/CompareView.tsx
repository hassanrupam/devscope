import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { config } from '@/config'
import { isAppError } from '@/lib/errors'
import { parseUsername } from '@/lib/username'
import { useComparison } from '../useComparison'
import { CompareTable } from './CompareTable'

interface CompareViewProps {
  users: string[]
  /** Returns an error message when the user cannot be added, otherwise null. */
  onAdd: (username: string) => string | null
  onRemove: (username: string) => void
}

export function CompareView({ users, onAdd, onRemove }: CompareViewProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const columns = useComparison(users)
  const full = users.length >= config.maxCompareUsers

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const username = parseUsername(value)
      const problem = onAdd(username)
      setError(problem)
      if (!problem) setValue('')
    } catch (err) {
      setError(isAppError(err) ? err.message : 'Enter a valid GitHub username.')
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} noValidate aria-label="Add a user to the comparison">
        <label htmlFor="compare-username" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Add a GitHub username to compare
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="compare-username"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={full ? `Comparison is full (${config.maxCompareUsers} users)` : 'e.g. gaearon'}
            disabled={full}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'compare-error' : 'compare-hint'}
            className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <Button type="submit" disabled={full}>
            Add user
          </Button>
        </div>
        <p id="compare-hint" className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Compare 2 to {config.maxCompareUsers} users. You can also add users with “Add to compare” from the Explore tab.
        </p>
        {error ? (
          <p id="compare-error" role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </form>

      {users.length < 2 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {users.length === 0
            ? 'Add at least two users to see them side by side.'
            : `Added @${users[0]}. Add one more user to start comparing.`}
        </p>
      ) : (
        <CompareTable columns={columns} onRemove={onRemove} />
      )}
    </div>
  )
}
