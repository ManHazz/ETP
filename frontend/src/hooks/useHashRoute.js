import { useCallback, useEffect, useState } from 'react'

function read() {
  const h = window.location.hash.replace(/^#\/?/, '')
  return h || 'dashboard'
}

export function useHashRoute() {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const navigate = useCallback((to) => {
    window.location.hash = `#/${to}`
  }, [])
  return { route, navigate }
}
