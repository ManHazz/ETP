import { useMemo } from 'react'
import Sparkline from '../components/Sparkline'
import { SkeletonGrid } from '../components/Skeleton'
import { getStatus } from '../utils'

export default function AnalyticsView({ bins, loading }) {
  const distribution = useMemo(() => {
    if (!bins) return []
    const buckets = { critical: 0, warning: 0, normal: 0, offline: 0 }
    for (const b of bins) buckets[getStatus(b.effective_fill).level]++
    return [
      { label: 'Critical', v: buckets.critical, color: 'var(--danger)' },
      { label: 'Warning',  v: buckets.warning,  color: 'var(--warning)' },
      { label: 'Normal',   v: buckets.normal,   color: 'var(--success)' },
      { label: 'Offline',  v: buckets.offline,  color: 'var(--text-muted)' },
    ]
  }, [bins])

  if (loading) return <SkeletonGrid n={3} />
  if (!bins?.length) return null

  const total = bins.length
  const totalWeight = bins.reduce((s, b) => s + (b.weight_kg || 0), 0)
  const avgFill = bins.reduce((s, b) => s + (b.effective_fill || 0), 0) / total
  const avgGas  = bins.reduce((s, b) => s + (b.gas_ppm || 0), 0) / total
  const lowBattery = bins.filter((b) => b.battery_voltage != null && b.battery_voltage < 2.9).length

  const topFullest = [...bins].sort((a, b) => (b.effective_fill ?? -1) - (a.effective_fill ?? -1)).slice(0, 5)
  const topWeight  = [...bins].sort((a, b) => (b.weight_kg ?? -1) - (a.weight_kg ?? -1)).slice(0, 5)

  return (
    <div className="stack">
      <div>
        <div className="page-title">Analytics</div>
        <div className="page-subtitle">Fleet-wide performance snapshot</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--sp-4)' }}>
        <BigStat label="Avg fill" value={`${avgFill.toFixed(0)}%`} accent="brand" />
        <BigStat label="Total weight" value={`${totalWeight.toFixed(1)} kg`} accent="blue" />
        <BigStat label="Avg gas" value={`${avgGas.toFixed(0)} ppm`} accent={avgGas > 200 ? 'warning' : 'brand'} />
        <BigStat label="Low battery" value={lowBattery} accent={lowBattery > 0 ? 'danger' : 'brand'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-4)' }}>
        <div className="card" style={{ padding: 'var(--sp-5)' }}>
          <div className="label" style={{ marginBottom: 12 }}>Status distribution</div>
          <div style={{ display: 'flex', height: 12, borderRadius: 'var(--r-full)', overflow: 'hidden', background: 'var(--bg-sunken)' }}>
            {distribution.map((d) => d.v > 0 && (
              <div key={d.label} style={{ background: d.color, width: `${(d.v / total) * 100}%` }} title={`${d.label}: ${d.v}`} />
            ))}
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {distribution.map((d) => (
              <div key={d.label} className="between" style={{ fontSize: '.86rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color }} />
                  <span>{d.label}</span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{d.v}</span>
              </div>
            ))}
          </div>
        </div>

        <RankCard title="Fullest bins" items={topFullest.map((b) => ({ label: b.label, v: b.effective_fill, unit: '%' }))} />
        <RankCard title="Heaviest bins" items={topWeight.map((b) => ({ label: b.label, v: b.weight_kg, unit: ' kg', digits: 1 }))} />
      </div>
    </div>
  )
}

function BigStat({ label, value, accent }) {
  return (
    <div className={`stat stat-accent-${accent}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

function RankCard({ title, items }) {
  const max = Math.max(...items.map((i) => i.v ?? 0), 1)
  return (
    <div className="card" style={{ padding: 'var(--sp-5)' }}>
      <div className="label" style={{ marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it) => (
          <div key={it.label}>
            <div className="between" style={{ fontSize: '.82rem', marginBottom: 4 }}>
              <span>{it.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{it.v != null ? `${it.v.toFixed(it.digits ?? 0)}${it.unit}` : '—'}</span>
            </div>
            <div className="pbar" style={{ height: 5 }}>
              <span style={{ width: `${((it.v ?? 0) / max) * 100}%`, background: 'var(--grad-brand)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
