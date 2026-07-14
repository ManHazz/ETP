import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Icon from './Icon'
import { useTheme } from '../hooks/useTheme'

// Leaflet's default marker icons don't work with bundlers out of the box —
// build one manually so we don't have to shuffle image files around.
const pinIcon = L.divIcon({
  className: 'pin-icon',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--brand);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
})

const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}

// Fallback centre when the form has no coords yet (Malaysia peninsula-ish).
const DEFAULT_CENTER = [4.3856, 103.9634]

function ClickHandler({ onPick }) {
  useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng),
  })
  return null
}

function Recenter({ lat, lng }) {
  const map = useMap()
  useEffect(() => {
    if (lat != null && lng != null) map.flyTo([lat, lng], Math.max(map.getZoom(), 17), { duration: 0.6 })
  }, [lat, lng, map])
  return null
}

export default function LocationPicker({ lat, lng, onChange }) {
  const { theme } = useTheme()
  const [gpsBusy, setGpsBusy] = useState(false)
  const [gpsErr, setGpsErr] = useState(null)
  const mapRef = useRef(null)

  const numLat = lat === '' || lat == null ? null : Number(lat)
  const numLng = lng === '' || lng == null ? null : Number(lng)
  const hasPin = numLat != null && !Number.isNaN(numLat) && numLng != null && !Number.isNaN(numLng)
  const center = hasPin ? [numLat, numLng] : DEFAULT_CENTER

  const useMyLocation = () => {
    setGpsErr(null)
    if (!('geolocation' in navigator)) {
      setGpsErr('Geolocation not supported by this browser.')
      return
    }
    setGpsBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(false)
        onChange(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6))
      },
      (err) => {
        setGpsBusy(false)
        const msg = err.code === 1
          ? 'Location permission denied. Enable it in your browser settings.'
          : err.code === 2
            ? 'Location unavailable — try again outdoors or with GPS on.'
            : 'Timed out getting location.'
        setGpsErr(msg)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  const pick = (la, ln) => onChange(la.toFixed(6), ln.toFixed(6))

  return (
    <div style={{ display: 'grid', gap: 8, gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={useMyLocation}
          disabled={gpsBusy}
          title="Use browser geolocation"
        >
          <Icon name="map" size={16} /> {gpsBusy ? 'Locating…' : 'Use my location'}
        </button>
        <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
          or click on the map to set the pin
        </span>
        {gpsErr && <span style={{ fontSize: '.75rem', color: 'var(--danger)' }}>{gpsErr}</span>}
      </div>

      <div style={{ height: 260, borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <MapContainer
          center={center}
          zoom={hasPin ? 17 : 13}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
          whenCreated={(m) => { mapRef.current = m }}
        >
          <TileLayer attribution="&copy; CARTO &copy; OpenStreetMap" url={TILES[theme]} />
          <ClickHandler onPick={pick} />
          {hasPin && (
            <>
              <Marker position={[numLat, numLng]} icon={pinIcon} />
              <Recenter lat={numLat} lng={numLng} />
            </>
          )}
        </MapContainer>
      </div>
    </div>
  )
}
