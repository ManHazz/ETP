import { useCallback, useEffect, useState } from 'react'
import {
  clearSession, getUser,
  login as apiLogin, register as apiRegister, googleLogin as apiGoogle,
} from '../api'

export function useAuth() {
  const [user, setUser] = useState(getUser)

  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [])

  const login = useCallback(async (u, p) => {
    const data = await apiLogin(u, p)
    setUser({
      username: data.username, role: data.role, email: data.email,
      full_name: data.full_name, avatar_url: data.avatar_url,
      auth_provider: data.auth_provider,
    })
    return data
  }, [])

  const register = useCallback(async (payload) => {
    const data = await apiRegister(payload)
    setUser({
      username: data.username, role: data.role, email: data.email,
      full_name: data.full_name, avatar_url: data.avatar_url,
      auth_provider: data.auth_provider,
    })
    return data
  }, [])

  const googleLogin = useCallback(async (credential) => {
    const data = await apiGoogle(credential)
    setUser({
      username: data.username, role: data.role, email: data.email,
      full_name: data.full_name, avatar_url: data.avatar_url,
      auth_provider: data.auth_provider,
    })
    return data
  }, [])

  const logout = useCallback(() => { clearSession(); setUser(null) }, [])

  return { user, login, register, googleLogin, logout }
}
