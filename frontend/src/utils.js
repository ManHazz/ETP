export function getStatus(effectiveFill) {
  if (effectiveFill == null) return { level: 'offline', color: 'var(--text-muted)', label: 'No data' }
  if (effectiveFill >= 80) return { level: 'critical', color: 'var(--red)', label: 'Critical' }
  if (effectiveFill >= 50) return { level: 'warning', color: 'var(--amber)', label: 'Warning' }
  return { level: 'normal', color: 'var(--green)', label: 'Normal' }
}

export function timeAgo(dateStr) {
  if (!dateStr) return 'never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
