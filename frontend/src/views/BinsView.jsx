import { useMemo, useState } from 'react'
import BinCard from '../components/BinCard'
import Icon from '../components/Icon'
import EmptyState from '../components/EmptyState'
import { SkeletonGrid } from '../components/Skeleton'
import { getStatus } from '../utils'

const sorts = {
  fill:   (a, b) => (b.effective_fill ?? -1) - (a.effective_fill ?? -1),
  name:   (a, b) => a.label.localeCompare(b.label),
  recent: (a, b) => new Date(b.last_reading_at || 0) - new Date(a.last_reading_at || 0),
}

const FILTERS = ['all', 'critical', 'warning', 'normal', 'offline']

export default function BinsView({ bins, loading, search, onOpenBin }) {
  const [sort, setSort] = useState('fill')
  const [filter, setFilter] = useState('all')

  const visible = useMemo(() => {
    if (!bins) return []
    let list = [...bins]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((b) => b.label.toLowerCase().includes(q))
    }
    if (filter !== 'all') {
      list = list.filter((b) => getStatus(b.effective_fill).level === filter)
    }
    return list.sort(sorts[sort])
  }, [bins, sort, filter, search])

  if (loading) return <SkeletonGrid />

  return (
    <div className="stack">
      <div>
        <div className="page-title">Bins</div>
        <div className="page-subtitle">{visible.length} of {bins?.length || 0} bins</div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="segmented">
          {FILTERS.map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
          <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Sort</span>
          <div className="segmented">
            <button className={sort === 'fill' ? 'active' : ''} onClick={() => setSort('fill')}>Fill</button>
            <button className={sort === 'name' ? 'active' : ''} onClick={() => setSort('name')}>Name</button>
            <button className={sort === 'recent' ? 'active' : ''} onClick={() => setSort('recent')}>Recent</button>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="search" title="No bins match" message="Try adjusting the search or filters." />
      ) : (
        <div className="grid-cards">
          {visible.map((b) => <BinCard key={b.id} bin={b} onOpen={onOpenBin} />)}
        </div>
      )}
    </div>
  )
}
