import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon'
import GoogleButton from '../components/GoogleButton'
import { fetchAuthConfig } from '../api'

const FEATURES = [
  { icon: 'route',       title: 'Smart pickups',   desc: 'Groups bins together so pickup trips are never wasted.' },
  { icon: 'analytics',   title: 'Smart forecast',  desc: 'Uses weather, history, and events to predict when bins fill up.' },
  { icon: 'warn',        title: 'Instant alerts',  desc: 'Broken sensors, moved bins, or bad smells show up right away.' },
]

export default function LoginView({ onLogin, onRegister, onGoogle }) {
  const [mode, setMode] = useState('login')   // 'login' | 'register'
  const [config, setConfig] = useState({ google_enabled: false, allow_registration: true })

  useEffect(() => { fetchAuthConfig().then(setConfig).catch(() => {}) }, [])

  return (
    <div className="auth-shell">
      <HeroPanel />
      <div className="auth-form-col">
        <div className="auth-form-card">
          <div className="auth-form-brand-mobile">
            <div className="topbar-brand-mark"><Icon name="bins" size={16} /></div>
            SmartBin
          </div>

          {config.allow_registration && (
            <div className="auth-tabs" role="tablist">
              <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} role="tab" aria-selected={mode === 'login'}>Sign in</button>
              <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')} role="tab" aria-selected={mode === 'register'}>Create account</button>
            </div>
          )}

          {mode === 'login'
            ? <LoginForm onLogin={onLogin} config={config} onGoogle={onGoogle} />
            : <RegisterForm onRegister={onRegister} config={config} onGoogle={onGoogle} onSwitchToLogin={() => setMode('login')} />
          }

          <div className="auth-fine">
            By continuing you agree to the <a href="#/settings">terms</a> and <a href="#/settings">privacy notice</a>.
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── Hero ──────────────────────────────────────────────────

function HeroPanel() {
  return (
    <aside className="auth-hero">
      <div className="auth-hero-brand">
        <div className="auth-hero-brand-mark"><Icon name="bins" size={20} /></div>
        <div>SmartBin</div>
      </div>

      <div className="auth-hero-body">
        <div className="auth-hero-title">Smarter bin pickups, less wasted trips.</div>
        <div className="auth-hero-sub">
          Live bin fill levels, smart forecasts using weather and history, and a helper
          that tells you when a pickup is worth doing — save time, fuel, and effort.
        </div>

        <div className="auth-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="auth-feature">
              <div className="auth-feature-icon"><Icon name={f.icon} size={16} /></div>
              <div className="auth-feature-text"><b>{f.title}</b><span>{f.desc}</span></div>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-hero-footer">
        Self-hosted · open-source stack · v0.4
      </div>
    </aside>
  )
}


// ─── Login form ────────────────────────────────────────────

function LoginForm({ onLogin, config, onGoogle }) {
  const [ident, setIdent] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { await onLogin(ident.trim(), password) }
    catch (err) { setError(err.message || 'Login failed') }
    finally { setBusy(false) }
  }

  const handleGoogle = async (credential) => {
    setBusy(true); setError('')
    try { await onGoogle(credential) }
    catch (err) { setError(err.message || 'Google sign-in failed') }
    finally { setBusy(false) }
  }

  return (
    <>
      <div className="auth-heading">
        <h1>Welcome back</h1>
        <p>Sign in to continue to your SmartBin console.</p>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <Field label="Email or username">
          <div className="auth-input-wrap">
            <Icon name="admin" size={16} className="icon-lead" />
            <input className="input" value={ident} onChange={(e) => setIdent(e.target.value)}
              autoComplete="username" required autoFocus placeholder="you@example.com" />
          </div>
        </Field>

        <Field label="Password">
          <div className="auth-input-wrap has-trail">
            <Icon name="settings" size={16} className="icon-lead" />
            <input className="input" type={showPw ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required placeholder="••••••••" />
            <button type="button" className="icon-trail" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'}>
              <Icon name={showPw ? 'close' : 'check'} size={14} />
            </button>
          </div>
        </Field>

        {error && <div className="auth-error"><Icon name="warn" size={16} /> {error}</div>}

        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {config.google_enabled && (
        <>
          <div className="auth-divider">or</div>
          <GoogleButton
            clientId={config.google_client_id}
            onCredential={handleGoogle}
            onError={(msg) => setError(msg)}
          />
        </>
      )}

      <div className="auth-meta">
        Default admin: <code style={{ fontFamily: 'var(--font-mono)' }}>smartbin</code> / <code style={{ fontFamily: 'var(--font-mono)' }}>smartbin</code>
      </div>
    </>
  )
}


// ─── Register form ─────────────────────────────────────────

function RegisterForm({ onRegister, config, onGoogle, onSwitchToLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const strength = useMemo(() => scorePassword(password), [password])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (strength.score < 2) { setError('Password is too weak — mix letters, numbers and symbols.'); return }
    setBusy(true)
    try {
      await onRegister({ email: email.trim().toLowerCase(), password, full_name: fullName.trim() || null })
    } catch (err) { setError(err.message || 'Registration failed') }
    finally { setBusy(false) }
  }

  const handleGoogle = async (credential) => {
    setBusy(true); setError('')
    try { await onGoogle(credential) }
    catch (err) { setError(err.message || 'Google sign-in failed') }
    finally { setBusy(false) }
  }

  return (
    <>
      <div className="auth-heading">
        <h1>Create your account</h1>
        <p>New accounts start as viewers — an admin can promote you later.</p>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <Field label="Full name (optional)">
          <div className="auth-input-wrap">
            <Icon name="admin" size={16} className="icon-lead" />
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)}
              autoComplete="name" placeholder="Jane Driver" />
          </div>
        </Field>

        <Field label="Work email">
          <div className="auth-input-wrap">
            <Icon name="bell" size={16} className="icon-lead" />
            <input className="input" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="you@company.com" />
          </div>
        </Field>

        <Field label="Password">
          <div className="auth-input-wrap has-trail">
            <Icon name="settings" size={16} className="icon-lead" />
            <input className="input" type={showPw ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
              required minLength={8} placeholder="At least 8 characters" />
            <button type="button" className="icon-trail" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'}>
              <Icon name={showPw ? 'close' : 'check'} size={14} />
            </button>
          </div>
          {password && (
            <>
              <div className="auth-strength">
                <span style={{ width: `${(strength.score / 4) * 100}%`, background: strength.color }} />
              </div>
              <div className="auth-strength-label">
                <span>Strength</span>
                <span style={{ color: strength.color, fontWeight: 600 }}>{strength.label}</span>
              </div>
            </>
          )}
        </Field>

        <Field label="Confirm password">
          <div className="auth-input-wrap">
            <Icon name="check" size={16} className="icon-lead" />
            <input className="input" type={showPw ? 'text' : 'password'} value={confirm}
              onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required placeholder="Re-enter password" />
          </div>
        </Field>

        {error && <div className="auth-error"><Icon name="warn" size={16} /> {error}</div>}

        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      {config.google_enabled && (
        <>
          <div className="auth-divider">or</div>
          <GoogleButton
            clientId={config.google_client_id}
            onCredential={handleGoogle}
            onError={(msg) => setError(msg)}
          />
        </>
      )}

      <div className="auth-meta">
        Already have an account? <button type="button" onClick={onSwitchToLogin}>Sign in</button>
      </div>
    </>
  )
}


// ─── Bits ──────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <label className="auth-field">
      <span className="auth-field-label">{label}</span>
      {children}
    </label>
  )
}

function scorePassword(pw) {
  if (!pw) return { score: 0, label: '', color: 'var(--text-muted)' }
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw) && /[^\w\s]/.test(pw)) s++
  const labels = ['Too weak', 'Weak', 'Fair', 'Strong', 'Excellent']
  const colors = ['var(--danger)', 'var(--danger)', 'var(--warning)', 'var(--success)', 'var(--brand)']
  return { score: s, label: labels[s], color: colors[s] }
}
