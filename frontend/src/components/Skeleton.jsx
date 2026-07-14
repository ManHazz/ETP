export function SkeletonCard() {
  return (
    <div className="card" style={{ padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="skeleton" style={{ height: 18, width: '60%' }} />
      <div className="skeleton" style={{ height: 40, width: '40%' }} />
      <div className="skeleton" style={{ height: 6 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <div className="skeleton" style={{ height: 32 }} />
        <div className="skeleton" style={{ height: 32 }} />
        <div className="skeleton" style={{ height: 32 }} />
      </div>
    </div>
  )
}

export function SkeletonGrid({ n = 6 }) {
  return (
    <div className="grid-cards">
      {Array.from({ length: n }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}
