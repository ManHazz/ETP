import Icon from './Icon'

export default function SummaryBar({ bins }) {
  if (!bins || !bins.length) return null
  const total = bins.length
  const critical = bins.filter((b) => (b.effective_fill ?? 0) >= 80).length
  const warning = bins.filter((b) => {
    const e = b.effective_fill ?? 0
    return e >= 50 && e < 80
  }).length
  const avg = bins.reduce((s, b) => s + (b.effective_fill || 0), 0) / total

  const stats = [
    { label: 'Total bins',  value: total,   icon: 'bins',       cls: 'stat-accent-brand' },
    { label: 'Critical',    value: critical, icon: 'warn',       cls: 'stat-accent-danger' },
    { label: 'Warning',     value: warning, icon: 'bell',        cls: 'stat-accent-warning' },
    { label: 'Avg fill',    value: `${avg.toFixed(0)}%`, icon: 'analytics', cls: 'stat-accent-blue' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--sp-4)' }}>
      {stats.map((s) => (
        <div key={s.label} className={`stat ${s.cls}`}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="stat-label">{s.label}</span>
            <Icon name={s.icon} size={16} style={{ color: 'var(--text-muted)' }} />
          </div>
          <span className="stat-value">{s.value}</span>
        </div>
      ))}
    </div>
  )
}
