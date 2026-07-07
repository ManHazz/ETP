import { useState, useEffect, useRef } from 'react'
export default function AlertToasts({ bins }) {
  const [alerts, setAlerts] = useState([])
  const seen = useRef(new Set())
  useEffect(() => {
    if (!bins) return
    const crit = bins.filter(b => (b.effective_fill ?? 0) >= 80)
    const nw = []
    for (const bin of crit) {
      const key = `${bin.id}-${Math.floor((bin.effective_fill ?? 0) / 5) * 5}`
      if (!seen.current.has(key)) { seen.current.add(key); nw.push({ id: `${bin.id}-${Date.now()}`, label: bin.label, fill: bin.effective_fill, gas: bin.gas_ppm, t: Date.now() }) }
    }
    if (nw.length) setAlerts(p => [...nw, ...p].slice(0, 5))
    const timer = setInterval(() => setAlerts(p => p.filter(a => Date.now() - a.t < 8000)), 1000)
    return () => clearInterval(timer)
  }, [bins])
  if (!alerts.length) return null
  return (
    <div style={{ position: 'fixed', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 100, maxWidth: 'min(360px,calc(100vw - 24px))' }}>
      {alerts.map(a => (
        <div key={a.id} onClick={() => setAlerts(p => p.filter(x => x.id !== a.id))} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--red)', background: 'var(--bg-raised)', fontSize: '.82rem', cursor: 'pointer', animation: 'slideIn .25s ease-out' }}>
          <span>⚠</span>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{a.label}</div><div style={{ fontSize: '.75rem', color: 'var(--text-secondary)' }}>Fill at {a.fill?.toFixed(0)}%{a.gas > 200 ? ` · Gas ${a.gas?.toFixed(0)} ppm` : ''}</div></div>
        </div>
      ))}
    </div>
  )
}
