import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon'

/*
 * Shows the current dispatch recommendation from the backend engine.
 * This is the answer to "should we roll a truck right now?" — including
 * the reason (hazard, batch met, waiting to batch) and cost per pickup.
 */
export default function DispatchPanel({ onGenerateRoute }) {
  const [policy, setPolicy] = useState({
    hard_threshold: 80, soft_threshold: 40,
    min_bins: 3, topup_radius_km: 0.8, grace_hours: 6,
    cost_per_km: 1.20, cost_per_stop: 8.0,
  })
  const [decision, setDecision] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async (p) => {
    setLoading(true)
    try {
      const q = new URLSearchParams(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])))
      const d = await api.get(`/dispatch-decision?${q.toString()}`)
      setDecision(d)
    } finally { setLoading(false) }
  }

  useEffect(() => { load(policy) }, [])

  const set = (k) => (e) => {
    const v = +e.target.value
    setPolicy((p) => ({ ...p, [k]: v }))
  }
  const apply = () => load(policy)

  const should = decision?.should_dispatch
  const heroBg = !decision ? 'var(--bg-sunken)' :
    decision.hazard_count > 0 ? 'color-mix(in srgb, var(--danger) 12%, var(--bg-surface))' :
    should ? 'var(--grad-brand-soft)' :
    'color-mix(in srgb, var(--warning) 8%, var(--bg-surface))'
  const heroColor = decision?.hazard_count > 0 ? 'var(--danger)' :
    should ? 'var(--brand)' : 'var(--warning)'

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 'var(--sp-5)', background: heroBg, display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div className="between">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: heroColor, color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name={should ? 'route' : 'clock'} size={20} /></div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                {loading ? 'Analysing…' :
                  decision?.hazard_count > 0 ? 'Hazard — dispatch now' :
                  should ? 'Recommended: dispatch' : 'Recommended: wait'}
              </div>
              <div style={{ fontSize: '.82rem', color: 'var(--text-secondary)' }}>Live dispatch policy engine</div>
            </div>
          </div>
          {should && <button className="btn btn-primary" onClick={onGenerateRoute}>
            <Icon name="route" size={16} /> Build route
          </button>}
        </div>

        {decision && (
          <div style={{ fontSize: '.88rem', color: 'var(--text)', padding: 'var(--sp-3)', background: 'var(--bg-surface)', borderRadius: 'var(--r-md)' }}>
            {decision.reason}
          </div>
        )}

        {decision && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--sp-3)' }}>
            <MiniStat label="Must pick up" value={decision.must_pickup.length} tone="danger" />
            <MiniStat label="On the route" value={decision.recommended_pickup.length} tone="brand" />
            <MiniStat label="Deferred" value={decision.deferred.length} tone="warning" />
            <MiniStat label="Est. cost" value={decision.cost_estimate > 0 ? `RM ${decision.cost_estimate.toFixed(2)}` : '—'} tone="accent" />
            <MiniStat label="Per bin" value={decision.cost_per_bin > 0 ? `RM ${decision.cost_per_bin.toFixed(2)}` : '—'} tone="accent" />
            {decision.next_check_at_hours != null && (
              <MiniStat label="Recheck in" value={`${decision.next_check_at_hours.toFixed(1)}h`} tone="warning" />
            )}
          </div>
        )}
      </div>

      {decision?.picks?.length > 0 && (
        <div style={{ padding: 'var(--sp-4) var(--sp-5)' }}>
          <div className="label" style={{ marginBottom: 8 }}>Pickups on the recommended route</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {decision.picks.map((p) => (
              <div key={p.bin_id} className="between" style={{ padding: 'var(--sp-2) var(--sp-3)', background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)', fontSize: '.85rem' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.label}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{p.reason}</div>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: p.effective_fill >= 80 ? 'var(--danger)' : 'var(--brand)' }}>
                  {p.effective_fill != null ? `${p.effective_fill.toFixed(0)}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <details style={{ padding: 'var(--sp-4) var(--sp-5)', borderTop: '1px solid var(--border)' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '.85rem', color: 'var(--text-secondary)' }}>
          Adjust dispatch policy
        </summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' }}>
          <Knob label="Hard threshold %" value={policy.hard_threshold} onChange={set('hard_threshold')} />
          <Knob label="Soft threshold %" value={policy.soft_threshold} onChange={set('soft_threshold')} />
          <Knob label="Min bins to dispatch" value={policy.min_bins} onChange={set('min_bins')} />
          <Knob label="Top-up radius km" value={policy.topup_radius_km} step="0.1" onChange={set('topup_radius_km')} />
          <Knob label="Grace window hours" value={policy.grace_hours} onChange={set('grace_hours')} />
          <Knob label="Cost per km (RM)" value={policy.cost_per_km} step="0.1" onChange={set('cost_per_km')} />
          <Knob label="Cost per stop (RM)" value={policy.cost_per_stop} step="0.5" onChange={set('cost_per_stop')} />
        </div>
        <button className="btn btn-ghost" onClick={apply} style={{ marginTop: 12 }}>Recompute</button>
      </details>
    </div>
  )
}

function MiniStat({ label, value, tone }) {
  const c = tone === 'danger' ? 'var(--danger)' :
            tone === 'warning' ? 'var(--warning)' :
            tone === 'accent' ? 'var(--accent)' : 'var(--brand)'
  return (
    <div style={{ background: 'var(--bg-surface)', padding: 'var(--sp-3)', borderRadius: 'var(--r-md)' }}>
      <div className="stat-label">{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 700, color: c, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function Knob({ label, value, onChange, step = 1 }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className="label">{label}</span>
      <input className="input" type="number" value={value} onChange={onChange} step={step} style={{ padding: '8px 12px' }} />
    </label>
  )
}
