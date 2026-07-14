import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Polyline, Popup, Marker } from 'react-leaflet'
import L from 'leaflet'
import { useTheme } from '../hooks/useTheme'
import Icon from './Icon'
import DispatchPanel from './DispatchPanel'
import { api } from '../api'
import 'leaflet/dist/leaflet.css'

const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}

const depotIcon = L.divIcon({
  className: '',
  html: '<div style="width:32px;height:32px;background:#2563EB;border:3px solid white;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;color:white;font-weight:800;box-shadow:0 4px 12px rgba(37,99,235,.4)">D</div>',
  iconSize: [32, 32], iconAnchor: [16, 16],
})
const stopIcon = (n) => L.divIcon({
  className: '',
  html: `<div style="width:30px;height:30px;background:#C026D3;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;color:white;font-weight:800;font-family:monospace;box-shadow:0 4px 12px rgba(192,38,211,.4)">${n}</div>`,
  iconSize: [30, 30], iconAnchor: [15, 15],
})

export default function RouteView() {
  const { theme } = useTheme()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [threshold, setThreshold] = useState(80)
  const [minBins, setMinBins] = useState(3)
  const [respectPolicy, setRespectPolicy] = useState(true)

  const build = async () => {
    setLoading(true)
    try {
      const d = await api.get(`/route?threshold=${threshold}&min_bins=${minBins}&respect_policy=${respectPolicy}`)
      setData(d)
    } catch (err) {
      setData({ status: 'error', error: err.message, route: [], predictions: [] })
    } finally { setLoading(false) }
  }
  useEffect(() => { build() }, [])

  const route = data?.route || []
  const preds = data?.predictions || []
  const coords = route.map((s) => [s.latitude, s.longitude])
  const center = route.length ? [route[0].latitude, route[0].longitude] : [4.3856, 103.9634]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
      <DispatchPanel onGenerateRoute={build} />

      <div className="card" style={{ padding: 'var(--sp-4)', display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-4)', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="label">Hard threshold %</label>
          <input className="input" type="number" value={threshold} onChange={(e) => setThreshold(+e.target.value)} min={0} max={100} style={{ width: 100 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="label">Min bins to dispatch</label>
          <input className="input" type="number" value={minBins} onChange={(e) => setMinBins(+e.target.value)} min={1} max={50} style={{ width: 100 }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem' }}>
          <input type="checkbox" checked={respectPolicy} onChange={(e) => setRespectPolicy(e.target.checked)} />
          Respect batching policy
        </label>
        <button className="btn btn-primary" onClick={build} disabled={loading} style={{ marginLeft: 'auto' }}>
          <Icon name="route" size={16} /> {loading ? 'Computing…' : 'Rebuild route'}
        </button>
      </div>

      {data?.status === 'deferred' && (
        <div className="card" style={{ padding: 'var(--sp-6)', textAlign: 'center', borderLeft: '3px solid var(--warning)' }}>
          <Icon name="clock" size={22} style={{ color: 'var(--warning)' }} />
          <div style={{ fontWeight: 700, fontSize: '1rem', margin: '8px 0' }}>Dispatch deferred by policy</div>
          <div style={{ color: 'var(--text-secondary)' }}>{data.decision?.reason}</div>
        </div>
      )}

      {data?.status === 'optimal' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--sp-3)' }}>
          <Stat label="Stops" value={data.total_stops} />
          <Stat label="Total km" value={data.total_distance_km} />
          <Stat label="Est. min" value={data.estimated_time_minutes} />
        </div>
      )}

      {route.length > 0 && (
        <div style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden', height: 'clamp(320px, 55vh, 560px)', border: '1px solid var(--border)' }}>
          <MapContainer center={center} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
            <TileLayer attribution="&copy; CARTO / OSM" url={TILES[theme]} />
            <Polyline positions={coords} pathOptions={{ color: '#C026D3', weight: 3, opacity: .8, dashArray: '8, 8' }} />
            {route.map((s, i) => s.type === 'depot' || s.type === 'return'
              ? <Marker key={`d${i}`} position={[s.latitude, s.longitude]} icon={depotIcon}><Popup><strong>{s.label}</strong><br />{s.type === 'return' ? 'Return' : 'Start'}</Popup></Marker>
              : <Marker key={`s${i}`} position={[s.latitude, s.longitude]} icon={stopIcon(s.order)}><Popup><strong>#{s.order} — {s.label}</strong><br />Effective: {s.effective_fill?.toFixed(0) ?? '—'}%<br />Reason: {s.reason || '—'}</Popup></Marker>
            )}
          </MapContainer>
        </div>
      )}

      {route.length > 0 && (
        <div className="card" style={{ padding: 'var(--sp-4)' }}>
          <div className="label" style={{ marginBottom: 12 }}>Stop order</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {route.map((s, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3)', borderRadius: 'var(--r-md)', background: 'var(--bg-sunken)' }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '.78rem',
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: s.type === 'pickup' ? 'var(--brand)' : 'var(--accent)',
                    color: 'white',
                  }}>{s.type === 'pickup' ? s.order : 'D'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '.9rem' }}>{s.label}</span>
                    {s.reason && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{s.reason}</div>}
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '.8rem',
                    color: s.type === 'pickup' ? ((s.effective_fill ?? 0) >= 80 ? 'var(--danger)' : 'var(--warning)') : 'var(--accent)',
                  }}>
                    {s.type === 'pickup' ? `${s.effective_fill?.toFixed(0) ?? '—'}%` : s.type === 'depot' ? 'START' : 'END'}
                  </span>
                </div>
                {i < route.length - 1 && <div style={{ width: 28, display: 'flex', justifyContent: 'center' }}><div style={{ width: 2, height: 12, background: 'var(--border)' }} /></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {preds.length > 0 && (
        <div className="card" style={{ padding: 'var(--sp-4)' }}>
          <div className="label" style={{ marginBottom: 12 }}>All bin predictions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 8 }}>
            {preds.map((p) => (
              <div key={p.bin_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)', fontSize: '.82rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{p.confidence} conf. · {p.fill_rate_per_hour?.toFixed(1) ?? '—'}%/h</div>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.78rem', color: 'var(--brand)' }}>
                  {p.hours_until_full != null ? (p.hours_until_full <= 0 ? 'NOW' : `${p.hours_until_full}h`) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat stat-accent-brand">
      <span className="stat-label">{label}</span>
      <div className="stat-value">{value}</div>
    </div>
  )
}
