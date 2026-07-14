import { useEffect, useState } from 'react'
import { api } from '../api'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import { timeAgo } from '../utils'

export default function CollectionsView({ bins }) {
  const [logs, setLogs] = useState(null)
  const [preds, setPreds] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/collections?limit=50').then(setLogs).catch(() => setLogs([])),
      api.get('/predictions').then(setPreds).catch(() => setPreds([])),
    ]).finally(() => setLoading(false))
  }, [])

  const upcoming = preds
    .filter((p) => p.hours_until_full != null && p.hours_until_full <= 24)
    .sort((a, b) => (a.hours_until_full ?? 999) - (b.hours_until_full ?? 999))
    .slice(0, 10)

  const binLabel = (id) => bins?.find((b) => b.id === id)?.label || `Bin #${id}`

  return (
    <div className="stack">
      <div>
        <div className="page-title">Collections</div>
        <div className="page-subtitle">Predicted pickups + full history from the backend</div>
      </div>

      <section>
        <div className="label" style={{ marginBottom: 12 }}>Predicted next 24h (with confidence)</div>
        {loading ? (
          <div className="card skeleton" style={{ height: 80 }} />
        ) : upcoming.length === 0 ? (
          <div className="card" style={{ padding: 'var(--sp-5)', color: 'var(--text-muted)' }}>Nothing predicted to fill in the next 24h.</div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {upcoming.map((p, i) => (
              <div key={p.bin_id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', borderBottom: i < upcoming.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <Icon name="clock" size={16} style={{ color: 'var(--brand)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{p.label}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                    Now {p.current_effective_fill?.toFixed(0) ?? '—'}% · rate {p.fill_rate_per_hour?.toFixed(1) ?? '—'}%/h · {p.confidence} confidence
                    {p.event ? ` · event: ${p.event}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="chip" style={{ background: p.hours_until_full <= 1 ? 'var(--danger)' : 'var(--grad-brand)', color: 'white' }}>
                    {p.hours_until_full <= 1 ? 'NOW' : `~${p.hours_until_full}h`}
                  </div>
                  {p.hours_until_full_low != null && p.hours_until_full_high != null && (
                    <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                      {p.hours_until_full_low.toFixed(1)}–{p.hours_until_full_high.toFixed(1)}h
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="label" style={{ marginBottom: 12 }}>Collection log</div>
        {loading ? (
          <div className="card skeleton" style={{ height: 80 }} />
        ) : !logs?.length ? (
          <EmptyState icon="collections" title="No collections yet" message="Mark a bin as collected from its detail sheet to see it here." />
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {logs.map((l, i) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', borderBottom: i < logs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <Icon name="check" size={16} style={{ color: 'var(--success)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{binLabel(l.bin_id)}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                    {timeAgo(l.collected_at)} · was {l.fill_at_collection?.toFixed(0) ?? '—'}%
                    {l.collected_by ? ` · by ${l.collected_by}` : ''}
                    {l.notes ? ` · ${l.notes}` : ''}
                  </div>
                </div>
                {l.photo_path && <a href={l.photo_path} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.75rem', color: 'var(--brand)' }}>Photo</a>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
