export function getStatus(fill) {
  if (fill == null) return { level: 'offline', color: 'var(--text-muted)', label: 'No data' }
  if (fill >= 80) return { level: 'critical', color: 'var(--red)', label: 'Critical' }
  if (fill >= 50) return { level: 'warning', color: 'var(--amber)', label: 'Warning' }
  return { level: 'normal', color: 'var(--green)', label: 'Normal' }
}
export function timeAgo(d) {
  if (!d) return 'never'
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
