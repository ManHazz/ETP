export default function Header({ lastUpdated, error }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
      <span style={{ fontSize: 'clamp(1.2rem,4vw,1.5rem)', fontWeight: 700, letterSpacing: '-0.02em' }}>SmartBin</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: error ? 'var(--red)' : 'var(--green)', animation: error ? 'none' : 'pulse 2s ease-in-out infinite' }} />
        {error ? 'Connection lost' : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Connecting…'}
      </div>
    </div>
  )
}
