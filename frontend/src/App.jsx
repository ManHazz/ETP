import { useState } from 'react'
import { usePolling } from './hooks/usePolling'
import Header from './components/Header'
import SummaryBar from './components/SummaryBar'
import BinCard from './components/BinCard'
import MapView from './components/MapView'
import AlertToasts from './components/AlertToasts'

const sortOptions = {
  fill: (a, b) => (b.effective_fill ?? -1) - (a.effective_fill ?? -1),
  name: (a, b) => a.label.localeCompare(b.label),
  recent: (a, b) => new Date(b.last_reading_at || 0) - new Date(a.last_reading_at || 0),
}

const styles = {
  shell: {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: 'var(--space-lg)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xl)',
    minHeight: '100dvh',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 'var(--space-sm)',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
  },
  btn: {
    fontFamily: 'var(--font-ui)',
    fontSize: '0.8rem',
    fontWeight: 500,
    padding: '6px 14px',
    borderRadius: '99px',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
    gap: 'var(--space-md)',
  },
  empty: {
    textAlign: 'center',
    padding: 'var(--space-2xl)',
    color: 'var(--text-muted)',
  },
}

function btnStyle(active) {
  return {
    ...styles.btn,
    background: active ? 'var(--bg-raised)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    borderColor: active ? 'var(--blue)' : 'var(--border)',
  }
}

export default function App() {
  const { data: bins, error, loading, lastUpdated } = usePolling('/status', 5000)
  const [sort, setSort] = useState('fill')
  const [view, setView] = useState('grid') // 'grid' | 'map'

  const sorted = bins ? [...bins].sort(sortOptions[sort]) : []

  return (
    <div style={styles.shell}>
      <AlertToasts bins={bins} />
      <Header lastUpdated={lastUpdated} error={error} />
      <SummaryBar bins={bins} />

      {/* Toolbar: view toggle + sort */}
      <div style={styles.toolbar}>
        <div style={styles.controls}>
          <button style={btnStyle(view === 'grid')} onClick={() => setView('grid')}>
            Grid
          </button>
          <button style={btnStyle(view === 'map')} onClick={() => setView('map')}>
            Map
          </button>
        </div>

        {view === 'grid' && (
          <div style={styles.controls}>
            {Object.keys(sortOptions).map(key => (
              <button
                key={key}
                onClick={() => setSort(key)}
                style={btnStyle(sort === key)}
              >
                {key === 'fill' ? 'By fill' : key === 'name' ? 'By name' : 'By recent'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={styles.empty}>Loading bins…</div>
      ) : sorted.length === 0 ? (
        <div style={styles.empty}>No bins registered yet. Run the simulator to get started.</div>
      ) : view === 'map' ? (
        <MapView bins={sorted} />
      ) : (
        <div style={styles.grid}>
          {sorted.map(bin => (
            <BinCard key={bin.id} bin={bin} />
          ))}
        </div>
      )}
    </div>
  )
}
