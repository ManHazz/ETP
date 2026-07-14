import Icon from './Icon'

const MOBILE_NAV = [
  { id: 'dashboard', label: 'Home', icon: 'dashboard' },
  { id: 'bins', label: 'Bins', icon: 'bins' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'route', label: 'Route', icon: 'route' },
  { id: 'settings', label: 'More', icon: 'more' },
]

export default function BottomNav({ route, onNavigate }) {
  return (
    <nav className="bottomnav">
      {MOBILE_NAV.map((it) => (
        <button
          key={it.id}
          className={`bottomnav-item ${route === it.id ? 'active' : ''}`}
          onClick={() => onNavigate(it.id)}
        >
          <Icon name={it.icon} size={22} className="nav-icon" />
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  )
}
