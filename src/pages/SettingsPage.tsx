import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function SettingsPage() {
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div style={{padding:'2rem',maxWidth:800,margin:'0 auto'}}>
      {toast && (
        <div style={{position:'fixed',top:'1rem',right:'1rem',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'10px 16px',fontSize:14,color:'#15803d',fontWeight:500,zIndex:9999}}>
          ✅ {toast}
        </div>
      )}

      <h1 style={{fontSize:24,fontWeight:700,color:'#111827',margin:'0 0 4px'}}>Settings</h1>
      <p style={{fontSize:14,color:'#6b7280',margin:'0 0 2rem'}}>Manage your PHL CRM settings</p>

      <div style={{display:'flex',flexDirection:'column',gap:16}}>

        {/* Company */}
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #e5e7eb',padding:'1.5rem'}}>
          <h2 style={{fontSize:16,fontWeight:600,color:'#111827',margin:'0 0 4px'}}>Company</h2>
          <p style={{fontSize:13,color:'#6b7280',margin:'0 0 1rem'}}>PHL Land Care Inc.</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {['Company Name','Phone','Address','Email'].map(f=>(
              <div key={f}>
                <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'block',marginBottom:4}}>{f}</label>
                <input placeholder={f} style={{width:'100%',height:40,padding:'0 10px',border:'1.5px solid #e5e7eb',borderRadius:8,fontSize:13,boxSizing:'border-box',outline:'none'}} />
              </div>
            ))}
          </div>
          <button onClick={()=>showToast('Settings saved!')} style={{marginTop:'1rem',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontSize:13,fontWeight:600,cursor:'pointer'}}>Save Changes</button>
        </div>

        {/* Divisions */}
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #e5e7eb',padding:'1.5rem'}}>
          <h2 style={{fontSize:16,fontWeight:600,color:'#111827',margin:'0 0 1rem'}}>Divisions</h2>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {['Lawn & Tree','Irrigation','Extermination','Nursery','Farm'].map(d=>(
              <span key={d} style={{background:'#f0fdf4',color:'#15803d',border:'1px solid #bbf7d0',borderRadius:20,padding:'4px 14px',fontSize:13,fontWeight:500}}>{d}</span>
            ))}
          </div>
        </div>

        {/* Integrations */}
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #e5e7eb',padding:'1.5rem'}}>
          <h2 style={{fontSize:16,fontWeight:600,color:'#111827',margin:'0 0 1rem'}}>Integrations</h2>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {[
              {name:'Supabase',desc:'Database & realtime sync',status:'Connected'},
              {name:'GitHub Pages',desc:'Hosting & deployment',status:'Active'},
              {name:'Stripe',desc:'Payments',status:'Setup needed'},
              {name:'Twilio',desc:'SMS notifications',status:'Setup needed'},
            ].map(i=>(
              <div key={i.name} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px',background:'#f9fafb',borderRadius:10,border:'1px solid #e5e7eb'}}>
                <div>
                  <p style={{margin:'0 0 2px',fontSize:14,fontWeight:500,color:'#111827'}}>{i.name}</p>
                  <p style={{margin:0,fontSize:12,color:'#6b7280'}}>{i.desc}</p>
                </div>
                <span style={{fontSize:12,fontWeight:500,background:i.status==='Connected'||i.status==='Active'?'#dcfce7':'#fef9c3',color:i.status==='Connected'||i.status==='Active'?'#15803d':'#854d0e',padding:'3px 10px',borderRadius:20}}>{i.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Account */}
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #e5e7eb',padding:'1.5rem'}}>
          <h2 style={{fontSize:16,fontWeight:600,color:'#111827',margin:'0 0 1rem'}}>Account</h2>
          <button onClick={handleSignOut} style={{background:'#fef2f2',color:'#991b1b',border:'1px solid #fecaca',borderRadius:8,padding:'8px 16px',fontSize:13,fontWeight:600,cursor:'pointer'}}>Sign Out</button>
        </div>

      </div>
    </div>
  )
}