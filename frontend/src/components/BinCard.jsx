import { useState } from 'react'
import { getStatus, timeAgo } from '../utils'
import Tooltip from './Tooltip'
import HistoryChart from './HistoryChart'

const styles = {
  card: {
    background: 'var(--bg-surface)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition: 'background 0.15s ease',
  },
  inner: {
    display: 'flex',
    flexDirection: 'row',
  },
  fillBar: {
    width: '6px',
    flexShrink: 0,
    borderRadius: '3px 0 0 3px',
    transition: 'background-color 0.4s ease',
  },
  body: {
    flex: 1,
    padding: 'var(--space-md) var(--space-lg)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
    minWidth: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 'var(--space-sm)',
  },
  label: {
    fontSize: '0.9rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  badge: {
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '99px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  fillRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-md)',
    width: '100%',
  },
  fillLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '1.4rem',
    fontWeight: 600,
    lineHeight: 1,
    minWidth: '3.2ch',
  },
  fillTrack: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  track: {
    width: '100%',
    height: '6px',
    background: 'var(--bg-base)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  thumb: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.6s ease, background-color 0.4s ease',
  },
  trackLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.65rem',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'var(--space-sm)',
    marginTop: 'var(--space-xs)',
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  metricValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
  metricLabel: {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  time: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  chartBtn: {
    fontSize: '0.72rem',
    fontWeight: 500,
    color: 'var(--blue)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    padding: '2px 0',
  },
}

export default function BinCard({ bin }) {
  const [showChart, setShowChart] = useState(false)
  const fill = bin.fill_level_pct
  const effective = bin.effective_fill
  const status = getStatus(effective)

  return (
    <div
      style={styles.card}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-raised)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
    >
      <div style={styles.inner}>
        {/* Colored accent bar — based on effective fill */}
        <div style={{ ...styles.fillBar, backgroundColor: status.color }} />

        <div style={styles.body}>
          {/* Header */}
          <div style={styles.header}>
            <span style={styles.label}>{bin.label}</span>
            <span
              style={{
                ...styles.badge,
                color: status.color,
                background: `color-mix(in srgb, ${status.color} 15%, transparent)`,
              }}
            >
              {status.label}
            </span>
          </div>

          {/* Dual fill bars */}
          <div style={styles.fillRow}>
            <Tooltip text="Effective fill — fused score from all sensors (used for routing decisions)">
              <span style={{ ...styles.fillLabel, color: status.color }}>
                {effective != null ? `${effective.toFixed(0)}%` : '—'}
              </span>
            </Tooltip>

            <div style={styles.fillTrack}>
              <Tooltip text="Effective fill — accounts for weight and gas, not just height">
                <div style={{ width: '100%' }}>
                  <div style={styles.track}>
                    <div style={{ ...styles.thumb, width: `${effective ?? 0}%`, backgroundColor: status.color }} />
                  </div>
                </div>
              </Tooltip>
              <Tooltip text="Raw fill — distance measured by ToF sensor only">
                <div style={{ width: '100%' }}>
                  <div style={styles.track}>
                    <div style={{ ...styles.thumb, width: `${fill ?? 0}%`, backgroundColor: 'var(--blue)', opacity: 0.5 }} />
                  </div>
                </div>
              </Tooltip>
              <div style={styles.trackLabel}>
                <span>effective</span>
                <span>raw {fill != null ? `${fill.toFixed(0)}%` : ''}</span>
              </div>
            </div>
          </div>

          {/* Sensor metrics */}
          <div style={styles.metrics}>
            <Tooltip text="Trash weight from HX711 load cells under the bin">
              <div style={styles.metric}>
                <span style={styles.metricValue}>
                  {bin.weight_kg != null ? `${bin.weight_kg.toFixed(1)}` : '—'}
                </span>
                <span style={styles.metricLabel}>kg</span>
              </div>
            </Tooltip>
            <Tooltip text="Gas concentration (MQ-135). High = strong odor or hazardous fumes">
              <div style={styles.metric}>
                <span style={styles.metricValue}>
                  {bin.gas_ppm != null ? `${bin.gas_ppm.toFixed(0)}` : '—'}
                </span>
                <span style={styles.metricLabel}>ppm</span>
              </div>
            </Tooltip>
            <Tooltip text="Sensor node battery. Below 2.8V needs replacement">
              <div style={styles.metric}>
                <span style={{
                  ...styles.metricValue,
                  color: bin.battery_voltage != null && bin.battery_voltage < 2.8
                    ? 'var(--red)' : 'var(--text-primary)',
                }}>
                  {bin.battery_voltage != null ? `${bin.battery_voltage.toFixed(2)}` : '—'}
                </span>
                <span style={styles.metricLabel}>volts</span>
              </div>
            </Tooltip>
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <span style={styles.time}>{timeAgo(bin.last_reading_at)}</span>
            <button style={styles.chartBtn} onClick={() => setShowChart(s => !s)}>
              {showChart ? 'Hide chart' : 'Show history'}
            </button>
          </div>
        </div>
      </div>

      {showChart && <HistoryChart binId={bin.id} />}
    </div>
  )
}
