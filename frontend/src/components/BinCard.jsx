import { useState } from 'react'
import { getStatus, timeAgo } from '../utils'
import Tooltip from './Tooltip'
import HistoryChart from './HistoryChart'

export default function BinCard({ bin }) {
  const [showChart, setShowChart] = useState(false)
  const fill = bin.fill_level_pct, eff = bin.effective_fill, status = getStatus(eff)
  const card = { background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'background .15s' }
  return (
    <div style={card} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-raised)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}>
      <div style={{ display: 'flex' }}>
        <div style={{ width: 6, flexShrink: 0, backgroundColor: status.color, transition: 'background-color .4s' }} />
        <div style={{ flex: 1, padding: 'var(--space-md) var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
            <span style={{ fontSize: '.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bin.label}</span>
            <span style={{ fontSize: '.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', color: status.color, background: `color-mix(in srgb,${status.color} 15%,transparent)` }}>{status.label}</span>
          </div>
          {/* Dual fill bars */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <Tooltip text="Effective fill — fused score from all sensors">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 600, color: status.color, minWidth: '3.2ch' }}>{eff != null ? `${eff.toFixed(0)}%` : '—'}</span>
            </Tooltip>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Tooltip text="Effective fill — accounts for weight and gas"><div style={{ width: '100%' }}><div style={{ width: '100%', height: 6, background: 'var(--bg-base)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 3, width: `${eff ?? 0}%`, backgroundColor: status.color, transition: 'width .6s' }} /></div></div></Tooltip>
              <Tooltip text="Raw fill — ToF sensor distance only"><div style={{ width: '100%' }}><div style={{ width: '100%', height: 6, background: 'var(--bg-base)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 3, width: `${fill ?? 0}%`, backgroundColor: 'var(--blue)', opacity: .5, transition: 'width .6s' }} /></div></div></Tooltip>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}><span>effective</span><span>raw {fill != null ? `${fill.toFixed(0)}%` : ''}</span></div>
            </div>
          </div>
          {/* Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}>
            <Tooltip text="Trash weight from HX711 load cells"><div><span style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 500 }}>{bin.weight_kg?.toFixed(1) ?? '—'}</span><div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>kg</div></div></Tooltip>
            <Tooltip text="Gas concentration (MQ-135). High = odor/hazard"><div><span style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 500 }}>{bin.gas_ppm?.toFixed(0) ?? '—'}</span><div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>ppm</div></div></Tooltip>
            <Tooltip text="Sensor node battery. Below 2.8V needs replacement"><div><span style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 500, color: bin.battery_voltage != null && bin.battery_voltage < 2.8 ? 'var(--red)' : 'var(--text-primary)' }}>{bin.battery_voltage?.toFixed(2) ?? '—'}</span><div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>volts</div></div></Tooltip>
          </div>
          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{timeAgo(bin.last_reading_at)}</span>
            <button onClick={() => setShowChart(s => !s)} style={{ fontSize: '.72rem', fontWeight: 500, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>{showChart ? 'Hide chart' : 'Show history'}</button>
          </div>
        </div>
      </div>
      {showChart && <HistoryChart binId={bin.id} />}
    </div>
  )
}
