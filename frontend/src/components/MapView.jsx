import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { getStatus } from '../utils'
import { useTheme } from '../hooks/useTheme'
import 'leaflet/dist/leaflet.css'

const STATUS_HEX = {
  'var(--status-normal)':   { light: '#16A34A', dark: '#34D399' },
  'var(--status-warning)':  { light: '#EA580C', dark: '#FB923C' },
  'var(--status-critical)': { light: '#DC2626', dark: '#F87171' },
  'var(--status-offline)':  { light: '#8892AB', dark: '#6C7699' },
}

const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}

export default function MapView({ bins, onOpen }) {
  const { theme } = useTheme()
  if (!bins?.length) return null
  const lat = bins.reduce((s, b) => s + b.latitude, 0) / bins.length
  const lng = bins.reduce((s, b) => s + b.longitude, 0) / bins.length
  return (
    <div style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden', height: 'clamp(360px, 60vh, 640px)', width: '100%', border: '1px solid var(--border)' }}>
      <MapContainer center={[lat, lng]} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer attribution="&copy; CARTO" url={TILES[theme]} />
        {bins.map((bin) => {
          const s = getStatus(bin.effective_fill)
          const c = (STATUS_HEX[s.color] || STATUS_HEX['var(--status-offline)'])[theme]
          const r = bin.effective_fill != null ? 8 + (bin.effective_fill / 100) * 12 : 8
          return (
            <CircleMarker
              key={bin.id}
              center={[bin.latitude, bin.longitude]}
              radius={r}
              pathOptions={{ color: c, fillColor: c, fillOpacity: .45, weight: 2 }}
              eventHandlers={{ click: () => onOpen?.(bin) }}
            >
              <Popup>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '.85rem' }}>
                  <strong>{bin.label}</strong>
                  <div>Effective: {bin.effective_fill?.toFixed(0) ?? '—'}%</div>
                  <div>Raw: {bin.fill_level_pct?.toFixed(0) ?? '—'}%</div>
                  <div>Weight: {bin.weight_kg?.toFixed(1) ?? '—'} kg</div>
                  <div>Gas: {bin.gas_ppm?.toFixed(0) ?? '—'} ppm</div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
