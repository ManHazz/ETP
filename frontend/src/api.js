/*
 * Thin API client — attaches JWT to every /api/ request and normalizes errors.
 * All views should go through this so the auth token is always fresh.
 */

const TOKEN_KEY = 'smartbin-token'
const USER_KEY = 'smartbin-user'

export function getToken() { return localStorage.getItem(TOKEN_KEY) }
export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') } catch { return null }
}
export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

async function _fetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) }
  const token = getToken()
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`
  if (opts.body && !headers['Content-Type'] && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`/api${path}`, { ...opts, headers })
  if (res.status === 401) {
    clearSession()
    window.dispatchEvent(new Event('auth:expired'))
    throw new ApiError(401, 'Session expired')
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try { const j = await res.json(); message = j.detail || j.message || message } catch {}
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return null
  return res.json()
}

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

export const api = {
  get:    (p) => _fetch(p),
  post:   (p, body) => _fetch(p, { method: 'POST', body: JSON.stringify(body) }),
  put:    (p, body) => _fetch(p, { method: 'PUT',  body: JSON.stringify(body) }),
  del:    (p) => _fetch(p, { method: 'DELETE' }),
  upload: (p, form) => _fetch(p, { method: 'POST', body: form }),
}

function _sessionFromLoginResponse(data) {
  return {
    username: data.username,
    role: data.role,
    email: data.email || null,
    full_name: data.full_name || null,
    avatar_url: data.avatar_url || null,
    auth_provider: data.auth_provider || 'local',
  }
}

export async function login(usernameOrEmail, password) {
  const form = new URLSearchParams({ username: usernameOrEmail, password })
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  if (!res.ok) {
    let message = 'Invalid credentials'
    try { const j = await res.json(); message = j.detail || message } catch {}
    throw new ApiError(res.status, message)
  }
  const data = await res.json()
  setSession(data.access_token, _sessionFromLoginResponse(data))
  return data
}

export async function register({ email, password, full_name }) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name: full_name || null }),
  })
  if (!res.ok) {
    let message = 'Registration failed'
    try { const j = await res.json(); message = j.detail || message } catch {}
    throw new ApiError(res.status, message)
  }
  const data = await res.json()
  setSession(data.access_token, _sessionFromLoginResponse(data))
  return data
}

export async function googleLogin(credential) {
  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
  if (!res.ok) {
    let message = 'Google sign-in failed'
    try { const j = await res.json(); message = j.detail || message } catch {}
    throw new ApiError(res.status, message)
  }
  const data = await res.json()
  setSession(data.access_token, _sessionFromLoginResponse(data))
  return data
}

export async function fetchAuthConfig() {
  const res = await fetch('/api/auth/config')
  if (!res.ok) return { google_enabled: false, allow_registration: true }
  return res.json()
}

export const roles = {
  isAdmin: (u) => u?.role === 'admin',
  isDriver: (u) => u?.role === 'driver' || u?.role === 'admin',
  isViewer: (u) => !!u,
}
