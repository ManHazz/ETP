import { useEffect, useState } from 'react'
import { api } from '../api'
import SummaryBar from '../components/SummaryBar'
import BinCard from '../components/BinCard'
import Icon from '../components/Icon'
import EmptyState from '../components/EmptyState'
import { SkeletonGrid } from '../components/Skeleton'
import WeatherWidget from '../components/WeatherWidget'
import DispatchPanel from '../components/DispatchPanel'
import { getStatus, timeAgo } from '../utils'

export default function DashboardView({ bins, loading, onOpenBin, onNavigate }) {
  const [openAnomalies, setOpenAnomalies] = useState(0)
  useEffect(() => {
    api.get('/anomalies?open_only=true&limit=100').then((a) => setOpenAnomalies(a.length)).catch(() => {})
  }, [])

  if (loading) return <div className="stack"><SkeletonGrid n={4} /></div>
  if (!bins?.length) return (
    <EmptyState
      title="No bins yet"
      message="Register bins from the Admin panel to start seeing telemetry."
      action={<button className="btn btn-primary" onClick={() => onNavigate('admin')}><Icon name="plus" size={16} /> Add a bin</button>}
    />
  )

  const critical = bins.filter((b) => (b.effective_fill ?? 0) >= 80).sort((a, b) => (b.effective_fill ?? 0) - (a.effective_fill ?? 0))

  return (
    <div className="stack">
      <div>
        <div className="page-title">Fleet overview</div>
        <div className="page-subtitle">Live status, weather-adjusted predictions and dispatch policy</div>
      </div>

      <SummaryBar bins={bins} />

      <WeatherWidget bins={bins} />

      <DispatchPanel onGenerateRoute={() => onNavigate('route')} />

      {openAnomalies > 0 && (
        <button className="card" onClick={() => onNavigate('anomalies')}
          style={{ padding: 'var(--sp-4) var(--sp-5)', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', textAlign: 'left', borderLeft: '3px solid var(--danger)' }}>
          <Icon name="warn" size={22} style={{ color: 'var(--danger)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{openAnomalies} open anomaly{openAnomalies === 1 ? '' : 'ies'}</div>
            <div style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>Sensor issues, tamper events, or gas hazards need review</div>
          </div>
          <Icon name="chevron" size={16} style={{ color: 'var(--text-muted)' }} />
        </button>
      )}

      {critical.length > 0 && (
        <section>
          <div className="between" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="warn" size={16} style={{ color: 'var(--danger)' }} />
              <span style={{ fontWeight: 700 }}>Critical bins</span>
              <span className="chip" style={{ background: 'color-mix(in srgb, var(--danger) 15%, transparent)', color: 'var(--danger)' }}>{critical.length}</span>
            </div>
          </div>
          <div className="grid-cards">
            {critical.slice(0, 6).map((b) => <BinCard key={b.id} bin={b} onOpen={onOpenBin} />)}
          </div>
        </section>
      )}

      <section>
        <div className="between" style={{ marginBottom: 12 }}>
          <span style={{ fontWeight: 700 }}>Recent activity</span>
          <button className="btn btn-ghost" onClick={() => onNavigate('bins')} style={{ padding: '6px 12px', fontSize: '.78rem' }}>
            All bins <Icon name="chevron" size={14} />
          </button>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {[...bins].sort((a, b) => new Date(b.last_reading_at || 0) - new Date(a.last_reading_at || 0)).slice(0, 4).map((b, i, arr) => {
            const s = getStatus(b.effective_fill)
            return (
              <div key={b.id} onClick={() => onOpenBin(b)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', cursor: 'pointer', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{b.label}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{timeAgo(b.last_reading_at)}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: s.color, fontSize: '.9rem' }}>
                  {b.effective_fill != null ? `${b.effective_fill.toFixed(0)}%` : '—'}
                </div>
                <Icon name="chevron" size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
