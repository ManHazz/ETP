import Icon from './Icon'

export const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Home',        icon: 'dashboard'   },
  { id: 'bins',        label: 'Bins',        icon: 'bins'        },
  { id: 'map',         label: 'Map',         icon: 'map'         },
  { id: 'route',       label: 'Route',       icon: 'route'       },
  { id: 'analytics',   label: 'Stats',       icon: 'analytics'   },
  { id: 'collections', label: 'Pickups',     icon: 'collections' },
  { id: 'anomalies',   label: 'Issues',      icon: 'warn'        },
  { id: 'admin',       label: 'Admin',       icon: 'admin', role: 'admin' },
  { id: 'settings',    label: 'Settings',    icon: 'settings'    },
]

export default function Sidebar({ route, onNavigate, user, onLogout }) {
  const items = NAV_ITEMS.filter((n) => !n.role || user?.role === n.role)
  return (
    <aside className="shell-sidebar sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark"><Icon name="bins" size={18} /></div>
        <div>
          <div>SmartBin</div>
          <div style={{ fontSize: '.68rem', fontWeight: 500, color: 'var(--text-muted)' }}>Smart bin control</div>
        </div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((it) => (
          <a key={it.id}
            className={`nav-item ${route === it.id ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); onNavigate(it.id) }}
            href={`#/${it.id}`}>
            <Icon name={it.icon} size={18} className="nav-icon" />
            <span>{it.label}</span>
          </a>
        ))}
      </nav>
      <div style={{ marginTop: 'auto', padding: 'var(--sp-3)', borderTop: '1px solid var(--border)' }}>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" width={32} height={32}
                style={{ borderRadius: '50%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--grad-brand)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.9rem' }}>
                {(user.full_name || user.username)[0].toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.full_name || user.username}</div>
              <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user.role}{user.auth_provider === 'google' ? ' · google' : ''}</div>
            </div>
            <button className="btn-icon" onClick={onLogout} aria-label="Sign out" title="Sign out">
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>v0.3 · <span style={{ color: 'var(--brand)' }}>◆</span> Live</div>
      </div>
    </aside>
  )
}
