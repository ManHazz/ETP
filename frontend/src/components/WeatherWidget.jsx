import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon'

/*
 * Fleet-average weather snapshot (uses centroid of active bins).
 * The backend hits Open-Meteo (no API key) and returns fill/gas multipliers
 * that the predictor is already applying — this widget just surfaces them.
 */
export default function WeatherWidget({ bins }) {
  const [w, setW] = useState(null)

  useEffect(() => {
    if (!bins?.length) return
    const lat = bins.reduce((s, b) => s + b.latitude, 0) / bins.length
    const lng = bins.reduce((s, b) => s + b.longitude, 0) / bins.length
    api.get(`/weather?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`)
      .then(setW)
      .catch(() => setW(null))
  }, [bins?.length])

  if (!w) return null
  const fmul = w.fill_multiplier ?? 1
  const gmul = w.gas_multiplier ?? 1

  return (
    <div className="card" style={{ padding: 'var(--sp-4) var(--sp-5)', display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: 'var(--accent-soft)',
        color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><Icon name="gas" size={22} /></div>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Current conditions</div>
        <div style={{ fontWeight: 600, fontSize: '.95rem', textTransform: 'capitalize' }}>{w.summary}</div>
        <div style={{ fontSize: '.75rem', color: 'var(--text-secondary)' }}>
          {w.temp_c != null && `${w.temp_c.toFixed(1)}°C`}
          {w.precipitation_mm != null && ` · ${w.precipitation_mm.toFixed(1)}mm rain`}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
        <Multi label="Fill rate" v={fmul} />
        <Multi label="Gas" v={gmul} warn />
      </div>
    </div>
  )
}

function Multi({ label, v, warn }) {
  const above = v > 1.01
  const below = v < 0.99
  const color = warn && above ? 'var(--danger)' : above ? 'var(--brand)' : below ? 'var(--accent)' : 'var(--text-muted)'
  const sign = above ? '↑' : below ? '↓' : '='
  return (
    <div style={{ textAlign: 'center', minWidth: 60 }}>
      <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color }}>{sign} {v.toFixed(2)}×</div>
    </div>
  )
}
