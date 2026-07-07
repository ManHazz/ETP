import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, Popup, Marker } from 'react-leaflet'
import L from 'leaflet'
import { getStatus } from '../utils'
import 'leaflet/dist/leaflet.css'

const depotIcon = L.divIcon({ className: '', html: '<div style="width:28px;height:28px;background:#7aa2f7;border:3px solid #1a1b2e;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#1a1b2e;font-weight:700">D</div>', iconSize: [28, 28], iconAnchor: [14, 14] })
const stopIcon = (n) => L.divIcon({ className: '', html: `<div style="width:26px;height:26px;background:#f7768e;border:3px solid #1a1b2e;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;color:#1a1b2e;font-weight:700;font-family:monospace">${n}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] })
const colorMap = { 'var(--green)': '#9ece6a', 'var(--amber)': '#e0af68', 'var(--red)': '#f7768e', 'var(--text-muted)': '#565f89' }
const btn = { fontFamily: 'var(--font-ui)', fontSize: '.82rem', fontWeight: 600, padding: '6px 16px', borderRadius: 99, border: 'none', background: 'var(--blue)', color: 'var(--bg-base)', cursor: 'pointer' }
const inp = { fontFamily: 'var(--font-mono)', fontSize: '.82rem', width: 60, padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-raised)', color: 'var(--text-primary)', outline: 'none' }

export default function RouteView() {
  const [data, setData] = useState(null), [loading, setLoading] = useState(false)
  const [threshold, setThreshold] = useState(80), [hours, setHours] = useState(8)
  const go = () => { setLoading(true); fetch(`/api/route?threshold=${threshold}&hours_ahead=${hours}`).then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false)) }
  useEffect(() => { go() }, [])
  const route = data?.route || [], preds = data?.predictions || []
  const coords = route.map(s => [s.latitude, s.longitude])
  const center = route.length ? [route[0].latitude, route[0].longitude] : [4.3856, 103.9634]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: 'var(--text-secondary)' }}>
          <span>Threshold</span><input type="number" value={threshold} onChange={e => setThreshold(+e.target.value)} style={inp} min={0} max={100} /><span>%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: 'var(--text-secondary)' }}>
          <span>Look ahead</span><input type="number" value={hours} onChange={e => setHours(+e.target.value)} style={inp} min={0} max={72} /><span>hours</span>
        </div>
        <button onClick={go} style={btn} disabled={loading}>{loading ? 'Computing…' : 'Generate route'}</button>
      </div>
      {/* Stats */}
      {data?.status === 'optimal' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 'var(--space-sm)' }}>
          {[{ v: data.total_stops, l: 'Stops' }, { v: data.total_distance_km, l: 'km total' }, { v: data.estimated_time_minutes, l: 'est. min' }].map(s => (
            <div key={s.l} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-md)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 600, color: 'var(--blue)' }}>{s.v}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}
      {/* Map */}
      {route.length > 0 ? (
        <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', height: 'clamp(300px,50vh,500px)', width: '100%' }}>
          <MapContainer center={center} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
            <TileLayer attribution="&copy; CARTO" url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            <Polyline positions={coords} pathOptions={{ color: '#7aa2f7', weight: 3, opacity: .7, dashArray: '8,8' }} />
            {route.map((s, i) => s.type === 'depot' || s.type === 'return'
              ? <Marker key={`d${i}`} position={[s.latitude, s.longitude]} icon={depotIcon}><Popup><strong>{s.label}</strong><br />{s.type === 'return' ? 'Return' : 'Start'}</Popup></Marker>
              : <Marker key={`s${i}`} position={[s.latitude, s.longitude]} icon={stopIcon(s.order)}><Popup><strong>#{s.order} — {s.label}</strong><br />Effective: {s.effective_fill?.toFixed(0) ?? '—'}%</Popup></Marker>
            )}
          </MapContainer>
        </div>
      ) : data?.status === 'no_bins' ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-2xl)', color: 'var(--text-muted)' }}>No bins need collection. Adjust threshold or look-ahead.</div>
      ) : null}
      {/* Stop list */}
      {route.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {route.map((s, i) => (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-sm) var(--space-md)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', fontSize: '.85rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '.82rem', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: s.type === 'pickup' ? 'var(--red)' : 'var(--blue)', color: 'var(--bg-base)' }}>{s.type === 'pickup' ? s.order : 'D'}</div>
                <span style={{ flex: 1, fontWeight: 500 }}>{s.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.78rem', color: s.type === 'pickup' ? ((s.effective_fill ?? 0) >= 80 ? 'var(--red)' : 'var(--amber)') : 'var(--blue)' }}>
                  {s.type === 'pickup' ? `${s.effective_fill?.toFixed(0) ?? '—'}%` : s.type === 'depot' ? 'START' : 'END'}
                </span>
              </div>
              {i < route.length - 1 && <div style={{ width: 24, display: 'flex', justifyContent: 'center' }}><div style={{ width: 2, height: 12, background: 'var(--border)' }} /></div>}
            </div>
          ))}
        </div>
      )}
      {/* Predictions */}
      {preds.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)' }}>
          <div style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)', textTransform: 'uppercase', letterSpacing: '.03em' }}>All bin predictions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,260px),1fr))', gap: 'var(--space-sm)' }}>
            {preds.map(p => { const s = getStatus(p.current_effective_fill); return (
              <div key={p.bin_id} style={{ padding: 'var(--space-sm) var(--space-md)', background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.82rem' }}>
                <span style={{ fontWeight: 500 }}>{p.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.78rem', color: colorMap[s.color] || '#565f89' }}>{p.hours_until_full != null ? (p.hours_until_full <= 0 ? 'NOW' : `${p.hours_until_full}h`) : '—'}</span>
              </div>
            )})}
          </div>
        </div>
      )}
    </div>
  )
}
