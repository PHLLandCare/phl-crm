import { useEffect, useState, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './lib/supabase'

// Lazy-loaded so each entry point (kiosk, employee portal, login, full
// dashboard) only downloads its own code instead of everyone downloading
// the entire app — meaningfully smaller/faster first load on every device.
const LoginPage = lazy(() => import('./pages/LoginPage'))
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ClockInPage = lazy(() => import('./pages/ClockInPage'))
const EmployeePortalPage = lazy(() => import('./pages/EmployeePortalPage'))

const PageLoading = () => (
  <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>Loading...</div>
)

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

  // ClockIn and Employee Portal are public — no auth required
  const hash = window.location.hash
  if (hash.includes('/clockin') || hash.includes('/employee')) {
    return (
      <Suspense fallback={<PageLoading />}>
        <HashRouter>
          <Routes>
            <Route path="/clockin" element={<ClockInPage />} />
            <Route path="/employee" element={<EmployeePortalPage />} />
          </Routes>
        </HashRouter>
      </Suspense>
    )
  }

  if (authState === 'unauthenticated') return <Suspense fallback={<PageLoading />}><LoginPage /></Suspense>
  if (authState === 'must_change_password') return <Suspense fallback={<PageLoading />}><ChangePasswordPage /></Suspense>

  return (
    <Suspense fallback={<PageLoading />}>
      <HashRouter>
        <Routes>
          <Route path="/clockin" element={<ClockInPage />} />
          <Route path="/employee" element={<EmployeePortalPage />} />
          <Route path="/*" element={<Dashboard />} />
        </Routes>
      </HashRouter>
    </Suspense>
  )
}
