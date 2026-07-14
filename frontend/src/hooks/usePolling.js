import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'

export function usePolling(endpoint, intervalMs = 5000) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const failuresRef = useRef(0)
  const timerRef = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      const json = await api.get(endpoint)
      setData(json); setError(null); setLastUpdated(new Date())
      failuresRef.current = 0
    } catch (err) {
      failuresRef.current += 1
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  useEffect(() => {
    let stopped = false
    const tick = async () => {
      if (stopped) return
      if (!navigator.onLine) {
        timerRef.current = setTimeout(tick, intervalMs)
        return
      }
      await fetchData()
      const backoff = Math.min(intervalMs * Math.pow(2, failuresRef.current), 60_000)
      const next = failuresRef.current > 0 ? backoff : intervalMs
      timerRef.current = setTimeout(tick, next)
    }
    tick()
    const onOnline = () => { clearTimeout(timerRef.current); tick() }
    window.addEventListener('online', onOnline)
    return () => {
      stopped = true
      clearTimeout(timerRef.current)
      window.removeEventListener('online', onOnline)
    }
  }, [fetchData, intervalMs])

  return { data, error, loading, lastUpdated, refetch: fetchData }
}
