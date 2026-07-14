import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { NAV_ITEMS } from '../components/Sidebar'

const ALERTS_KEY = 'smartbin-alerts-on'
const THRESH_KEY = 'smartbin-threshold'

export default function SettingsView({ theme, onToggleTheme, canInstall, onInstall, onNavigate, user, onLogout }) {
  const [alertsOn, setAlertsOn] = useState(localStorage.getItem(ALERTS_KEY) !== '0')
  const [threshold, setThreshold] = useState(+(localStorage.getItem(THRESH_KEY) || 80))
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')

  useEffect(() => { localStorage.setItem(ALERTS_KEY, alertsOn ? '1' : '0') }, [alertsOn])
  useEffect(() => { localStorage.setItem(THRESH_KEY, String(threshold)) }, [threshold])

  const askNotif = async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setNotifPerm(p)
  }

  return (
    <div className="stack">
      <div>
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Preferences, alerts, and installation</div>
      </div>

      {/* Mobile-only nav shortcut list */}
      <section className="mobile-only" style={{ display: 'block' }}>
        <div className="label" style={{ marginBottom: 12 }}>Navigate</div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {NAV_ITEMS.filter((n) => !['dashboard', 'bins', 'map', 'route'].includes(n.id)).map((n, i, arr) => (
            <button key={n.id} onClick={() => onNavigate(n.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 'var(--sp-3) var(--sp-4)', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', textAlign: 'left' }}>
              <Icon name={n.icon} size={18} style={{ color: 'var(--brand)' }} />
              <span style={{ flex: 1, fontWeight: 500 }}>{n.label}</span>
              <Icon name="chevron" size={14} style={{ color: 'var(--text-muted)' }} />
            </button>
          ))}
        </div>
      </section>

      <Row title="Appearance" desc={`Currently ${theme === 'dark' ? 'dark' : 'light'} mode`}>
        <button className="btn btn-ghost" onClick={onToggleTheme}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /> Switch to {theme === 'dark' ? 'light' : 'dark'}
        </button>
      </Row>

      <Row title="Critical alerts" desc="Toast notifications when a bin hits 80% effective fill">
        <Toggle on={alertsOn} onChange={setAlertsOn} />
      </Row>

      <Row title="System notifications" desc={
        notifPerm === 'granted' ? 'Enabled — you’ll get push alerts even when the tab is idle' :
        notifPerm === 'denied' ? 'Blocked in your browser settings' :
        notifPerm === 'unsupported' ? 'Not supported in this browser' :
        'Turn on to receive push notifications from the browser'
      }>
        {notifPerm === 'default' && <button className="btn btn-primary" onClick={askNotif}>Enable</button>}
        {notifPerm === 'granted' && <span className="chip" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)' }}>On</span>}
      </Row>

      <Row title="Critical threshold" desc="Effective fill % that marks a bin as critical">
        <input className="input" type="number" value={threshold} onChange={(e) => setThreshold(+e.target.value)} min={0} max={100} style={{ width: 100 }} />
      </Row>

      {canInstall && (
        <Row title="Install app" desc="Add SmartBin to your home screen for a native app experience">
          <button className="btn btn-primary" onClick={onInstall}>
            <Icon name="install" size={16} /> Install
          </button>
        </Row>
      )}

      {user && (
        <Row title="Signed in as" desc={`${user.username} · ${user.role}`}>
          <button className="btn btn-ghost" onClick={onLogout}>Sign out</button>
        </Row>
      )}

      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.78rem', padding: 'var(--sp-4)' }}>
        SmartBin · v0.3 — <span style={{ color: 'var(--brand)' }}>◆</span>
      </div>
    </div>
  )
}

function Row({ title, desc, children }) {
  return (
    <div className="card" style={{ padding: 'var(--sp-4) var(--sp-5)', display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 600, fontSize: '.95rem' }}>{title}</div>
        <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
      </div>
      {children}
    </div>
  )
}

function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 44, height: 26, borderRadius: 999,
        background: on ? 'var(--brand)' : 'var(--border-strong)',
        position: 'relative', transition: 'background .2s',
      }}
      aria-pressed={on}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3,
        width: 20, height: 20, borderRadius: '50%',
        background: 'white', transition: 'left .2s',
        boxShadow: '0 1px 3px rgba(0,0,0,.3)',
      }} />
    </button>
  )
}
