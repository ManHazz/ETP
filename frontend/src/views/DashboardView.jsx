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

// Little coloured badges that appear next to a bin name in the forecast so
// the user can see the model has noticed the trend has changed recently.
const TREND_CHIPS = {
  accelerating: { label: 'Filling faster',   color: 'var(--danger)'  },
  slowing:      { label: 'Filling slower',   color: 'var(--warning)' },
  stalled:      { label: 'Stopped filling',  color: 'var(--text-muted)' },
}

export default function DashboardView({ bins, loading, onOpenBin, onNavigate }) {
  const [openAnomalies, setOpenAnomalies] = useState(0)
  const [preds, setPreds] = useState([])
  useEffect(() => {
    api.get('/anomalies?open_only=true&limit=100').then((a) => setOpenAnomalies(a.length)).catch(() => {})
    api.get('/predictions').then(setPreds).catch(() => {})
  }, [bins])

  if (loading) return <div className="stack"><SkeletonGrid n={4} /></div>
  if (!bins?.length) return (
    <EmptyState
      title="No bins yet"
      message="Add bins from the Admin page to see live data."
      action={<button className="btn btn-primary" onClick={() => onNavigate('admin')}><Icon name="plus" size={16} /> Add a bin</button>}
    />
  )

  const critical = bins.filter((b) => (b.effective_fill ?? 0) >= 80).sort((a, b) => (b.effective_fill ?? 0) - (a.effective_fill ?? 0))
  const upcoming = preds
    .filter((p) => p.hours_until_full != null && p.hours_until_full <= 24)
    .sort((a, b) => (a.hours_until_full ?? 999) - (b.hours_until_full ?? 999))
    .slice(0, 4)

  return (
    <div className="stack">
      <div>
        <div className="page-title">Overview</div>
        <div className="page-subtitle">Live bin fill levels and pickup suggestions</div>
      </div>

      <SummaryBar bins={bins} />

      {upcoming.length > 0 && (
        <section className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--brand) 30%, transparent)' }}>
          <div style={{ padding: 'var(--sp-4) var(--sp-5)', background: 'var(--grad-brand-soft)', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--grad-brand)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="analytics" size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Smart forecast</div>
              <div style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>Bins we expect to fill up soon — plan your pickups ahead</div>
            </div>
            <button className="btn btn-ghost" onClick={() => onNavigate('collections')} style={{ padding: '6px 12px', fontSize: '.78rem' }}>
              See all <Icon name="chevron" size={14} />
            </button>
          </div>
          <div>
            {upcoming.map((p, i) => {
              const stateChip = TREND_CHIPS[p.trend_state]
              return (
                <div key={p.bin_id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-5)', borderTop: '1px solid var(--border)' }}>
                  <Icon name="clock" size={16} style={{ color: 'var(--brand)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {p.label}
                      {stateChip && (
                        <span className="chip" style={{ fontSize: '.65rem', padding: '2px 6px', background: `color-mix(in srgb, ${stateChip.color} 20%, transparent)`, color: stateChip.color }}>
                          {stateChip.label}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                      Now {p.current_effective_fill?.toFixed(0) ?? '—'}% · filling {p.fill_rate_per_hour?.toFixed(1) ?? '—'}%/hour
                    </div>
                  </div>
                  <div className="chip" style={{ background: p.hours_until_full <= 1 ? 'var(--danger)' : 'var(--grad-brand)', color: 'white' }}>
                    {p.hours_until_full <= 1 ? 'Fills now' : `Full in ~${p.hours_until_full}h`}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <WeatherWidget bins={bins} />

      <DispatchPanel onGenerateRoute={() => onNavigate('route')} />

      {openAnomalies > 0 && (
        <button className="card" onClick={() => onNavigate('anomalies')}
          style={{ padding: 'var(--sp-4) var(--sp-5)', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', textAlign: 'left', borderLeft: '3px solid var(--danger)' }}>
          <Icon name="warn" size={22} style={{ color: 'var(--danger)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{openAnomalies} open issue{openAnomalies === 1 ? '' : 's'}</div>
            <div style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>Sensor problems or gas alerts that need a look</div>
          </div>
          <Icon name="chevron" size={16} style={{ color: 'var(--text-muted)' }} />
        </button>
      )}

      {critical.length > 0 && (
        <section>
          <div className="between" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="warn" size={16} style={{ color: 'var(--danger)' }} />
              <span style={{ fontWeight: 700 }}>Bins that need pickup soon</span>
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
