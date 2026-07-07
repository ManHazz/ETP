import { useState } from 'react'
import { usePolling } from './hooks/usePolling'
import Header from './components/Header'
import SummaryBar from './components/SummaryBar'
import BinCard from './components/BinCard'
import MapView from './components/MapView'
import RouteView from './components/RouteView'
import AlertToasts from './components/AlertToasts'

const sorts = {
  fill: (a, b) => (b.effective_fill ?? -1) - (a.effective_fill ?? -1),
  name: (a, b) => a.label.localeCompare(b.label),
  recent: (a, b) => new Date(b.last_reading_at || 0) - new Date(a.last_reading_at || 0),
}

function Btn({ active, children, ...p }) {
  return <button {...p} style={{ fontFamily: 'var(--font-ui)', fontSize: '.8rem', fontWeight: 500, padding: '6px 14px', borderRadius: 99, border: '1px solid', cursor: 'pointer', transition: 'all .15s', background: active ? 'var(--bg-raised)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', borderColor: active ? 'var(--blue)' : 'var(--border)' }}>{children}</button>
}

export default function App() {
  const { data: bins, error, loading, lastUpdated } = usePolling('/status', 5000)
  const [sort, setSort] = useState('fill')
  const [view, setView] = useState('grid')
  const sorted = bins ? [...bins].sort(sorts[sort]) : []
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', minHeight: '100dvh' }}>
      <AlertToasts bins={bins} />
      <Header lastUpdated={lastUpdated} error={error} />
      <SummaryBar bins={bins} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <Btn active={view === 'grid'} onClick={() => setView('grid')}>Grid</Btn>
          <Btn active={view === 'map'} onClick={() => setView('map')}>Map</Btn>
          <Btn active={view === 'route'} onClick={() => setView('route')}>Route</Btn>
        </div>
        {view === 'grid' && <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>{Object.keys(sorts).map(k => <Btn key={k} active={sort === k} onClick={() => setSort(k)}>{k === 'fill' ? 'By fill' : k === 'name' ? 'By name' : 'By recent'}</Btn>)}</div>}
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 'var(--space-2xl)', color: 'var(--text-muted)' }}>Loading bins…</div>
        : sorted.length === 0 ? <div style={{ textAlign: 'center', padding: 'var(--space-2xl)', color: 'var(--text-muted)' }}>No bins registered yet.</div>
        : view === 'map' ? <MapView bins={sorted} />
        : view === 'route' ? <RouteView />
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,320px),1fr))', gap: 'var(--space-md)' }}>{sorted.map(b => <BinCard key={b.id} bin={b} />)}</div>}
    </div>
  )
}
