import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { radarRows, type ComparisonColumn } from '../metrics'
import { userColor } from '../colors'

/** Skill radar: every axis is scaled to the leader on that axis. Lazy-loaded (it pulls in recharts). */
export default function CompareRadar({ columns }: { columns: ComparisonColumn[] }) {
  const rows = radarRows(columns)
  const label = `Radar chart comparing ${columns.map((c) => c.username).join(', ')} across followers, stars, forks, repositories, languages and recent activity`
  return (
    <div role="img" aria-label={label} className="h-72 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={rows} outerRadius="72%">
          <PolarGrid stroke="var(--chart-grid)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 10, color: 'var(--chart-tooltip-text)', fontSize: 12 }}
            formatter={(value, name) => [`${value}% of leader`, `@${String(name)}`]}
          />
          {columns.map((c, i) => (
            <Radar
              key={c.username}
              name={c.username}
              dataKey={c.username}
              stroke={userColor(i)}
              fill={userColor(i)}
              fillOpacity={0.22}
              strokeWidth={2.25}
              isAnimationActive="auto"
              animationDuration={900}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
