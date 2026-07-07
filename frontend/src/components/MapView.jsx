import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { getStatus } from '../utils'
import 'leaflet/dist/leaflet.css'
const hex = { 'var(--green)': '#9ece6a', 'var(--amber)': '#e0af68', 'var(--red)': '#f7768e', 'var(--text-muted)': '#565f89' }
export default function MapView({ bins }) {
  if (!bins?.length) return null
  const lat = bins.reduce((s, b) => s + b.latitude, 0) / bins.length
  const lng = bins.reduce((s, b) => s + b.longitude, 0) / bins.length
  return (
    <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', height: 'clamp(300px,50vh,500px)', width: '100%' }}>
      <MapContainer center={[lat, lng]} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {bins.map(bin => {
          const s = getStatus(bin.effective_fill), c = hex[s.color] || '#565f89', r = bin.effective_fill != null ? 6 + (bin.effective_fill / 100) * 10 : 6
          return (<CircleMarker key={bin.id} center={[bin.latitude, bin.longitude]} radius={r} pathOptions={{ color: c, fillColor: c, fillOpacity: .35, weight: 2 }}>
            <Popup><div style={{ fontFamily: 'var(--font-ui)', fontSize: '.82rem' }}><strong>{bin.label}</strong><div>Effective: {bin.effective_fill?.toFixed(0) ?? '—'}%</div><div>Raw: {bin.fill_level_pct?.toFixed(0) ?? '—'}%</div><div>Weight: {bin.weight_kg?.toFixed(1) ?? '—'} kg</div><div>Gas: {bin.gas_ppm?.toFixed(0) ?? '—'} ppm</div></div></Popup>
          </CircleMarker>)
        })}
      </MapContainer>
    </div>
  )
}
