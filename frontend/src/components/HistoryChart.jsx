import { useState, useEffect } from 'react'
const W = 280, H = 100, P = { t: 10, r: 10, b: 24, l: 36 }
const IW = W - P.l - P.r, IH = H - P.t - P.b
const metrics = { fill_level_pct: { label: 'Fill %', color: 'var(--blue)', max: 100 }, weight_kg: { label: 'Weight', color: 'var(--purple)', max: null }, gas_ppm: { label: 'Gas', color: 'var(--amber)', max: null } }
export default function HistoryChart({ binId }) {
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState('fill_level_pct')
  useEffect(() => { let c = false; setLoading(true); fetch(`/api/readings/${binId}?limit=60`).then(r => r.json()).then(d => { if (!c) { setReadings(d.reverse()); setLoading(false) } }).catch(() => setLoading(false)); return () => { c = true } }, [binId])
  if (loading) return <div style={{ textAlign: 'center', padding: 'var(--space-md)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Loading…</div>
  if (readings.length < 2) return <div style={{ textAlign: 'center', padding: 'var(--space-md)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Not enough data</div>
  const vals = readings.map(r => r[metric]), conf = metrics[metric]
  const mx = conf.max || Math.max(...vals) * 1.1 || 1
  const pts = vals.map((v, i) => ({ x: P.l + (i / (vals.length - 1)) * IW, y: P.t + IH - (v / mx) * IH }))
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const area = `${line} L${pts[pts.length - 1].x},${P.t + IH} L${pts[0].x},${P.t + IH} Z`
  const t0 = new Date(readings[0].timestamp), t1 = new Date(readings[readings.length - 1].timestamp)
  const fmt = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div style={{ padding: 'var(--space-md)', background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>History</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {Object.entries(metrics).map(([k, m]) => (<button key={k} onClick={() => setMetric(k)} style={{ fontSize: '0.68rem', fontWeight: 500, padding: '2px 8px', borderRadius: '99px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', background: metric === k ? 'var(--bg-hover)' : 'transparent', color: metric === k ? m.color : 'var(--text-muted)' }}>{m.label}</button>))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {[0, Math.round(mx / 2), Math.round(mx)].map(v => { const y = P.t + IH - (v / mx) * IH; return <g key={v}><line x1={P.l} y1={y} x2={P.l + IW} y2={y} stroke="var(--border)" strokeWidth=".5" /><text x={P.l - 4} y={y + 3} fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)" textAnchor="end">{v}</text></g> })}
        <path d={area} fill={conf.color} opacity=".08" />
        <path d={line} fill="none" stroke={conf.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.5" fill={conf.color} />
        <text x={P.l} y={H - 4} fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)" textAnchor="start">{fmt(t0)}</text>
        <text x={P.l + IW} y={H - 4} fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)" textAnchor="end">{fmt(t1)}</text>
      </svg>
    </div>
  )
}
