import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from '../components/Icon'
import EmptyState from '../components/EmptyState'
import { timeAgo } from '../utils'

const KIND_META = {
  dead:        { label: 'Bin offline',    icon: 'warn', color: 'var(--danger)' },
  stuck:       { label: 'Sensor stuck',   icon: 'warn', color: 'var(--warning)' },
  spike:       { label: 'Sudden fill jump', icon: 'warn', color: 'var(--warning)' },
  low_battery: { label: 'Low battery',    icon: 'battery', color: 'var(--warning)' },
  gas_hazard:  { label: 'Bad smell / gas', icon: 'gas', color: 'var(--danger)' },
  tamper:      { label: 'Possibly moved', icon: 'warn', color: 'var(--warning)' },
}

export default function AnomaliesView({ bins }) {
  const [anomalies, setAnomalies] = useState([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)

  const load = () => api.get('/anomalies?open_only=true').then(setAnomalies).finally(() => setLoading(false))

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  const scan = async () => {
    setScanning(true)
    try { await api.post('/anomalies/scan', {}); await load() }
    finally { setScanning(false) }
  }

  const resolve = async (id) => {
    await api.post(`/anomalies/${id}/resolve`, {})
    load()
  }

  const binLabel = (id) => bins?.find((b) => b.id === id)?.label || `Bin #${id}`

  return (
    <div className="stack">
      <div className="between">
        <div>
          <div className="page-title">Issues</div>
          <div className="page-subtitle">Sensor problems, gas alerts, or bins that may have been moved</div>
        </div>
        <button className="btn btn-ghost" onClick={scan} disabled={scanning}>
          <Icon name="refresh" size={16} /> {scanning ? 'Checking…' : 'Check now'}
        </button>
      </div>

      {loading ? (
        <div className="card skeleton" style={{ height: 120 }} />
      ) : anomalies.length === 0 ? (
        <EmptyState icon="check" title="All good" message="No issues right now." />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {anomalies.map((a, i) => {
            const meta = KIND_META[a.kind] || { label: a.kind, icon: 'warn', color: 'var(--warning)' }
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', borderBottom: i < anomalies.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: `color-mix(in srgb, ${meta.color} 15%, transparent)`, color: meta.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><Icon name={meta.icon} size={18} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '.92rem' }}>{meta.label} · {binLabel(a.bin_id)}</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>{a.message}</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{timeAgo(a.detected_at)}</div>
                </div>
                <span className="chip" style={{ background: `color-mix(in srgb, ${meta.color} 15%, transparent)`, color: meta.color }}>{a.severity}</span>
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '.75rem' }} onClick={() => resolve(a.id)}>Resolve</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
