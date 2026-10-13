import { useEffect } from 'react'
import { useStore } from '../store'
import { fetchMe, AUTH_DEMO } from '../lib/auth'

const GOOGLE_ERR: Record<string, string> = {
  google_denied: 'Google sign-in was cancelled.',
  invalid_state: 'Sign-in link expired. Please try again.',
  email_not_verified: 'Your Google email isn’t verified.',
}

/** On load: restore the session (live backend) and surface any error returned by the Google redirect. */
export function useAuthBoot() {
  useEffect(() => {
    const url = new URL(location.href)
    const err = url.searchParams.get('auth_error')
    if (err) {
      useStore.getState().toast(GOOGLE_ERR[err] ?? 'Google sign-in failed. Please try again.', 'ember')
      url.searchParams.delete('auth_error')
      history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    if (AUTH_DEMO) return
    fetchMe().then((a) => {
      const s = useStore.getState()
      if (a) s.setAccount(a)
      else if (s.account) s.setAccount(null) // cookie gone → drop stale local copy
    })
  }, [])
}
