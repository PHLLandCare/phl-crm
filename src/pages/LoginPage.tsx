import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('Error: ' + error.message)
        setLoading(false)
      } else if (data.session) {
        setError('Logged in! Redirecting...')
      }
    } catch(e: any) {
      setError('Caught error: ' + e.message)
      setLoading(false)
    }
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f0fdf4',fontFamily:'system-ui,sans-serif'}}>
      <div style={{background:'#fff',borderRadius:20,padding:'2rem',width:'100%',maxWidth:400,boxShadow:'0 4px 24px rgba(0,0,0,0.08)'}}>
        <div style={{textAlign:'center',marginBottom:'1.5rem'}}>
          <img src="https://phllandcare.github.io/phl-crm/phl_logo.jpg" alt="PHL" style={{width:150}} />
        </div>
        <h1 style={{fontSize:22,fontWeight:700,color:'#111827',margin:'0 0 1rem'}}>Welcome back</h1>
        {error && <div style={{background: error.includes('Error') || error.includes('error') ? '#fef2f2' : '#f0fdf4',border:'1px solid #e5e7eb',borderRadius:10,padding:'10px 12px',marginBottom:'1rem',fontSize:13}}>{error}</div>}
        <div style={{marginBottom:'1rem'}}>
          <label style={{fontSize:13,fontWeight:500,display:'block',marginBottom:6}}>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',height:48,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:15,boxSizing:'border-box',outline:'none'}} />
        </div>
        <div style={{marginBottom:'1.25rem'}}>
          <label style={{fontSize:13,fontWeight:500,display:'block',marginBottom:6}}>Password</label>
          <input type="password" placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} style={{width:'100%',height:48,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:15,boxSizing:'border-box',outline:'none'}} />
        </div>
        <button onClick={handleLogin} disabled={loading} style={{width:'100%',height:52,background:'#16a34a',color:'#fff',border:'none',borderRadius:12,fontSize:15,fontWeight:600,cursor:'pointer'}}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </div>
    </div>
  )
}