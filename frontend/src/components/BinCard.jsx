import { getStatus, timeAgo, fmtNum, batteryLevel } from '../utils'
import Icon from './Icon'

const CATEGORY_COLORS = {
  cafeteria: 'var(--brand)', hostel: 'var(--accent)',
  library: '#0891B2', office: '#7C3AED',
  park: 'var(--success)', sports: '#EA580C',
  residential: '#0EA5E9', other: 'var(--text-muted)',
}

export default function BinCard({ bin, onOpen }) {
  const eff = bin.effective_fill
  const raw = bin.fill_level_pct
  const status = getStatus(eff)
  const bat = batteryLevel(bin.battery_voltage)
  const catColor = CATEGORY_COLORS[bin.category] || CATEGORY_COLORS.other

  return (
    <div className="card card-interactive" onClick={() => onOpen(bin)}
      style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 4, background: status.color }} />
      <div style={{ padding: 'var(--sp-4) var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div className="between">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bin.label}</div>
            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Icon name="clock" size={12} /> {timeAgo(bin.last_reading_at)}
              </span>
              {bin.is_dead && <span className="chip" style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 15%, transparent)', padding: '1px 6px', fontSize: '.6rem' }}>OFFLINE</span>}
              {bin.category && bin.category !== 'other' && (
                <span className="chip" style={{ color: catColor, background: `color-mix(in srgb, ${catColor} 14%, transparent)`, padding: '1px 6px', fontSize: '.6rem', textTransform: 'capitalize' }}>{bin.category}</span>
              )}
            </div>
          </div>
          <div className="chip" style={{ color: status.color, background: `color-mix(in srgb, ${status.color} 14%, transparent)` }}>
            {status.label}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-3)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 700, lineHeight: 1, color: status.color }}>
            {eff != null ? `${eff.toFixed(0)}` : '—'}<span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>%</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 }}>
            <div className="pbar"><span style={{ width: `${eff ?? 0}%`, background: status.color }} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.68rem', color: 'var(--text-muted)' }}>
              <span>effective</span>
              <span>raw {raw != null ? `${raw.toFixed(0)}%` : '—'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-2)' }}>
          <MetricPill icon="weight" value={fmtNum(bin.weight_kg, 1)} unit="kg" />
          <MetricPill icon="gas" value={fmtNum(bin.gas_ppm, 0)} unit="ppm" tone={bin.gas_ppm > 200 ? 'warn' : null} />
          <MetricPill icon="battery" value={fmtNum(bin.battery_voltage, 2)} unit="V" tone={bat === 'critical' || bat === 'low' ? 'warn' : null} />
        </div>
      </div>
    </div>
  )
}

function MetricPill({ icon, value, unit, tone }) {
  const color = tone === 'warn' ? 'var(--danger)' : 'var(--text)'
  return (
    <div style={{ background: 'var(--bg-sunken)', borderRadius: 'var(--r-md)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
      <Icon name={icon} size={14} style={{ color: 'var(--text-muted)' }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem', fontWeight: 600, color, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{unit}</div>
      </div>
    </div>
  )
}
