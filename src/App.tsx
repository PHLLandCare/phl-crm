import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import Dashboard from './pages/Dashboard'

type AuthState = 'unauthenticated' | 'must_change_password' | 'authenticated'

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('unauthenticated')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setAuthState('authenticated')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuthState('authenticated')
      } else {
        setAuthState('unauthenticated')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  if (authState === 'unauthenticated') return <LoginPage />
  if (authState === 'must_change_password') return <ChangePasswordPage />
  return <Dashboard />
}