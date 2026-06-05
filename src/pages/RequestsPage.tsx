import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface Request {
  id: string
  title: string
  client_name: string
  client_id: string
  phone: string
  email: string
  property_address: string
  service: string
  notes: string
  status: string
  salesperson: string
  requested_on: string
  availability_date1: string
  availability_date2: string
  arrival_times: string[]
  line_items: string
  created_at: string
  updated_at: string
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'New':         { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24' },
  'In Progress': { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
  'Completed':   { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' },
  'Overdue':     { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  'Archived':    { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
}

export default function RequestsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>({ title:'', client_name:'', client_id:'', phone:'', email:'', property_address:'', service:'', notes:'', status:'New', availability_date1:'', availability_date2:'', arrival_times:[] as string[] })
  const [clients, setClients] = useState<any[]>([])

  const inp: React.CSSProperties = { width:'100%', padding:'9px 11px', border:'1px solid #1e293b', borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#0f172a', color:'#f1f5f9', boxSizing:'border-box' }
  const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4, display:'block' }

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadRequests = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('requests').select('*').order('created_at', { ascending: false })
      if (!error && data) {
        setRequests(data)
      } else {
        // Table may not exist yet — show empty state gracefully
        setRequests([])
      }
    } catch {
      setRequests([])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadRequests()
    supabase.from('clients').select('id,first_name,last_name,company,phone,email,address,city,state,zip').is('deleted_at',null).order('first_name').then(({data})=>setClients(data??[]))
    // Apply filter from dashboard navigation
    const state = location.state as any
    if (state?.filter === 'new') setStatusFilter('New')
    else if (state?.filter === 'overdue') setStatusFilter('Overdue')

    // Pre-fill client if coming from client page
    if (state?.clientName) setForm(f => ({ ...f, client_name: state.clientName }))
    if (state?.openCreate) setShowNew(true)
  }, [location.state])

  const handleSave = async () => {
    if (!form.client_name.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('requests').insert({
        ...form,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      showToast('Request saved!')
      setShowNew(false)
      setForm({ title:'', client_name:'', client_id:'', phone:'', email:'', property_address:'', service:'', notes:'', status:'New', availability_date1:'', availability_date2:'', arrival_times:[] })
      loadRequests()
    } catch {
      // If table doesn't exist, create it first
      await supabase.rpc('create_requests_if_needed').catch(() => null)
      showToast('Request saved locally — ensure requests table exists in Supabase')
      setShowNew(false)
      // Add to local state so user sees it
      setRequests(prev => [{
        id: String(Date.now()), ...form,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }, ...prev])
    }
    setSaving(false)
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await supabase.from('requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
      showToast(`Status updated to ${status}`)
    } catch {
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this request?')) return
    try {
      await supabase.from('requests').delete().eq('id', id)
    } catch {}
    setRequests(prev => prev.filter(r => r.id !== id))
    showToast('Request deleted')
  }

  const sc = (s: string) => STATUS_COLORS[s] || { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' }

  const filtered = requests.filter(r => {
    const matchSearch = `${r.client_name} ${r.service} ${r.email} ${r.phone}`.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' || r.status === statusFilter
    return matchSearch && matchStatus
  })

  const newCount = requests.filter(r => r.status === 'New').length
  const inProgCount = requests.filter(r => r.status === 'In Progress').length
  const overdueCount = requests.filter(r => r.status === 'Overdue').length
  const completedCount = requests.filter(r => r.status === 'Completed').length

  return (
    <div style={{ padding:'2rem', background:'#0a0f1a', minHeight:'100vh', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {toast && (
        <div style={{ position:'fixed',top:'1rem',right:'1rem',background:'#052e16',border:'1px solid #16a34a',borderRadius:10,padding:'10px 18px',fontSize:14,color:'#4ade80',fontWeight:600,zIndex:9999 }}>
          ✅ {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12 }}>
        <div>
          <h1 style={{ fontSize:28,fontWeight:800,color:'#f1f5f9',margin:'0 0 2px' }}>Requests</h1>
          <p style={{ fontSize:13,color:'#64748b',margin:0 }}>{requests.length} total requests</p>
        </div>
        <button onClick={() => setShowNew(true)} style={{ background:'#16a34a',color:'#fff',border:'none',borderRadius:9,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>+ New Request</button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:'1.5rem' }}>
        {[
          { label:'New',         val:newCount,       color:'#fbbf24', filter:'New' },
          { label:'In Progress', val:inProgCount,    color:'#60a5fa', filter:'In Progress' },
          { label:'Overdue',     val:overdueCount,   color:'#f87171', filter:'Overdue' },
          { label:'Completed',   val:completedCount, color:'#4ade80', filter:'Completed' },
          { label:'Total',       val:requests.length,color:'#94a3b8', filter:'All' },
        ].map((s,i) => (
          <div key={i} onClick={() => setStatusFilter(s.filter)}
            style={{ background:'#0f172a',border:'1px solid #1e293b',borderTop:`3px solid ${s.color}`,borderRadius:14,padding:'1rem 1.25rem',cursor:'pointer',transition:'background .1s' }}
            onMouseEnter={e=>(e.currentTarget.style.background='#111c2d')} onMouseLeave={e=>(e.currentTarget.style.background='#0f172a')}>
            <p style={{ margin:'0 0 4px',fontSize:11,color:s.color,fontWeight:700,textTransform:'uppercase' }}>{s.label}</p>
            <span style={{ fontSize:26,fontWeight:800,color:'#f1f5f9' }}>{s.val}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center' }}>
        <div style={{ position:'relative',flex:1,minWidth:200 }}>
          <input placeholder="Search requests..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inp,paddingLeft:32,height:38 }} />
          <span style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#475569' }}>🔍</span>
        </div>
        {['All','New','In Progress','Overdue','Completed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            padding:'7px 14px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
            background:statusFilter===s?'rgba(74,222,128,0.15)':'#0f172a',
            color:statusFilter===s?'#4ade80':'#64748b',
            border:statusFilter===s?'1px solid rgba(74,222,128,0.3)':'1px solid #1e293b',
          }}>{s}</button>
        ))}
        <p style={{ margin:0,fontSize:12,color:'#475569' }}>{filtered.length} results</p>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign:'center',padding:'3rem',color:'#475569' }}>Loading...</div>
      ) : (
        <div style={{ background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',overflow:'hidden' }}>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e293b',background:'#0d1526' }}>
                {['Client','Phone','Email','Service Requested','Status','Date','Actions'].map(h => (
                  <th key={h} style={{ padding:'10px 14px',textAlign:'left',fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding:'3rem',textAlign:'center',color:'#475569',fontSize:13 }}>
                  <div style={{ fontSize:40,marginBottom:12 }}>📬</div>
                  <p style={{ margin:'0 0 4px',fontSize:15,fontWeight:600,color:'#64748b' }}>No requests yet</p>
                  <p style={{ margin:'0 0 16px',fontSize:13 }}>Click "+ New Request" to log your first service request</p>
                  <button onClick={() => setShowNew(true)} style={{ background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>+ New Request</button>
                </td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} style={{ borderBottom:'1px solid #1e293b' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.03)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <td style={{ padding:'12px 14px',fontSize:13,color:'#f1f5f9',fontWeight:600 }}>{r.client_name}</td>
                  <td style={{ padding:'12px 14px',fontSize:13,color:'#64748b' }}>{r.phone || '—'}</td>
                  <td style={{ padding:'12px 14px',fontSize:13,color:'#64748b' }}>{r.email || '—'}</td>
                  <td style={{ padding:'12px 14px',fontSize:13,color:'#cbd5e1' }}>{r.service || '—'}</td>
                  <td style={{ padding:'12px 14px' }}>
                    <select value={r.status} onChange={e => handleUpdateStatus(r.id, e.target.value)}
                      style={{ background:sc(r.status).bg,color:sc(r.status).color,border:'none',borderRadius:99,padding:'3px 10px',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit',outline:'none' }}>
                      {['New','In Progress','Overdue','Completed','Archived'].map(s=><option key={s} style={{ background:'#0f172a',color:'#f1f5f9' }}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:'12px 14px',fontSize:12,color:'#64748b' }}>
                    {new Date(r.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                  </td>
                  <td style={{ padding:'12px 14px',display:'flex',gap:6 }}>
                    <button onClick={() => navigate('/quotes', { state:{ openCreate:true, clientName:r.client_name } })}
                      style={{ background:'rgba(168,85,247,0.15)',color:'#a855f7',border:'1px solid rgba(168,85,247,0.3)',borderRadius:6,padding:'4px 10px',fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:600 }}>→ Quote</button>
                    <button onClick={() => navigate('/jobs', { state:{ openCreate:true, clientName:r.client_name } })}
                      style={{ background:'rgba(74,222,128,0.1)',color:'#4ade80',border:'1px solid rgba(74,222,128,0.2)',borderRadius:6,padding:'4px 10px',fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:600 }}>→ Job</button>
                    <button onClick={() => handleDelete(r.id)}
                      style={{ background:'rgba(248,113,113,0.1)',color:'#f87171',border:'1px solid rgba(248,113,113,0.2)',borderRadius:6,padding:'4px 10px',fontSize:11,cursor:'pointer',fontFamily:'inherit' }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Request Modal — Jobber style */}
      {showNew && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:500 }} onClick={() => setShowNew(false)} />
          <div style={{ position:'fixed',inset:0,zIndex:501,display:'flex',flexDirection:'column',background:'#0d1526',overflow:'hidden' }} onClick={e=>e.stopPropagation()}>
            {/* Top bar */}
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 24px',background:'#0f172a',borderBottom:'2px solid #fb923c',flexShrink:0 }}>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <span style={{ fontSize:22 }}>📬</span>
                <h2 style={{ margin:0,fontSize:18,fontWeight:700,color:'#f1f5f9' }}>New Request</h2>
              </div>
              <button onClick={() => setShowNew(false)} style={{ background:'none',border:'none',color:'#64748b',fontSize:24,cursor:'pointer' }}>×</button>
            </div>

            {/* Header fields */}
            <div style={{ padding:'16px 24px',background:'#0d1526',borderBottom:'1px solid #1e293b',flexShrink:0 }}>
              <div style={{ display:'grid',gridTemplateColumns:'1fr auto',gap:16,alignItems:'start' }}>
                <div>
                  <input value={form.title||''} onChange={e => setForm({...form,title:e.target.value})}
                    placeholder="Title"
                    style={{ width:'100%',padding:'12px 16px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9',fontSize:16,outline:'none',fontFamily:'inherit',boxSizing:'border-box' as 'border-box' }} />
                  <div style={{ marginTop:10 }}>
                    <select style={{ ...inp,fontSize:14 }} value={form.client_name||''} onChange={e => setForm({...form,client_name:e.target.value})}>
                      <option value="">Select a client</option>
                      {clients.map((c:any) => <option key={c.id} value={`${c.first_name} ${c.last_name}`}>{c.first_name} {c.last_name}{c.company ? ` — ${c.company}` : ''}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ minWidth:220 }}>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
                    <span style={{ fontSize:13,color:'#64748b' }}>Requested on</span>
                    <span style={{ fontSize:13,fontWeight:600,color:'#f1f5f9' }}>{new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
                  </div>
                  <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                    <span style={{ fontSize:13,color:'#64748b' }}>Salesperson</span>
                    <span style={{ fontSize:12,background:'#1e293b',border:'1px solid #334155',borderRadius:20,padding:'3px 12px',color:'#f1f5f9' }}>Romy Cruz</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{ flex:1,overflowY:'auto',padding:'24px' }}>
              <div style={{ maxWidth:800,margin:'0 auto' }}>

                {/* Overview */}
                <h3 style={{ fontSize:18,fontWeight:700,color:'#f1f5f9',margin:'0 0 16px' }}>Overview</h3>

                {/* Service Details */}
                <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.25rem',marginBottom:16 }}>
                  <h4 style={{ margin:'0 0 4px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>Service Details</h4>
                  <p style={{ margin:'0 0 12px',fontSize:12,color:'#64748b' }}>Please provide as much information as you can</p>
                  <textarea value={form.notes||''} onChange={e => setForm({...form,notes:e.target.value})}
                    placeholder="Describe the work needed..."
                    style={{ width:'100%',padding:'12px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9',fontSize:13,outline:'none',resize:'vertical',minHeight:100,fontFamily:'inherit',boxSizing:'border-box' as 'border-box' }} />
                </div>

                {/* Availability */}
                <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.25rem',marginBottom:16 }}>
                  <h4 style={{ margin:'0 0 4px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>Your Availability</h4>
                  <p style={{ margin:'0 0 12px',fontSize:12,color:'#64748b' }}>Which day would be best for an assessment of the work?</p>
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
                    <div>
                      <label style={{ fontSize:12,color:'#64748b',display:'block',marginBottom:4 }}>Preferred date</label>
                      <input type="date" style={inp} value={form.availability_date1||''} onChange={e => setForm({...form,availability_date1:e.target.value})} />
                    </div>
                    <div>
                      <label style={{ fontSize:12,color:'#64748b',display:'block',marginBottom:4 }}>Alternative date</label>
                      <input type="date" style={inp} value={form.availability_date2||''} onChange={e => setForm({...form,availability_date2:e.target.value})} />
                    </div>
                  </div>
                  <p style={{ margin:'0 0 8px',fontSize:12,color:'#64748b' }}>What are your preferred arrival times?</p>
                  <div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>
                    {['Any time','Morning','Afternoon','Evening'].map(t => {
                      const times = form.arrival_times || []
                      const active = times.includes(t)
                      return (
                        <label key={t} style={{ display:'flex',alignItems:'center',gap:6,cursor:'pointer' }}>
                          <div onClick={() => setForm({...form, arrival_times: active ? times.filter((x:string)=>x!==t) : [...times,t]})}
                            style={{ width:16,height:16,border:`2px solid ${active?'#4ade80':'#334155'}`,borderRadius:3,background:active?'#16a34a':'transparent',cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' }}>
                            {active && <span style={{ color:'#fff',fontSize:10,lineHeight:1 }}>✓</span>}
                          </div>
                          <span style={{ fontSize:13,color:'#cbd5e1' }}>{t}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Property */}
                <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.25rem',marginBottom:16 }}>
                  <h4 style={{ margin:'0 0 12px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>Property Address</h4>
                  <input style={inp} value={form.property_address||''} onChange={e => setForm({...form,property_address:e.target.value})} placeholder="Service address" />
                </div>

                {/* Service type */}
                <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.25rem',marginBottom:16 }}>
                  <h4 style={{ margin:'0 0 12px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>Service Type</h4>
                  <select style={inp} value={form.service||''} onChange={e => setForm({...form,service:e.target.value})}>
                    <option value="">— Select service —</option>
                    {['Lawn Mowing','Irrigation','Pest Control','Tree Trimming','Landscaping','Yard Clean Up','Core Aeration','Mulch Installation','Fertilizer & Weed Control','Palm Trimming','Sod Installation','Hardscape / Pavers','Free Assessment','Other'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>

                {/* On-site assessment */}
                <div style={{ border:'2px dashed #1e293b',borderRadius:12,padding:'2rem',textAlign:'center',marginBottom:16 }}>
                  <div style={{ width:52,height:52,borderRadius:'50%',background:'#1e293b',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px',fontSize:24 }}>🚗</div>
                  <p style={{ margin:0,fontSize:14,color:'#64748b' }}>On-site assessment — visit the property to assess the job before you do the work</p>
                </div>

                {/* Internal notes */}
                <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.25rem',marginBottom:16 }}>
                  <h4 style={{ margin:'0 0 12px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>Notes</h4>
                  <div style={{ border:'2px dashed #1e293b',borderRadius:8,padding:'1.5rem',textAlign:'center',cursor:'text' }}>
                    <span style={{ fontSize:20,display:'block',marginBottom:8 }}>📋</span>
                    <p style={{ margin:0,fontSize:13,color:'#475569' }}>Leave an internal note for yourself or a team member</p>
                  </div>
                </div>

              </div>
            </div>

            {/* Footer */}
            <div style={{ display:'flex',justifyContent:'flex-end',gap:12,padding:'16px 24px',background:'#0f172a',borderTop:'1px solid #1e293b',flexShrink:0 }}>
              <button onClick={() => setShowNew(false)} style={{ padding:'10px 24px',border:'1px solid #334155',borderRadius:9,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:14,fontFamily:'inherit' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding:'10px 28px',border:'none',borderRadius:9,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700,fontFamily:'inherit',opacity:saving?0.7:1 }}>{saving?'Saving...':'Save Request'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
