import { useState, useEffect, useRef, useCallback } from 'react'

const API_BASE = '/api'

export function usePolling(endpoint, intervalMs = 5000) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const intervalRef = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const json = await res.json()
      setData(json)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  useEffect(() => {
    fetchData()
    intervalRef.current = setInterval(fetchData, intervalMs)
    return () => clearInterval(intervalRef.current)
  }, [fetchData, intervalMs])

  return { data, error, loading, lastUpdated, refetch: fetchData }
}
