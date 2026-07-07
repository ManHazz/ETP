export default function SummaryBar({ bins }) {
  if (!bins || !bins.length) return null
  const total = bins.length
  const critical = bins.filter(b => (b.effective_fill ?? 0) >= 80).length
  const warning = bins.filter(b => { const e = b.effective_fill ?? 0; return e >= 50 && e < 80 }).length
  const avg = bins.reduce((s, b) => s + (b.effective_fill || 0), 0) / total
  const stats = [
    { label: 'Total bins', value: total, color: 'var(--blue)' },
    { label: 'Critical', value: critical, color: 'var(--red)' },
    { label: 'Warning', value: warning, color: 'var(--amber)' },
    { label: 'Avg fill', value: `${avg.toFixed(0)}%`, color: 'var(--purple)' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 'var(--space-md)' }}>
      {stats.map(s => (
        <div key={s.label} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 600, lineHeight: 1.1, color: s.color }}>{s.value}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, letterSpacing: '0.03em', textTransform: 'uppercase' }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}
