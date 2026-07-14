import { useEffect, useRef } from 'react'
import { useTheme } from '../hooks/useTheme'

/*
 * Renders the official "Sign in with Google" button from Google Identity
 * Services. GIS handles the button visuals for us — passing a callback that
 * receives an ID token which we forward to the backend.
 *
 * The GIS script is loaded from index.html. If it hasn't finished loading
 * yet, we poll for a moment.
 */
export default function GoogleButton({ clientId, onCredential, onError }) {
  const holder = useRef(null)
  const { theme } = useTheme()

  useEffect(() => {
    if (!clientId || !holder.current) return
    let cancelled = false
    let poll = null

    const render = () => {
      if (cancelled || !window.google?.accounts?.id || !holder.current) return
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => {
            if (resp?.credential) onCredential(resp.credential)
            else if (resp?.error) onError?.(resp.error)
          },
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
        })
        holder.current.innerHTML = ''
        window.google.accounts.id.renderButton(holder.current, {
          type: 'standard',
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: 360,
        })
      } catch (err) {
        onError?.(err.message || 'Google button failed to render')
      }
    }

    if (window.google?.accounts?.id) {
      render()
    } else {
      const t0 = Date.now()
      poll = setInterval(() => {
        if (window.google?.accounts?.id) { clearInterval(poll); render() }
        else if (Date.now() - t0 > 6000) { clearInterval(poll); onError?.('Google sign-in unavailable') }
      }, 120)
    }

    return () => { cancelled = true; if (poll) clearInterval(poll) }
  }, [clientId, theme, onCredential, onError])

  return <div className="google-btn-wrap" ref={holder} />
}
