import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface TeamMember {
  id: string
  full_name: string
  role: string
  must_change_password: boolean
  created_at: string
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMember|null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [toast, setToast] = useState('')

  const loadMembers = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, must_change_password, created_at')
      .is('deleted_at', null)
      .order('full_name')
    setMembers(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadMembers()
    const channel = supabase.channel('team')
      .on('postgres_changes',{event:'*',schema:'public',table:'user_profiles'},loadMembers)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleResetPassword = async () => {
    if (!selectedMember || !newPassword) return
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-set-password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ user_id: selectedMember.id, password: newPassword }),
      }
    )
    if (response.ok) {
      showToast(`Password updated for ${selectedMember.full_name}`)
      setShowReset(false)
      setNewPassword('')
      setSelectedMember(null)
      loadMembers()
    } else {
      showToast('Failed to update password')
    }
  }

  const handleSendReset = async (email: string, name: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-send-password-reset`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email }),
      }
    )
    showToast(`Reset email sent to ${name}`)
  }

  const filtered = members.filter(m =>
    `${m.full_name} ${m.role}`.toLowerCase().includes(search.toLowerCase())
  )

  const roleColor: Record<string,string> = {
    superadmin:'#ede9fe', owner:'#dbeafe', admin:'#e0f2fe',
    dispatcher:'#fef9c3', technician:'#dcfce7', customer:'#f3f4f6'
  }

  const avatarColor: Record<string,string> = {
    superadmin:'#7c3aed', owner:'#2563eb', admin:'#0284c7',
    dispatcher:'#d97706', technician:'#16a34a', customer:'#6b7280'
  }

  return (
    <div style={{padding:'2rem',maxWidth:1200,margin:'0 auto'}}>
      {toast && (
        <div style={{position:'fixed',top:'1rem',right:'1rem',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'10px 16px',fontSize:14,color:'#15803d',fontWeight:500,zIndex:9999,boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
          ✅ {toast}
        </div>
      )}

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'#111827',margin:'0 0 4px'}}>Team</h1>
          <p style={{fontSize:14,color:'#6b7280',margin:0}}>{members.length} team members</p>
        </div>
      </div>

      <input placeholder="Search team..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none',marginBottom:'1rem'}} />

      {loading ? <p>Loading...</p> : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {filtered.length===0 ? (
            <div style={{background:'#fff',borderRadius:16,padding:'3rem',textAlign:'center',border:'1px solid #e5e7eb'}}>
              <p style={{color:'#9ca3af'}}>No team members found</p>
            </div>
          ) : filtered.map(m=>(
            <div key={m.id} style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:40,height:40,borderRadius:'50%',background:roleColor[m.role]||'#f3f4f6',color:avatarColor[m.role]||'#6b7280',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:600,flexShrink:0}}>
                {(m.full_name||'?').split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <span style={{fontSize:14,fontWeight:500,color:'#111827'}}>{m.full_name||'—'}</span>
                  {m.must_change_password && (
                    <span style={{fontSize:11,background:'#fef9c3',color:'#854d0e',padding:'1px 7px',borderRadius:20,fontWeight:500}}>Temp password</span>
                  )}
                </div>
                <span style={{fontSize:11,background:roleColor[m.role]||'#f3f4f6',color:avatarColor[m.role]||'#6b7280',padding:'2px 8px',borderRadius:20,fontWeight:500,display:'inline-block',marginTop:3}}>{m.role}</span>
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                <button
                  onClick={()=>{setSelectedMember(m);setShowReset(true)}}
                  title="Set password"
                  style={{width:32,height:32,borderRadius:8,border:'1.5px solid #e5e7eb',background:'#fff',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}
                >🔒</button>
                <button
                  onClick={()=>handleSendReset(m.full_name,m.full_name)}
                  title="Send reset email"
                  style={{width:32,height:32,borderRadius:8,border:'1.5px solid #e5e7eb',background:'#fff',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}
                >✉️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showReset && selectedMember && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'1rem'}}>
          <div style={{background:'#fff',borderRadius:20,padding:'2rem',width:'100%',maxWidth:400}}>
            <h2 style={{fontSize:18,fontWeight:700,margin:'0 0 4px'}}>Set Password</h2>
            <p style={{fontSize:14,color:'#6b7280',margin:'0 0 1.5rem'}}>For {selectedMember.full_name}</p>
            <div style={{marginBottom:'1.5rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>New Password</label>
              <input type="text" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="e.g. 12345" style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>{setShowReset(false);setNewPassword('');setSelectedMember(null)}} style={{padding:'10px 20px',border:'1.5px solid #e5e7eb',borderRadius:10,background:'#fff',cursor:'pointer',fontSize:14}}>Cancel</button>
              <button onClick={handleResetPassword} style={{padding:'10px 20px',border:'none',borderRadius:10,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:600}}>Set Password</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}