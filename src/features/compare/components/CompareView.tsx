import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { PlusIcon, TrashIcon, XIcon } from '@/components/ui/icons'
import { config } from '@/config'
import { isAppError } from '@/lib/errors'
import { parseUsername } from '@/lib/username'
import { useComparison } from '../useComparison'
import { CompareTable } from './CompareTable'

interface CompareViewProps {
  users: string[]
  /** Returns an error message when the user cannot be added, otherwise null. */
  onAdd: (username: string) => string | null
  onClear: () => void
  onRemove: (username: string) => void
}

export function CompareView({ users, onAdd, onClear, onRemove }: CompareViewProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const columns = useComparison(users)
  const full = users.length >= config.maxCompareUsers

  function clearInput() {
    setValue('')
    setError(null)
  }

  function clearComparison() {
    clearInput()
    onClear()
  }

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
          <div className="relative min-w-0 flex-1">
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
              className="h-11 w-full rounded-xl border border-slate-300/80 bg-white/80 px-3 pr-11 text-base text-slate-900 shadow-sm shadow-slate-900/[0.03] placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 sm:px-4"
            />
            {value ? (
              <button
                type="button"
                onClick={clearInput}
                aria-label="Clear comparison username"
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <XIcon />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start sm:gap-3">
            <Button type="submit" disabled={full}>
              <PlusIcon />
              Add user
            </Button>
            {users.length > 0 ? (
              <Button
                type="button"
                onClick={clearComparison}
                className="border-red-200 bg-red-50 text-red-700 shadow-none hover:bg-red-100 hover:shadow-sm dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
              >
                <TrashIcon />
                Clear comparison
              </Button>
            ) : null}
          </div>
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
        <p className="rounded-2xl border border-dashed border-slate-300/80 bg-white/45 p-6 text-center text-sm text-slate-600 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/45 dark:text-slate-400 sm:p-8">
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
