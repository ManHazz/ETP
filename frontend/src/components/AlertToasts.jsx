import { useState, useEffect, useRef } from 'react'

const styles = {
  container: {
    position: 'fixed',
    top: 'calc(var(--safe-top, 0px) + 12px)',
    right: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    zIndex: 100,
    maxWidth: 'min(360px, calc(100vw - 24px))',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    borderLeft: '3px solid var(--red)',
    background: 'var(--bg-raised)',
    fontSize: '0.82rem',
    color: 'var(--text-primary)',
    animation: 'slideIn 0.25s ease-out',
    cursor: 'pointer',
  },
  icon: {
    fontSize: '1rem',
    flexShrink: 0,
  },
  text: {
    flex: 1,
    lineHeight: 1.3,
  },
  name: {
    fontWeight: 600,
  },
  detail: {
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
  },
  dismiss: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0 2px',
    fontFamily: 'var(--font-ui)',
  },
}

export default function AlertToasts({ bins }) {
  const [alerts, setAlerts] = useState([])
  const seenRef = useRef(new Set())

  useEffect(() => {
    if (!bins) return

    const critical = bins.filter(b => (b.effective_fill ?? 0) >= 80)
    const newAlerts = []

    for (const bin of critical) {
      const key = `${bin.id}-${Math.floor((bin.effective_fill ?? 0) / 5) * 5}` // re-alert every 5% jump
      if (!seenRef.current.has(key)) {
        seenRef.current.add(key)
        newAlerts.push({
          id: `${bin.id}-${Date.now()}`,
          binId: bin.id,
          label: bin.label,
          fill: bin.effective_fill,
          gas: bin.gas_ppm,
          createdAt: Date.now(),
        })
      }
    }

    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 5))
    }

    // Auto-dismiss after 8 seconds
    const timer = setInterval(() => {
      setAlerts(prev => prev.filter(a => Date.now() - a.createdAt < 8000))
    }, 1000)

    return () => clearInterval(timer)
  }, [bins])

  const dismiss = (id) => setAlerts(prev => prev.filter(a => a.id !== id))

  if (alerts.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={styles.container}>
        {alerts.map(a => (
          <div key={a.id} style={styles.toast} onClick={() => dismiss(a.id)}>
            <span style={styles.icon}>⚠</span>
            <div style={styles.text}>
              <div style={styles.name}>{a.label}</div>
              <div style={styles.detail}>
                Fill at {a.fill.toFixed(0)}%
                {a.gas > 200 ? ` · Gas ${a.gas.toFixed(0)} ppm` : ''}
              </div>
            </div>
            <button style={styles.dismiss} onClick={(e) => { e.stopPropagation(); dismiss(a.id) }}>×</button>
          </div>
        ))}
      </div>
    </>
  )
}
