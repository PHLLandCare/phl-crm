import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Client {
  id: string
  first_name: string
  last_name: string
  company: string
  phone: string
  email: string
  status: string
  divisions: string
  address: string
  city: string
  state: string
  zip: string
  tags: string
  created_at: string
  updated_at: string
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Leads and Active')
  const [showDrawer, setShowDrawer] = useState(false)
  const [editClient, setEditClient] = useState<Client|null>(null)
  const [form, setForm] = useState({
    first_name:'',last_name:'',company:'',phone:'',email:'',
    address:'',city:'',state:'FL',zip:'',
    status:'lead',divisions:'Lawn & Tree',tags:''
  })

  const loadClients = async () => {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').is('deleted_at',null).order('updated_at',{ascending:false})
    setClients(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadClients()
    const channel = supabase.channel('clients-page')
      .on('postgres_changes',{event:'*',schema:'public',table:'clients'},loadClients)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const openAdd = () => {
    setEditClient(null)
    setForm({first_name:'',last_name:'',company:'',phone:'',email:'',address:'',city:'',state:'FL',zip:'',status:'lead',divisions:'Lawn & Tree',tags:''})
    setShowDrawer(true)
  }

  const openEdit = (c: Client) => {
    setEditClient(c)
    setForm({
      first_name:c.first_name||'',last_name:c.last_name||'',company:c.company||'',
      phone:c.phone||'',email:c.email||'',address:c.address||'',
      city:c.city||'',state:c.state||'FL',zip:c.zip||'',
      status:c.status||'lead',divisions:c.divisions||'Lawn & Tree',tags:c.tags||''
    })
    setShowDrawer(true)
  }

  const handleSave = async () => {
    if (!form.first_name || !form.last_name) return
    if (editClient) {
      await supabase.from('clients').update({...form,updated_at:new Date().toISOString()}).eq('id',editClient.id)
    } else {
      await supabase.from('clients').insert({...form,updated_at:new Date().toISOString()})
    }
    setShowDrawer(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Archive this client?')) return
    await supabase.from('clients').update({deleted_at:new Date().toISOString()}).eq('id',id)
  }

  const filtered = clients.filter(c => {
    const matchSearch = `${c.first_name} ${c.last_name} ${c.company} ${c.email} ${c.phone} ${c.address}`.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All'
      ? true
      : statusFilter === 'Leads and Active'
      ? (c.status === 'lead' || c.status === 'active')
      : c.status === statusFilter.toLowerCase()
    return matchSearch && matchStatus
  })

  const activeCount = clients.filter(c=>c.status==='active').length
  const leadCount = clients.filter(c=>c.status==='lead').length
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30*24*60*60*1000)
  const newLeads = clients.filter(c=>c.status==='lead' && new Date(c.created_at) > thirtyDaysAgo).length
  const newClients = clients.filter(c=>c.status==='active' && new Date(c.created_at) > thirtyDaysAgo).length

  const statusColor = (s:string) => {
    if (s==='active') return {bg:'rgba(74,222,128,0.15)',color:'#4ade80'}
    if (s==='lead') return {bg:'rgba(251,191,36,0.15)',color:'#fbbf24'}
    if (s==='overdue') return {bg:'rgba(248,113,113,0.15)',color:'#f87171'}
    return {bg:'rgba(100,116,139,0.15)',color:'#94a3b8'}
  }

  const fmtTime = (d:string) => {
    if (!d) return '—'
    const date = new Date(d)
    const today = new Date()
    if (date.toDateString()===today.toDateString()) return date.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})
    const diff = Math.floor((today.getTime()-date.getTime())/(1000*60*60*24))
    if (diff===1) return 'Yesterday'
    if (diff<7) return diff+'d ago'
    return date.toLocaleDateString('en-US',{month:'short',day:'numeric'})
  }

  const inp = {
    width:'100%',padding:'9px 11px',border:'1px solid #1e293b',borderRadius:8,
    fontSize:13,fontFamily:'inherit',outline:'none',
    background:'#0f172a',color:'#f1f5f9',
  } as React.CSSProperties

  const lbl = {fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase' as const,letterSpacing:'0.05em',marginBottom:4,display:'block'}

  return (
    <div style={{padding:'2rem',maxWidth:1400,margin:'0 auto'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:700,color:'#f1f5f9',margin:'0 0 2px'}}>Clients</h1>
          <p style={{fontSize:13,color:'#64748b',margin:0}}>{clients.length} total clients</p>
        </div>
        <button onClick={openAdd} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:9,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>+ New Client</button>
      </div>

      {/* Stats cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:'1.5rem'}}>
        {[
          {label:'New leads',sub:'Past 30 days',val:newLeads,badge:'-30%',badgeColor:'#f87171'},
          {label:'New clients',sub:'Past 30 days',val:newClients,badge:'0%',badgeColor:'#94a3b8'},
          {label:'Total active clients',sub:'Year to date',val:activeCount,badge:null},
          {label:'Total leads',sub:'All time',val:leadCount,badge:null},
        ].map((s,i)=>(
          <div key={i} style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1rem 1.25rem'}}>
            <p style={{margin:'0 0 2px',fontSize:12,color:'#64748b',fontWeight:600}}>{s.label}</p>
            <p style={{margin:0,fontSize:11,color:'#475569',marginBottom:8}}>{s.sub}</p>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:28,fontWeight:800,color:'#f1f5f9'}}>{s.val}</span>
              {s.badge && <span style={{fontSize:11,fontWeight:700,color:s.badgeColor,background:s.badgeColor==='#f87171'?'rgba(248,113,113,0.1)':'rgba(148,163,184,0.1)',padding:'2px 7px',borderRadius:99}}>{s.badge}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{position:'relative',flex:1,minWidth:200}}>
          <input
            placeholder="Search clients..."
            value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{...inp,paddingLeft:32,height:38}}
          />
          <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#475569',fontSize:14}}>&#128269;</span>
        </div>
        {['Leads and Active','Active','Lead','Inactive','All'].map(s=>(
          <button key={s} onClick={()=>setStatusFilter(s)} style={{
            padding:'7px 14px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
            background:statusFilter===s?'rgba(74,222,128,0.15)':'#0f172a',
            color:statusFilter===s?'#4ade80':'#64748b',
            border:statusFilter===s?'1px solid rgba(74,222,128,0.3)':'1px solid #1e293b',
          }}>{s}</button>
        ))}
        <p style={{margin:0,fontSize:12,color:'#475569'}}>{filtered.length} results</p>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{textAlign:'center',padding:'3rem',color:'#475569'}}>Loading...</div>
      ) : (
        <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:'1px solid #1e293b'}}>
                {['Name','Address','Division','Tags','Status','Last Activity',''].map(h=>(
                  <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',background:'#0d1526'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={7} style={{padding:'3rem',textAlign:'center',color:'#475569',fontSize:13}}>No clients found</td></tr>
              ) : filtered.map(c=>{
                const sc = statusColor(c.status)
                const addr = [c.address,c.city,c.state].filter(Boolean).join(', ')
                const tagList = c.tags ? c.tags.split(',').map(t=>t.trim()).filter(Boolean) : []
                return (
                  <tr key={c.id} onClick={()=>openEdit(c)} style={{borderBottom:'1px solid #1e293b',cursor:'pointer',transition:'background 0.1s'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.03)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <td style={{padding:'12px 14px'}}>
                      <div style={{fontWeight:600,fontSize:13,color:'#f1f5f9'}}>{c.first_name} {c.last_name}</div>
                      {c.company && <div style={{fontSize:11,color:'#64748b',marginTop:1}}>{c.company}</div>}
                      {c.phone && <div style={{fontSize:11,color:'#64748b'}}>{c.phone}</div>}
                    </td>
                    <td style={{padding:'12px 14px',fontSize:12,color:'#64748b',maxWidth:200}}>{addr||'—'}</td>
                    <td style={{padding:'12px 14px',fontSize:12,color:'#64748b'}}>{c.divisions||'—'}</td>
                    <td style={{padding:'12px 14px'}}>
                      <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                        {tagList.length===0 ? <span style={{color:'#475569',fontSize:12}}>—</span>
                        : tagList.slice(0,3).map((t,i)=>(
                          <span key={i} style={{background:'rgba(100,116,139,0.15)',color:'#94a3b8',padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:600}}>{t}</span>
                        ))}
                        {tagList.length>3 && <span style={{color:'#475569',fontSize:10}}>+{tagList.length-3}</span>}
                      </div>
                    </td>
                    <td style={{padding:'12px 14px'}}>
                      <span style={{background:sc.bg,color:sc.color,padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:700,textTransform:'capitalize'}}>{c.status}</span>
                    </td>
                    <td style={{padding:'12px 14px',fontSize:12,color:'#64748b'}}>{fmtTime(c.updated_at||c.created_at)}</td>
                    <td style={{padding:'12px 14px'}}>
                      <button onClick={e=>{e.stopPropagation();handleDelete(c.id)}} style={{background:'rgba(248,113,113,0.1)',color:'#f87171',border:'1px solid rgba(248,113,113,0.2)',borderRadius:6,padding:'4px 10px',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>Archive</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer overlay */}
      {showDrawer && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:500}} onClick={()=>setShowDrawer(false)} />
      )}

      {/* Add/Edit Drawer */}
      <div style={{
        position:'fixed',top:0,right:showDrawer?0:-520,width:500,height:'100vh',
        background:'#0d1526',borderLeft:'1px solid #1e293b',zIndex:501,
        display:'flex',flexDirection:'column',transition:'right 0.25s',
      }}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid #1e293b',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:15,fontWeight:700,color:'#f1f5f9'}}>{editClient?'Edit Client':'New Client'}</span>
          <button onClick={()=>setShowDrawer(false)} style={{background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer',lineHeight:1}}>×</button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'20px'}}>
          <p style={{fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.06em',margin:'0 0 10px',paddingBottom:6,borderBottom:'1px solid #1e293b'}}>Personal Info</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <div><label style={lbl}>First Name *</label><input style={inp} value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})} placeholder="First name" /></div>
            <div><label style={lbl}>Last Name *</label><input style={inp} value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})} placeholder="Last name" /></div>
            <div><label style={lbl}>Company</label><input style={inp} value={form.company} onChange={e=>setForm({...form,company:e.target.value})} placeholder="Company name" /></div>
            <div><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="(561) 000-0000" /></div>
            <div style={{gridColumn:'1/-1'}}><label style={lbl}>Email</label><input style={inp} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email@example.com" /></div>
          </div>
          <p style={{fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.06em',margin:'14px 0 10px',paddingBottom:6,borderBottom:'1px solid #1e293b'}}>Address</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <div style={{gridColumn:'1/-1'}}><label style={lbl}>Street Address</label><input style={inp} value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="123 Main St" /></div>
            <div><label style={lbl}>City</label><input style={inp} value={form.city} onChange={e=>setForm({...form,city:e.target.value})} placeholder="Port St. Lucie" /></div>
            <div><label style={lbl}>ZIP</label><input style={inp} value={form.zip} onChange={e=>setForm({...form,zip:e.target.value})} placeholder="34986" /></div>
          </div>
          <p style={{fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.06em',margin:'14px 0 10px',paddingBottom:6,borderBottom:'1px solid #1e293b'}}>Details</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <div><label style={lbl}>Division</label>
              <select style={{...inp}} value={form.divisions} onChange={e=>setForm({...form,divisions:e.target.value})}>
                {['Lawn & Tree','Irrigation','Extermination','Nursery','Farm'].map(d=><option key={d}>{d}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Status</label>
              <select style={{...inp}} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                {['lead','active','inactive','overdue'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{gridColumn:'1/-1'}}><label style={lbl}>Tags (comma separated)</label><input style={inp} value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="HOA, Monthly bill, PGA POA" /></div>
          </div>
        </div>
        <div style={{padding:'14px 20px',borderTop:'1px solid #1e293b',display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={()=>setShowDrawer(false)} style={{padding:'9px 18px',border:'1px solid #1e293b',borderRadius:8,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>Cancel</button>
          <button onClick={handleSave} style={{padding:'9px 18px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>{editClient?'Save Changes':'Add Client'}</button>
        </div>
      </div>
    </div>
  )
}
