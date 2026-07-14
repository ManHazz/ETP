import Icon from './Icon'

export default function Topbar({
  search, setSearch, showSearch,
  lastUpdated, error, online,
  theme, onToggleTheme,
  canInstall, onInstall, onRefresh,
}) {
  return (
    <header className="shell-topbar topbar">
      <div className="topbar-brand-mobile">
        <div className="topbar-brand-mark"><Icon name="bins" size={16} /></div>
        SmartBin
      </div>
      {showSearch && (
        <div className="search">
          <Icon name="search" size={16} className="search-icon" />
          <input
            className="input"
            type="search"
            placeholder="Search bins by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--r-full)', background: 'var(--bg-sunken)', fontSize: '.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: !online || error ? 'var(--danger)' : 'var(--success)',
            animation: !online || error ? 'none' : 'pulse 2s ease-in-out infinite',
          }} />
          <span className="hide-mobile" style={{ display: 'none' }}>
            {!online ? 'Offline' : error ? 'Reconnecting…' : lastUpdated ? `Live · ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Connecting…'}
          </span>
          <span>{!online ? 'Offline' : error ? 'Reconnect' : 'Live'}</span>
        </div>
        <button className="btn-icon" onClick={onRefresh} aria-label="Refresh"><Icon name="refresh" size={18} /></button>
        {canInstall && (
          <button className="btn btn-ghost" onClick={onInstall} style={{ padding: '6px 12px', fontSize: '.78rem' }}>
            <Icon name="install" size={16} /> <span style={{ display: 'none' }}>Install</span>
          </button>
        )}
        <button className="btn-icon" onClick={onToggleTheme} aria-label="Toggle theme">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
      </div>
    </header>
  )
}
