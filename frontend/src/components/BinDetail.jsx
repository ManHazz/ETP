import { useRef, useState } from 'react'
import { api } from '../api'
import Sheet from './Sheet'
import HistoryChart from './HistoryChart'
import Icon from './Icon'
import { getStatus, timeAgo, fmtNum } from '../utils'

export default function BinDetail({ bin, onClose, onRefresh }) {
  const [collecting, setCollecting] = useState(false)
  const [notes, setNotes] = useState('')
  const [photoPath, setPhotoPath] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  if (!bin) return null
  const status = getStatus(bin.effective_fill)

  const pickPhoto = () => fileRef.current?.click()

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('bin_id', String(bin.id))
      const res = await api.upload('/collections/photo', form)
      setPhotoPath(res.photo_path)
    } catch (err) {
      alert('Photo upload failed: ' + err.message)
    } finally { setUploading(false) }
  }

  const markCollected = async () => {
    if (collecting) return
    setCollecting(true)
    let geo = {}
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }))
      geo = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch { /* geo optional */ }
    try {
      await api.post('/collections', {
        bin_id: bin.id,
        fill_at_collection: bin.effective_fill ?? 0,
        weight_at_collection: bin.weight_kg ?? null,
        notes: notes || 'Marked from dashboard',
        photo_path: photoPath,
        ...geo,
      })
      onRefresh?.()
      onClose()
    } catch (err) {
      alert('Failed to log collection: ' + err.message)
    } finally { setCollecting(false) }
  }

  return (
    <Sheet
      open={!!bin}
      onClose={onClose}
      title={bin.label}
      actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={markCollected} disabled={collecting}>
            <Icon name="check" size={16} /> {collecting ? 'Logging…' : 'Mark collected'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
        <div style={{ background: 'var(--grad-brand-soft)', padding: 'var(--sp-5)', borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.6rem', fontWeight: 700, color: status.color, lineHeight: 1 }}>
            {bin.effective_fill != null ? `${bin.effective_fill.toFixed(0)}%` : '—'}
          </div>
          <div>
            <div className="chip" style={{ color: status.color, background: `color-mix(in srgb, ${status.color} 18%, transparent)` }}>{status.label}</div>
            <div style={{ marginTop: 6, fontSize: '.8rem', color: 'var(--text-secondary)' }}>
              Updated {timeAgo(bin.last_reading_at)} {bin.is_dead && '· offline'}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--sp-3)' }}>
          <Stat label="Raw fill" value={fmtNum(bin.fill_level_pct, 0, '%')} />
          <Stat label="Weight" value={fmtNum(bin.weight_kg, 1, ' kg')} />
          <Stat label="Gas" value={fmtNum(bin.gas_ppm, 0, ' ppm')} warn={bin.gas_ppm > 200} />
          <Stat label="Battery" value={fmtNum(bin.battery_voltage, 2, ' V')} warn={bin.battery_voltage < 2.9} />
          <Stat label="Category" value={<span style={{ textTransform: 'capitalize' }}>{bin.category || 'other'}</span>} />
          <Stat label="Capacity" value={fmtNum(bin.capacity_liters, 0, ' L')} />
        </div>

        <div>
          <div className="label" style={{ marginBottom: 8 }}>Sensor history</div>
          <HistoryChart binId={bin.id} />
        </div>

        <div>
          <div className="label" style={{ marginBottom: 8 }}>Collection details (optional)</div>
          <textarea
            className="input"
            placeholder="Notes (e.g., overflowing bag, damage, etc.)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ minHeight: 70, resize: 'vertical' }}
          />
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={uploadPhoto} style={{ display: 'none' }} />
          <div style={{ marginTop: 8, display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
            <button className="btn btn-ghost" onClick={pickPhoto} disabled={uploading}>
              <Icon name="plus" size={14} /> {uploading ? 'Uploading…' : photoPath ? 'Replace photo' : 'Attach photo'}
            </button>
            {photoPath && <span style={{ fontSize: '.78rem', color: 'var(--success)' }}>✓ photo attached</span>}
          </div>
        </div>

        <div>
          <div className="label" style={{ marginBottom: 8 }}>Location</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="location" size={14} /> {bin.latitude.toFixed(5)}, {bin.longitude.toFixed(5)}
          </div>
        </div>
      </div>
    </Sheet>
  )
}

function Stat({ label, value, warn }) {
  return (
    <div style={{ background: 'var(--bg-sunken)', padding: 'var(--sp-3) var(--sp-4)', borderRadius: 'var(--r-md)' }}>
      <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 600, color: warn ? 'var(--danger)' : 'var(--text)', marginTop: 2 }}>{value}</div>
    </div>
  )
}
