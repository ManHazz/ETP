export default function Sparkline({ points, color = 'var(--brand)', width = 80, height = 24, strokeWidth = 1.5, fill = true }) {
  if (!points || points.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...points), max = Math.max(...points)
  const range = max - min || 1
  const stepX = width / (points.length - 1)
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(' ')
  const area = fill ? `${path} L${width},${height} L0,${height} Z` : null
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {area && <path d={area} fill={color} opacity=".14" />}
      <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
