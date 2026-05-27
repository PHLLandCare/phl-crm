import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ChangePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password === '12345') { setError('Please choose a more secure password.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError('Failed to update password. Please try again.'); setLoading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('user_profiles').update({ must_change_password: false }).eq('id', user.id)
    }
    setDone(true)
    setTimeout(() => window.location.reload(), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '2rem 1.75rem', width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', paddingBottom: '1.25rem', borderBottom: '1px solid #f0fdf4' }}>
          <img src="https://phllandcare.github.io/phl-crm/phl_logo.jpg" alt="PHL Land Care" style={{ width: 150, height: 'auto' }} />
        </div>
        {done ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <h2 style={{ color: '#16a34a' }}>Password updated!</h2>
            <p style={{ color: '#6b7280' }}>Taking you to the dashboard...</p>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 21, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Create your password</h1>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 1.25rem' }}>Welcome to PHL CRM! Please set your own password before continuing.</p>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px', marginBottom: '1rem', color: '#991b1b', fontSize: 13.5 }}>
                {error}
              </div>
            )}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: 13.5, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>New password</label>
              <input
                type="password"
                placeholder="Enter new password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', height: 48, padding: '0 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 15, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: 13.5, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>Confirm password</label>
              <input
                type="password"
                placeholder="Re-enter new password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                style={{ width: '100%', height: 48, padding: '0 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 15, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{ width: '100%', height: 52, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {loading ? 'Saving...' : 'Save password'}
            </button>
          </>
        )}
        <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: '1.5rem' }}>PHL Land Care Inc. · Internal Portal</p>
      </div>
    </div>
  )
}