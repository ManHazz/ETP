import { useEffect } from 'react'
import { useIsDesktop } from '../hooks/useMediaQuery'
import Icon from './Icon'

export default function Sheet({ open, onClose, title, children, actions }) {
  const desktop = useIsDesktop()
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet ${desktop ? 'sheet-desktop' : 'sheet-mobile'}`} role="dialog" aria-modal="true">
        {!desktop && <div className="sheet-handle" />}
        <div className="sheet-header">
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{title}</div>
          <button className="btn-icon" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {actions && <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderTop: '1px solid var(--border)', display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>{actions}</div>}
      </div>
    </>
  )
}
