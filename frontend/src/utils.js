export function getStatus(fill) {
  if (fill == null) return { level: 'offline', color: 'var(--status-offline)', label: 'No data', tone: 'muted' }
  if (fill >= 80) return { level: 'critical', color: 'var(--status-critical)', label: 'Critical', tone: 'danger' }
  if (fill >= 50) return { level: 'warning', color: 'var(--status-warning)', label: 'Warning', tone: 'warning' }
  return { level: 'normal', color: 'var(--status-normal)', label: 'Normal', tone: 'success' }
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

export function fmtNum(v, digits = 0, suffix = '') {
  if (v == null) return '—'
  return `${(+v).toFixed(digits)}${suffix}`
}

export function batteryLevel(v) {
  if (v == null) return null
  if (v >= 3.5) return 'full'
  if (v >= 3.1) return 'ok'
  if (v >= 2.8) return 'low'
  return 'critical'
}
