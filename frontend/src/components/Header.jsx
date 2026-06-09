const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 'var(--space-sm)',
  },
  titleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
  },
  title: {
    fontSize: 'clamp(1.2rem, 4vw, 1.5rem)',
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  live: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    animation: 'pulse 2s ease-in-out infinite',
  },
}

export default function Header({ lastUpdated, error }) {
  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <span style={styles.title}>SmartBin</span>
        </div>
        <div style={styles.live}>
          <span
            style={{
              ...styles.dot,
              backgroundColor: error ? 'var(--red)' : 'var(--green)',
              animation: error ? 'none' : styles.dot.animation,
            }}
          />
          {error
            ? `Connection lost`
            : lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : 'Connecting…'}
        </div>
      </div>
    </>
  )
}
