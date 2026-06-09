import { getStatus } from '../utils'

const styles = {
  bar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 'var(--space-md)',
  },
  card: {
    background: 'var(--bg-surface)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-lg)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xs)',
  },
  value: {
    fontFamily: 'var(--font-mono)',
    fontSize: '1.75rem',
    fontWeight: 600,
    lineHeight: 1.1,
  },
  label: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    fontWeight: 500,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
  },
}

export default function SummaryBar({ bins }) {
  if (!bins || bins.length === 0) return null

  const total = bins.length
  const critical = bins.filter(b => (b.effective_fill ?? 0) >= 80).length
  const warning = bins.filter(b => (b.effective_fill ?? 0) >= 50 && (b.effective_fill ?? 0) < 80).length
  const avgFill = bins.reduce((s, b) => s + (b.effective_fill || 0), 0) / total

  const stats = [
    { label: 'Total bins', value: total, color: 'var(--blue)' },
    { label: 'Critical', value: critical, color: 'var(--red)' },
    { label: 'Warning', value: warning, color: 'var(--amber)' },
    { label: 'Avg fill', value: `${avgFill.toFixed(0)}%`, color: 'var(--purple)' },
  ]

  return (
    <div style={styles.bar}>
      {stats.map(s => (
        <div key={s.label} style={styles.card}>
          <span style={{ ...styles.value, color: s.color }}>{s.value}</span>
          <span style={styles.label}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}
