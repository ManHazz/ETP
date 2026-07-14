import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

const KEY = 'smartbin-alerts-on'

export default function AlertToasts({ bins }) {
  const [alerts, setAlerts] = useState([])
  const seen = useRef(new Set())
  const audio = useRef(null)
  const enabled = () => localStorage.getItem(KEY) !== '0'

  useEffect(() => {
    if (!bins) return
    const crit = bins.filter((b) => (b.effective_fill ?? 0) >= 80)
    const fresh = []
    for (const bin of crit) {
      const key = `${bin.id}-${Math.floor((bin.effective_fill ?? 0) / 5) * 5}`
      if (!seen.current.has(key)) {
        seen.current.add(key)
        fresh.push({ id: `${bin.id}-${Date.now()}`, label: bin.label, fill: bin.effective_fill, gas: bin.gas_ppm, t: Date.now() })
      }
    }
    if (fresh.length && enabled()) {
      setAlerts((p) => [...fresh, ...p].slice(0, 5))
      if (Notification.permission === 'granted') {
        fresh.slice(0, 1).forEach((a) => new Notification(`Bin critical: ${a.label}`, { body: `Fill at ${a.fill?.toFixed(0)}%`, icon: '/pwa-192.svg' }))
      }
    }
    const timer = setInterval(() => setAlerts((p) => p.filter((a) => Date.now() - a.t < 8000)), 1000)
    return () => clearInterval(timer)
  }, [bins])

  if (!alerts.length) return null
  return (
    <div className="toast-stack">
      {alerts.map((a) => (
        <div key={a.id} className="toast" onClick={() => setAlerts((p) => p.filter((x) => x.id !== a.id))}>
          <Icon name="warn" size={18} style={{ color: 'var(--danger)', marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{a.label}</div>
            <div style={{ fontSize: '.76rem', color: 'var(--text-secondary)' }}>
              Fill at {a.fill?.toFixed(0)}%{a.gas > 200 ? ` · Gas ${a.gas?.toFixed(0)} ppm` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
