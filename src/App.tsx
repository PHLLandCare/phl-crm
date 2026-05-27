import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import Dashboard from './pages/Dashboard'

type AuthState = 'loading' | 'unauthenticated' | 'must_change_password' | 'authenticated'

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('loading')

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { setAuthState('unauthenticated'); return }
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('must_change_password')
          .eq('id', session.user.id)
          .single()
        if (profile?.must_change_password) {
          setAuthState('must_change_password')
        } else {
          setAuthState('authenticated')
        }
      } catch {
        setAuthState('unauthenticated')
      }
    }
    checkSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session) { setAuthState('unauthenticated'); return }
      if (event === 'PASSWORD_RECOVERY') { setAuthState('must_change_password'); return }
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('must_change_password')
          .eq('id', session.user.id)
          .single()
        if (profile?.must_change_password) {
          setAuthState('must_change_password')
        } else {
          setAuthState('authenticated')
        }
      } catch {
        setAuthState('authenticated')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  if (authState === 'loading') return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f0fdf4'}}><div style={{width:40,height:40,border:'4px solid #bbf7d0',borderTop:'4px solid #16a34a',borderRadius:'50%',animation:'spin 1s linear infinite'}} /></div>
  if (authState === 'unauthenticated') return <LoginPage />
  if (authState === 'must_change_password') return <ChangePasswordPage />
  if (authState === 'authenticated') return <Dashboard />
  return <LoginPage />
}