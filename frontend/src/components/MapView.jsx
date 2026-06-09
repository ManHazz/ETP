import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { getStatus } from '../utils'
import 'leaflet/dist/leaflet.css'

const styles = {
  wrapper: {
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    height: 'clamp(300px, 50vh, 500px)',
    width: '100%',
  },
  popup: {
    fontFamily: 'var(--font-ui)',
    fontSize: '0.82rem',
    lineHeight: 1.5,
  },
  popupLabel: {
    fontWeight: 600,
    marginBottom: '4px',
  },
  popupRow: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.78rem',
  },
}

// Calculate center from bin positions
function getCenter(bins) {
  if (!bins.length) return [4.3856, 103.9634] // UTP fallback
  const lat = bins.reduce((s, b) => s + b.latitude, 0) / bins.length
  const lng = bins.reduce((s, b) => s + b.longitude, 0) / bins.length
  return [lat, lng]
}

// Convert CSS var color to hex for Leaflet
const colorMap = {
  'var(--green)': '#9ece6a',
  'var(--amber)': '#e0af68',
  'var(--red)': '#f7768e',
  'var(--text-muted)': '#565f89',
}

function MapUpdater({ bins }) {
  // Re-renders markers when bins update — handled by react-leaflet reactivity
  return null
}

export default function MapView({ bins, onSelectBin }) {
  if (!bins || bins.length === 0) return null

  const center = getCenter(bins)

  return (
    <div style={styles.wrapper}>
      <MapContainer
        center={center}
        zoom={16}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {bins.map(bin => {
          const status = getStatus(bin.effective_fill)
          const hex = colorMap[status.color] || '#565f89'
          const radius = bin.effective_fill != null
            ? 6 + (bin.effective_fill / 100) * 10
            : 6

          return (
            <CircleMarker
              key={bin.id}
              center={[bin.latitude, bin.longitude]}
              radius={radius}
              pathOptions={{
                color: hex,
                fillColor: hex,
                fillOpacity: 0.35,
                weight: 2,
              }}
              eventHandlers={{
                click: () => onSelectBin?.(bin.id),
              }}
            >
              <Popup>
                <div style={styles.popup}>
                  <div style={styles.popupLabel}>{bin.label}</div>
                  <div style={styles.popupRow}>
                    Effective: {bin.effective_fill?.toFixed(0) ?? '—'}%
                  </div>
                  <div style={styles.popupRow}>
                    Raw fill: {bin.fill_level_pct?.toFixed(0) ?? '—'}%
                  </div>
                  <div style={styles.popupRow}>
                    Weight: {bin.weight_kg?.toFixed(1) ?? '—'} kg
                  </div>
                  <div style={styles.popupRow}>
                    Gas: {bin.gas_ppm?.toFixed(0) ?? '—'} ppm
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
