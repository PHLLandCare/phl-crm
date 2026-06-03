import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const inp = {width:'100%',height:42,padding:'0 12px',background:'#1e293b',border:'1.5px solid #334155',borderRadius:8,fontSize:14,boxSizing:'border-box' as const,outline:'none',color:'#f1f5f9',fontFamily:'inherit'}
const lbl = {fontSize:12,fontWeight:600 as const,color:'#94a3b8',textTransform:'uppercase' as const,letterSpacing:'0.04em',display:'block',marginBottom:6}

export default function SettingsPage() {
  const [toast, setToast]   = useState('')
  const [saving, setSaving] = useState(false)
  const [org, setOrg]       = useState({ company_name:'PHL Land Care Inc.', phone:'', address:'', email:'', website:'', license_number:'' })
  const [userInfo, setUserInfo] = useState({ full_name:'', email:'', current_password:'', new_password:'' })
  const [userId, setUserId] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        setUserInfo(u => ({ ...u, email: user.email || '' }))
        const { data: p } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).single()
        if (p) setUserInfo(u => ({ ...u, full_name: p.full_name || '' }))
      }
      const { data: settings } = await supabase.from('org_settings').select('*').limit(1).single()
      if (settings) setOrg(o => ({ ...o, ...settings }))
    }
    load()
  }, [])

  const showToast = (msg: string) => { setToast(msg); setTimeout(()=>setToast(''), 3000) }

  const saveOrg = async () => {
    setSaving(true)
    const { data: existing } = await supabase.from('org_settings').select('id').limit(1).single()
    if (existing?.id) {
      await supabase.from('org_settings').update(org).eq('id', existing.id)
    } else {
      await supabase.from('org_settings').insert(org)
    }
    setSaving(false)
    showToast('Company settings saved!')
  }

  const saveProfile = async () => {
    setSaving(true)
    await supabase.from('user_profiles').update({ full_name: userInfo.full_name }).eq('id', userId)
    if (userInfo.new_password) {
      await supabase.auth.updateUser({ password: userInfo.new_password })
      setUserInfo(u => ({ ...u, new_password: '', current_password: '' }))
    }
    setSaving(false)
    showToast('Profile updated!')
  }

  const handleSignOut = async () => { await supabase.auth.signOut() }

  const card = { background:'#0f172a', borderRadius:16, border:'1px solid #1e293b', padding:'1.5rem', marginBottom:'1rem' }
  const section = { fontSize:16, fontWeight:700 as const, color:'#f1f5f9', margin:'0 0 4px' }
  const sub = { fontSize:13, color:'#64748b', margin:'0 0 1.25rem' }

  return (
    <div style={{ padding:'2rem', maxWidth:820, margin:'0 auto', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {toast && (
        <div style={{ position:'fixed', top:'1rem', right:'1rem', background:'#052e16', border:'1px solid #16a34a', borderRadius:10, padding:'10px 18px', fontSize:14, color:'#4ade80', fontWeight:600, zIndex:9999, display:'flex', alignItems:'center', gap:8 }}>
          ✅ {toast}
        </div>
      )}

      <h1 style={{ fontSize:24, fontWeight:700, color:'#f1f5f9', margin:'0 0 4px' }}>Settings</h1>
      <p style={{ fontSize:14, color:'#64748b', margin:'0 0 1.5rem' }}>Manage your PHL CRM settings</p>

      {/* Company */}
      <div style={card}>
        <h2 style={section}>Company</h2>
        <p style={sub}>Your business information shown on invoices and documents</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:'1.25rem' }}>
          {[
            { label:'Company Name', key:'company_name' },
            { label:'Phone', key:'phone' },
            { label:'Email', key:'email' },
            { label:'Website', key:'website' },
            { label:'License Number', key:'license_number' },
          ].map(f => (
            <div key={f.key}>
              <label style={lbl}>{f.label}</label>
              <input value={(org as any)[f.key]||''} onChange={e=>setOrg({...org,[f.key]:e.target.value})} style={inp} />
            </div>
          ))}
        </div>
        <div style={{ marginBottom:'1.25rem' }}>
          <label style={lbl}>Address</label>
          <input value={org.address||''} onChange={e=>setOrg({...org,address:e.target.value})} style={inp} placeholder="123 Main St, Lake Park, FL" />
        </div>
        <button onClick={saveOrg} disabled={saving}
          style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:8, padding:'9px 20px', fontSize:14, fontWeight:600, cursor:'pointer', opacity:saving?0.7:1, fontFamily:'inherit' }}>
          {saving?'Saving...':'Save Changes'}
        </button>
      </div>

      {/* Divisions */}
      <div style={card}>
        <h2 style={section}>Divisions</h2>
        <p style={sub}>Active service divisions</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {[
            {label:'Lawn & Tree', color:'#16a34a'},
            {label:'Irrigation', color:'#0ea5e9'},
            {label:'Extermination', color:'#dc2626'},
            {label:'Nursery', color:'#d97706'},
            {label:'Farm', color:'#7c3aed'},
          ].map(d=>(
            <span key={d.label} style={{ background:`${d.color}22`, color:d.color, border:`1px solid ${d.color}55`, borderRadius:20, padding:'5px 14px', fontSize:13, fontWeight:600 }}>{d.label}</span>
          ))}
        </div>
      </div>

      {/* Profile */}
      <div style={card}>
        <h2 style={section}>My Profile</h2>
        <p style={sub}>Update your name and password</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:'1.25rem' }}>
          <div>
            <label style={lbl}>Full Name</label>
            <input value={userInfo.full_name} onChange={e=>setUserInfo({...userInfo,full_name:e.target.value})} style={inp} />
          </div>
          <div>
            <label style={lbl}>Email</label>
            <input value={userInfo.email} disabled style={{...inp,opacity:0.5,cursor:'not-allowed'}} />
          </div>
          <div>
            <label style={lbl}>New Password</label>
            <input type="password" value={userInfo.new_password} onChange={e=>setUserInfo({...userInfo,new_password:e.target.value})} placeholder="Leave blank to keep current" style={inp} />
          </div>
        </div>
        <button onClick={saveProfile} disabled={saving}
          style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:8, padding:'9px 20px', fontSize:14, fontWeight:600, cursor:'pointer', opacity:saving?0.7:1, fontFamily:'inherit' }}>
          {saving?'Saving...':'Save Profile'}
        </button>
      </div>

      {/* Integrations */}
      <div style={card}>
        <h2 style={section}>Integrations</h2>
        <p style={sub}>Connected services</p>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[
            {name:'Supabase',       desc:'Database & realtime sync',  status:'Connected',     ok:true},
            {name:'GitHub Pages',  desc:'Hosting & deployment',      status:'Active',        ok:true},
            {name:'Stripe',        desc:'Payment processing',        status:'Setup needed',  ok:false},
            {name:'Twilio',        desc:'SMS notifications',         status:'Setup needed',  ok:false},
            {name:'Resend',        desc:'Email delivery',            status:'Setup needed',  ok:false},
          ].map(i=>(
            <div key={i.name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', background:'#1e293b', borderRadius:10, border:'1px solid #334155' }}>
              <div>
                <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:600, color:'#f1f5f9' }}>{i.name}</p>
                <p style={{ margin:0, fontSize:12, color:'#64748b' }}>{i.desc}</p>
              </div>
              <span style={{ fontSize:12, fontWeight:600, background:i.ok?'#052e16':'#1a1000', color:i.ok?'#4ade80':'#fcd34d', padding:'3px 10px', borderRadius:20, border:`1px solid ${i.ok?'#16a34a':'#d97706'}` }}>{i.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div style={{ ...card, borderColor:'#450a0a' }}>
        <h2 style={{ ...section, color:'#fca5a5' }}>Account</h2>
        <p style={sub}>Sign out of PHL CRM</p>
        <button onClick={handleSignOut} style={{ background:'#450a0a', color:'#fca5a5', border:'1px solid #7f1d1d', borderRadius:8, padding:'9px 20px', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
          Sign Out
        </button>
      </div>
    </div>
  )
}
