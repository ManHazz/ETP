import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from '../components/Icon'
import LocationPicker from '../components/LocationPicker'

const CATEGORIES = ['cafeteria', 'office', 'hostel', 'park', 'residential', 'sports', 'library', 'other']

export default function AdminView({ bins, onRefresh, user }) {
  return (
    <div className="stack">
      <div>
        <div className="page-title">Admin</div>
        <div className="page-subtitle">Register bins, schedule events, manage the fleet</div>
      </div>

      <UnclaimedDevices onRefresh={onRefresh} />
      <BinForm onRefresh={onRefresh} />
      <BinList bins={bins} onRefresh={onRefresh} />
      <EventsSection bins={bins} />
      {user?.role === 'admin' && <UsersSection />}
    </div>
  )
}

function UnclaimedDevices({ onRefresh }) {
  const [pending, setPending] = useState([])
  const [claiming, setClaiming] = useState(null) // pending bin currently being claimed
  const [form, setForm] = useState({ label: '', latitude: '', longitude: '', floor: 0, capacity_liters: 120, category: 'other', soft_threshold_pct: 40 })
  const [busy, setBusy] = useState(false)

  const load = () => api.get('/bins/pending').then(setPending).catch(() => setPending([]))
  useEffect(() => {
    load()
    const t = setInterval(load, 10000) // poll so new devices appear as they connect
    return () => clearInterval(t)
  }, [])

  const startClaim = (b) => {
    setClaiming(b)
    setForm({ label: '', latitude: '', longitude: '', floor: 0, capacity_liters: 120, category: 'other', soft_threshold_pct: 40 })
  }
  const cancelClaim = () => setClaiming(null)

  const submitClaim = async (e) => {
    e.preventDefault(); setBusy(true)
    try {
      await api.post(`/bins/${claiming.id}/claim`, {
        label: form.label.trim(),
        latitude: +form.latitude,
        longitude: +form.longitude,
        floor: +form.floor,
        capacity_liters: +form.capacity_liters,
        category: form.category,
        soft_threshold_pct: +form.soft_threshold_pct,
      })
      setClaiming(null); load(); onRefresh?.()
    } catch (err) { alert(err.message) }
    finally { setBusy(false) }
  }

  if (pending.length === 0 && !claiming) return null

  return (
    <section>
      <div className="label" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        Unclaimed devices
        {pending.length > 0 && <span className="chip" style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}>{pending.length}</span>}
      </div>

      {claiming ? (
        <form className="card" onSubmit={submitClaim} style={{ padding: 'var(--sp-5)', display: 'grid', gap: 'var(--sp-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div style={{ gridColumn: '1 / -1', fontWeight: 700 }}>
            Claim <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand-strong)' }}>{claiming.device_id}</span>
          </div>
          <Field label="Name" required>
            <input className="input" value={form.label} onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Cafeteria Block A" required autoFocus />
          </Field>
          <Field label="Category">
            <select className="input" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Capacity (L)"><input className="input" type="number" value={form.capacity_liters} onChange={(e) => setForm(f => ({ ...f, capacity_liters: e.target.value }))} /></Field>
          <Field label="Floor (0 = ground)"><input className="input" type="number" min="0" max="200" value={form.floor} onChange={(e) => setForm(f => ({ ...f, floor: e.target.value }))} /></Field>
          <Field label="Soft threshold %"><input className="input" type="number" min="0" max="100" value={form.soft_threshold_pct} onChange={(e) => setForm(f => ({ ...f, soft_threshold_pct: e.target.value }))} /></Field>
          <Field label="Latitude" required><input className="input" type="number" step="0.00001" value={form.latitude} onChange={(e) => setForm(f => ({ ...f, latitude: e.target.value }))} required /></Field>
          <Field label="Longitude" required><input className="input" type="number" step="0.00001" value={form.longitude} onChange={(e) => setForm(f => ({ ...f, longitude: e.target.value }))} required /></Field>
          <LocationPicker
            lat={form.latitude}
            lng={form.longitude}
            onChange={(la, ln) => setForm((f) => ({ ...f, latitude: la, longitude: ln }))}
          />
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12 }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Claiming…' : 'Claim'}</button>
            <button className="btn btn-secondary" type="button" onClick={cancelClaim}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {pending.map((b, i) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', borderBottom: i < pending.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '.9rem', fontFamily: 'var(--font-mono)' }}>{b.device_id}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                  detected {new Date(b.created_at).toLocaleTimeString()}
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => startClaim(b)}>
                <Icon name="plus" size={14} /> Claim
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function BinForm({ onRefresh }) {
  const [form, setForm] = useState({
    label: '', latitude: '', longitude: '', floor: 0,
    capacity_liters: 120, category: 'other',
    soft_threshold_pct: 40, description: '',
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      await api.post('/bins', {
        label: form.label.trim(),
        latitude: +form.latitude, longitude: +form.longitude,
        floor: +form.floor,
        capacity_liters: +form.capacity_liters,
        category: form.category,
        soft_threshold_pct: +form.soft_threshold_pct,
        description: form.description.trim() || null,
      })
      setMsg({ type: 'ok', text: 'Bin registered.' })
      setForm({ label: '', latitude: '', longitude: '', floor: 0, capacity_liters: 120, category: 'other', soft_threshold_pct: 40, description: '' })
      onRefresh?.()
    } catch (err) { setMsg({ type: 'err', text: err.message }) }
    finally { setBusy(false) }
  }

  return (
    <form className="card" onSubmit={submit} style={{ padding: 'var(--sp-5)', display: 'grid', gap: 'var(--sp-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={{ fontWeight: 700 }}>Register a bin manually</div>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
          For non-ESP32 bins or planning. ESP32s show up automatically in "Unclaimed devices" above.
        </div>
      </div>

      <Field label="Label" required><input className="input" value={form.label} onChange={set('label')} required placeholder="Cafeteria Block A" /></Field>
      <Field label="Category">
        <select className="input" value={form.category} onChange={set('category')}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Latitude" required><input className="input" type="number" step="0.00001" value={form.latitude} onChange={set('latitude')} required placeholder="4.38560" /></Field>
      <Field label="Longitude" required><input className="input" type="number" step="0.00001" value={form.longitude} onChange={set('longitude')} required placeholder="103.96340" /></Field>
      <LocationPicker
        lat={form.latitude}
        lng={form.longitude}
        onChange={(la, ln) => setForm((f) => ({ ...f, latitude: la, longitude: ln }))}
      />
      <Field label="Capacity (L)"><input className="input" type="number" value={form.capacity_liters} onChange={set('capacity_liters')} /></Field>
      <Field label="Floor (0 = ground)"><input className="input" type="number" min="0" max="200" value={form.floor} onChange={set('floor')} /></Field>
      <Field label="Soft threshold %"><input className="input" type="number" value={form.soft_threshold_pct} onChange={set('soft_threshold_pct')} min="0" max="100" /></Field>
      <Field label="Description"><input className="input" value={form.description} onChange={set('description')} placeholder="Near entrance" /></Field>

      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          <Icon name="plus" size={16} /> {busy ? 'Registering…' : 'Register bin'}
        </button>
        {msg && <span style={{ fontSize: '.85rem', color: msg.type === 'ok' ? 'var(--success)' : 'var(--danger)' }}>{msg.text}</span>}
      </div>
    </form>
  )
}

function BinList({ bins, onRefresh }) {
  const remove = async (b) => {
    if (!confirm(`Deactivate "${b.label}"? (history is preserved)`)) return
    await api.del(`/bins/${b.id}`); onRefresh?.()
  }
  return (
    <section>
      <div className="label" style={{ marginBottom: 12 }}>Registered bins ({bins?.length || 0})</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {(bins || []).map((b, i) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', borderBottom: i < bins.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{b.label} <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>· {b.category}</span></div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                #{b.id} · {b.latitude.toFixed(4)}, {b.longitude.toFixed(4)}
              </div>
            </div>
            <button className="btn btn-icon btn-danger" onClick={() => remove(b)} aria-label="Delete"><Icon name="close" size={16} /></button>
          </div>
        ))}
        {(!bins || bins.length === 0) && <div style={{ padding: 'var(--sp-5)', color: 'var(--text-muted)', textAlign: 'center' }}>No bins registered yet.</div>}
      </div>
    </section>
  )
}

function EventsSection({ bins }) {
  const [events, setEvents] = useState([])
  const [form, setForm] = useState({ bin_id: '', label: '', starts_at: '', ends_at: '', fill_rate_multiplier: 1.5, notes: '' })
  const [busy, setBusy] = useState(false)

  const load = () => api.get('/bin-events?upcoming_only=false').then(setEvents).catch(() => {})
  useEffect(() => { load() }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault(); setBusy(true)
    try {
      await api.post('/bin-events', {
        bin_id: form.bin_id ? +form.bin_id : null,
        label: form.label.trim(),
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        fill_rate_multiplier: +form.fill_rate_multiplier,
        notes: form.notes.trim() || null,
      })
      setForm({ bin_id: '', label: '', starts_at: '', ends_at: '', fill_rate_multiplier: 1.5, notes: '' })
      load()
    } catch (err) { alert(err.message) }
    finally { setBusy(false) }
  }
  const remove = async (id) => { await api.del(`/bin-events/${id}`); load() }

  return (
    <section>
      <div className="label" style={{ marginBottom: 12 }}>Scheduled events</div>
      <form className="card" onSubmit={submit} style={{ padding: 'var(--sp-4)', display: 'grid', gap: 'var(--sp-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 12 }}>
        <Field label="Bin (blank = fleet-wide)">
          <select className="input" value={form.bin_id} onChange={set('bin_id')}>
            <option value="">— All bins —</option>
            {bins?.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </Field>
        <Field label="Label" required><input className="input" value={form.label} onChange={set('label')} required placeholder="Exam week" /></Field>
        <Field label="Starts" required><input className="input" type="datetime-local" value={form.starts_at} onChange={set('starts_at')} required /></Field>
        <Field label="Ends" required><input className="input" type="datetime-local" value={form.ends_at} onChange={set('ends_at')} required /></Field>
        <Field label="Fill rate ×"><input className="input" type="number" step="0.1" min="0.1" value={form.fill_rate_multiplier} onChange={set('fill_rate_multiplier')} /></Field>
        <Field label="Notes"><input className="input" value={form.notes} onChange={set('notes')} /></Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <button className="btn btn-primary" type="submit" disabled={busy}><Icon name="plus" size={16} /> Add event</button>
        </div>
      </form>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {events.length === 0 && <div style={{ padding: 'var(--sp-5)', color: 'var(--text-muted)', textAlign: 'center' }}>No events scheduled.</div>}
        {events.map((e, i) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{e.label} <span className="chip" style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}>{e.fill_rate_multiplier}×</span></div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                {new Date(e.starts_at).toLocaleString()} → {new Date(e.ends_at).toLocaleString()}
                {e.bin_id ? ` · ${bins?.find((b) => b.id === e.bin_id)?.label || `bin ${e.bin_id}`}` : ' · fleet-wide'}
              </div>
            </div>
            <button className="btn btn-icon btn-danger" onClick={() => remove(e.id)}><Icon name="close" size={14} /></button>
          </div>
        ))}
      </div>
    </section>
  )
}

function UsersSection() {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ username: '', password: '', role: 'viewer', full_name: '' })
  const load = () => api.get('/users').then(setUsers).catch(() => {})
  useEffect(() => { load() }, [])
  const submit = async (e) => {
    e.preventDefault()
    try { await api.post('/users', form); setForm({ username: '', password: '', role: 'viewer', full_name: '' }); load() }
    catch (err) { alert(err.message) }
  }
  return (
    <section>
      <div className="label" style={{ marginBottom: 12 }}>Users</div>
      <form className="card" onSubmit={submit} style={{ padding: 'var(--sp-4)', display: 'grid', gap: 'var(--sp-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 12 }}>
        <Field label="Username" required><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></Field>
        <Field label="Password" required><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></Field>
        <Field label="Full name"><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
        <Field label="Role">
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="viewer">viewer</option>
            <option value="driver">driver</option>
            <option value="admin">admin</option>
          </select>
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <button className="btn btn-primary" type="submit"><Icon name="plus" size={16} /> Add user</button>
        </div>
      </form>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {users.map((u, i) => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{u.username} {u.full_name && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {u.full_name}</span>}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Role: {u.role}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Field({ label, required, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="label">{label}{required && ' *'}</span>
      {children}
    </label>
  )
}
