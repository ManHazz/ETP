import { useState, useEffect, useRef, useCallback } from 'react'
export function usePolling(endpoint, intervalMs = 5000) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const ref = useRef(null)
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api${endpoint}`)
      if (!res.ok) throw new Error(`${res.status}`)
      const json = await res.json()
      setData(json); setError(null); setLastUpdated(new Date())
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [endpoint])
  useEffect(() => { fetchData(); ref.current = setInterval(fetchData, intervalMs); return () => clearInterval(ref.current) }, [fetchData, intervalMs])
  return { data, error, loading, lastUpdated, refetch: fetchData }
}
