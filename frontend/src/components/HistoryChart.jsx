import { useState, useEffect } from 'react'

const CHART_W = 280
const CHART_H = 100
const PADDING = { top: 10, right: 10, bottom: 24, left: 36 }
const INNER_W = CHART_W - PADDING.left - PADDING.right
const INNER_H = CHART_H - PADDING.top - PADDING.bottom

const styles = {
  container: {
    padding: 'var(--space-md)',
    background: 'var(--bg-base)',
    borderRadius: 'var(--radius-sm)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 'var(--space-sm)',
  },
  title: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
  },
  tab: {
    fontSize: '0.68rem',
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: '99px',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
  },
  empty: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: 'var(--space-md)',
  },
}

const metrics = {
  fill_level_pct: { label: 'Fill %', color: 'var(--blue)', max: 100 },
  weight_kg: { label: 'Weight', color: 'var(--purple)', max: null },
  gas_ppm: { label: 'Gas', color: 'var(--amber)', max: null },
}

export default function HistoryChart({ binId, onClose }) {
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState('fill_level_pct')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/readings/${binId}?limit=60`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) {
          setReadings(data.reverse()) // oldest first
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [binId])

  if (loading) return <div style={styles.empty}>Loading…</div>
  if (readings.length < 2) return <div style={styles.empty}>Not enough data yet</div>

  const values = readings.map(r => r[metric])
  const conf = metrics[metric]
  const maxVal = conf.max || Math.max(...values) * 1.1 || 1
  const minVal = 0

  // Build SVG path
  const points = values.map((v, i) => {
    const x = PADDING.left + (i / (values.length - 1)) * INNER_W
    const y = PADDING.top + INNER_H - ((v - minVal) / (maxVal - minVal)) * INNER_H
    return { x, y }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x},${PADDING.top + INNER_H} L${points[0].x},${PADDING.top + INNER_H} Z`

  // Y-axis labels
  const yLabels = [0, Math.round(maxVal / 2), Math.round(maxVal)]

  // Time labels
  const first = new Date(readings[0].timestamp)
  const last = new Date(readings[readings.length - 1].timestamp)
  const timeLabels = [
    { x: PADDING.left, label: first.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    { x: PADDING.left + INNER_W, label: last.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
  ]

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>History</span>
        <div style={styles.tabs}>
          {Object.entries(metrics).map(([key, m]) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              style={{
                ...styles.tab,
                background: metric === key ? 'var(--bg-hover)' : 'transparent',
                color: metric === key ? m.color : 'var(--text-muted)',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        width="100%"
        style={{ display: 'block' }}
      >
        {/* Grid lines */}
        {yLabels.map(v => {
          const y = PADDING.top + INNER_H - ((v - minVal) / (maxVal - minVal)) * INNER_H
          return (
            <g key={v}>
              <line
                x1={PADDING.left} y1={y}
                x2={PADDING.left + INNER_W} y2={y}
                stroke="var(--border)" strokeWidth="0.5"
              />
              <text
                x={PADDING.left - 4} y={y + 3}
                fill="var(--text-muted)" fontSize="7"
                fontFamily="var(--font-mono)" textAnchor="end"
              >
                {v}
              </text>
            </g>
          )
        })}

        {/* Area fill */}
        <path d={areaPath} fill={conf.color} opacity="0.08" />

        {/* Line */}
        <path d={linePath} fill="none" stroke={conf.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Endpoint dot */}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill={conf.color} />

        {/* Time labels */}
        {timeLabels.map((t, i) => (
          <text
            key={i}
            x={t.x} y={CHART_H - 4}
            fill="var(--text-muted)" fontSize="7"
            fontFamily="var(--font-mono)"
            textAnchor={i === 0 ? 'start' : 'end'}
          >
            {t.label}
          </text>
        ))}
      </svg>
    </div>
  )
}
