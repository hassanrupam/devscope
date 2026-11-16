import type { ReactNode } from 'react'

interface TooltipPayload {
  value?: number | string
  name?: string
  payload?: Record<string, unknown>
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string | number
  /** Turns the hovered row into the heading (defaults to the axis label). */
  title?: (label: string | number | undefined, row: Record<string, unknown> | undefined) => ReactNode
  unit?: string
  format?: (value: number) => string
}

/** One tooltip look for every Recharts chart in the report (theme-aware through CSS variables). */
export function ChartTooltip({ active, payload, label, title, unit = '', format = (v) => v.toLocaleString('en') }: ChartTooltipProps) {
  const first = payload?.[0]
  if (!active || !first) return null
  const value = typeof first.value === 'number' ? format(first.value) : String(first.value ?? '')
  return (
    <div
      className="rounded-lg border px-2.5 py-1.5 text-xs shadow-xl backdrop-blur"
      style={{ background: 'var(--r-tooltip-bg)', borderColor: 'var(--r-tooltip-border)', color: 'var(--r-text)' }}
    >
      <div className="font-medium">{title ? title(label, first.payload) : label}</div>
      <div style={{ color: 'var(--r-muted)' }}>
        <span className="font-semibold tabular-nums" style={{ color: 'var(--r-text)' }}>
          {value}
        </span>{' '}
        {unit}
      </div>
    </div>
  )
}
