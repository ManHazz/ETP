import Icon from './Icon'

export default function EmptyState({ icon = 'bins', title, message, action }) {
  return (
    <div style={{ textAlign: 'center', padding: 'var(--sp-12) var(--sp-4)', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--grad-brand-soft)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={28} />
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {message && <div style={{ maxWidth: 380, fontSize: '.88rem' }}>{message}</div>}
      {action}
    </div>
  )
}
