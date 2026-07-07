import { useState } from 'react'
export default function Tooltip({ text, children }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', cursor: 'help' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onTouchStart={() => setShow(s => !s)}>
      {children}
      {show && <span style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', zIndex: 50, pointerEvents: 'none' }}>{text}</span>}
    </span>
  )
}
