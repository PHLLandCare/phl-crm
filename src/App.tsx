import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import Dashboard from './pages/Dashboard'
import ClockInPage from './pages/ClockInPage'
import EmployeePortalPage from './pages/EmployeePortalPage'

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

  // ClockIn is public — no auth required
  if (window.location.hash.includes('/clockin')) {
    return (
      <HashRouter>
        <Routes>
          <Route path="/clockin" element={<ClockInPage />} />
          <Route path="/employee" element={<EmployeePortalPage />} />
        </Routes>
      </HashRouter>
    )
  }

  if (authState === 'unauthenticated') return <LoginPage />
  if (authState === 'must_change_password') return <ChangePasswordPage />

  return (
    <HashRouter>
      <Routes>
        <Route path="/clockin" element={<ClockInPage />} />
        <Route path="/*" element={<Dashboard />} />
      </Routes>
    </HashRouter>
  )
}
