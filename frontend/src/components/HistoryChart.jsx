import { useEffect, useState } from 'react'

const CFG = {
  fill_level_pct: { label: 'Fill %', color: 'var(--brand)', max: 100, digits: 0, unit: '%' },
  effective:      { label: 'Effective', color: 'var(--accent)', max: 100, digits: 0, unit: '%' },
  weight_kg:      { label: 'Weight', color: '#A21CAF', max: null, digits: 1, unit: ' kg' },
  gas_ppm:        { label: 'Gas', color: 'var(--warning)', max: null, digits: 0, unit: ' ppm' },
}

const W = 320, H = 140, P = { t: 12, r: 12, b: 22, l: 32 }
const IW = W - P.l - P.r, IH = H - P.t - P.b

export default function HistoryChart({ binId }) {
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState('fill_level_pct')
  const [hover, setHover] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/readings/${binId}?limit=120`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setReadings(d.reverse()); setLoading(false) } })
      .catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [binId])

  if (loading) return <div style={{ padding: 'var(--sp-4)', color: 'var(--text-muted)', textAlign: 'center', fontSize: '.8rem' }}>Loading history…</div>
  if (readings.length < 2) return <div style={{ padding: 'var(--sp-4)', color: 'var(--text-muted)', textAlign: 'center', fontSize: '.8rem' }}>Not enough data yet</div>

  const cfg = CFG[metric]
  const vals = readings.map((r) => r[metric] ?? 0)
  const max = cfg.max ?? Math.max(...vals, 1) * 1.1
  const pts = vals.map((v, i) => ({
    x: P.l + (i / (vals.length - 1)) * IW,
    y: P.t + IH - (v / max) * IH,
    v, t: readings[i].timestamp,
  }))
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1].x},${P.t + IH} L${pts[0].x},${P.t + IH} Z`

  const gridVals = [0, max / 2, max]
  const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.min(pts.length - 1, Math.max(0, Math.round((x - P.l) / (IW / (pts.length - 1)))))
    setHover(pts[i])
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {Object.entries(CFG).map(([k, m]) => (
          <button key={k} onClick={() => setMetric(k)}
            className="chip"
            style={{
              cursor: 'pointer',
              background: metric === k ? m.color : 'var(--bg-sunken)',
              color: metric === k ? 'white' : 'var(--text-secondary)',
              border: 'none', padding: '5px 12px', fontSize: '.72rem',
            }}>{m.label}</button>
        ))}
      </div>
      <div style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} onMouseMove={onMove}>
          {gridVals.map((v) => {
            const y = P.t + IH - (v / max) * IH
            return (
              <g key={v}>
                <line x1={P.l} x2={P.l + IW} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 3" />
                <text x={P.l - 6} y={y + 3} fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="end">{v.toFixed(cfg.digits)}</text>
              </g>
            )
          })}
          <path d={area} fill={cfg.color} opacity=".14" />
          <path d={line} fill="none" stroke={cfg.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {hover && <line x1={hover.x} x2={hover.x} y1={P.t} y2={P.t + IH} stroke={cfg.color} strokeDasharray="3 3" opacity=".5" />}
          {hover && <circle cx={hover.x} cy={hover.y} r="4" fill={cfg.color} stroke="var(--bg-surface)" strokeWidth="2" />}
          <text x={P.l} y={H - 4} fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)">{fmtTime(pts[0].t)}</text>
          <text x={P.l + IW} y={H - 4} fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="end">{fmtTime(pts[pts.length - 1].t)}</text>
        </svg>
        {hover && (
          <div style={{
            position: 'absolute', pointerEvents: 'none',
            left: `${(hover.x / W) * 100}%`, top: 0,
            transform: 'translate(-50%, -110%)',
            background: 'var(--bg-raised)', border: '1px solid var(--border)',
            padding: '4px 8px', borderRadius: 'var(--r-sm)',
            fontSize: '.72rem', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-md)',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: cfg.color, fontWeight: 600 }}>{hover.v.toFixed(cfg.digits)}{cfg.unit}</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{fmtTime(hover.t)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
