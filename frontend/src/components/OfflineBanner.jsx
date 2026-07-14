export default function OfflineBanner({ online }) {
  if (online) return null
  return <div className="offline-banner">You’re offline — showing last-known data</div>
}
