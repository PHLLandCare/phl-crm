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
  division: string
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({first_name:'',last_name:'',company:'',phone:'',email:'',status:'active',division:'Lawn & Tree'})

  const loadClients = async () => {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').is('deleted_at',null).order('last_name')
    setClients(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadClients()
    const channel = supabase.channel('clients')
      .on('postgres_changes',{event:'*',schema:'public',table:'clients'},loadClients)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleAdd = async () => {
    if (!form.first_name || !form.last_name) return
    await supabase.from('clients').insert(form)
    setShowAdd(false)
    setForm({first_name:'',last_name:'',company:'',phone:'',email:'',status:'active',division:'Lawn & Tree'})
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this client?')) return
    await supabase.from('clients').update({deleted_at:new Date().toISOString()}).eq('id',id)
  }

  const filtered = clients.filter(c =>
    `${c.first_name} ${c.last_name} ${c.company} ${c.email} ${c.phone}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{padding:'2rem',maxWidth:1200,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'#111827',margin:'0 0 4px'}}>Clients</h1>
          <p style={{fontSize:14,color:'#6b7280',margin:0}}>{clients.length} total clients</p>
        </div>
        <button onClick={()=>setShowAdd(true)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:'pointer'}}>+ Add Client</button>
      </div>
      <input placeholder="Search clients..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none',marginBottom:'1rem'}} />
      {loading ? <p>Loading...</p> : (
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #e5e7eb',overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'#f9fafb',borderBottom:'1px solid #e5e7eb'}}>
                {['Name','Company','Phone','Email','Division','Status',''].map(h=>(
                  <th key={h} style={{padding:'12px 16px',textAlign:'left',fontSize:12,fontWeight:600,color:'#6b7280'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={7} style={{padding:'2rem',textAlign:'center',color:'#9ca3af'}}>No clients found</td></tr>
              ) : filtered.map(c=>(
                <tr key={c.id} style={{borderBottom:'1px solid #f3f4f6'}}>
                  <td style={{padding:'12px 16px',fontSize:14,fontWeight:500}}>{c.first_name} {c.last_name}</td>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>{c.company||'—'}</td>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>{c.phone||'—'}</td>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>{c.email||'—'}</td>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>{c.division||'—'}</td>
                  <td style={{padding:'12px 16px'}}>
                    <span style={{background:c.status==='active'?'#dcfce7':c.status==='lead'?'#fef9c3':'#f3f4f6',padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:500}}>{c.status}</span>
                  </td>
                  <td style={{padding:'12px 16px'}}>
                    <button onClick={()=>handleDelete(c.id)} style={{background:'#fef2f2',color:'#991b1b',border:'none',borderRadius:6,padding:'4px 10px',fontSize:12,cursor:'pointer'}}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'1rem'}}>
          <div style={{background:'#fff',borderRadius:20,padding:'2rem',width:'100%',maxWidth:500,maxHeight:'90vh',overflowY:'auto'}}>
            <h2 style={{fontSize:18,fontWeight:700,margin:'0 0 1.5rem'}}>Add New Client</h2>
            {[{label:'First Name *',key:'first_name'},{label:'Last Name *',key:'last_name'},{label:'Company',key:'company'},{label:'Phone',key:'phone'},{label:'Email',key:'email'}].map(f=>(
              <div key={f.key} style={{marginBottom:'1rem'}}>
                <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>{f.label}</label>
                <input value={form[f.key as keyof typeof form]} onChange={e=>setForm({...form,[f.key]:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
              </div>
            ))}
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Division</label>
              <select value={form.division} onChange={e=>setForm({...form,division:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}}>
                {['Lawn & Tree','Irrigation','Extermination','Nursery','Farm'].map(d=><option key={d}>{d}</option>)}
              </select>
            </div>
            <div style={{marginBottom:'1.5rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Status</label>
              <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}}>
                {['active','lead','inactive','overdue'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowAdd(false)} style={{padding:'10px 20px',border:'1.5px solid #e5e7eb',borderRadius:10,background:'#fff',cursor:'pointer',fontSize:14}}>Cancel</button>
              <button onClick={handleAdd} style={{padding:'10px 20px',border:'none',borderRadius:10,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:600}}>Save Client</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}