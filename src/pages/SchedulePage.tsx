import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Schedule {
  id: string
  scheduled_start: string
  scheduled_end: string
  status: string
  notes: string
}

export default function SchedulePage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({scheduled_start:'',scheduled_end:'',status:'scheduled',notes:''})

  const loadSchedules = async () => {
    setLoading(true)
    const { data } = await supabase.from('schedules').select('*').order('scheduled_start')
    setSchedules(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadSchedules()
    const channel = supabase.channel('schedules')
      .on('postgres_changes',{event:'*',schema:'public',table:'schedules'},loadSchedules)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleAdd = async () => {
    if (!form.scheduled_start) return
    await supabase.from('schedules').insert(form)
    setShowAdd(false)
    setForm({scheduled_start:'',scheduled_end:'',status:'scheduled',notes:''})
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return
    await supabase.from('schedules').delete().eq('id',id)
  }

  const statusColor: Record<string,string> = {
    scheduled:'#dbeafe', dispatched:'#fef9c3', completed:'#dcfce7', missed:'#fef2f2'
  }

  // Group by date
  const grouped = schedules.reduce((acc, s) => {
    const date = s.scheduled_start ? s.scheduled_start.split('T')[0] : 'No date'
    if (!acc[date]) acc[date] = []
    acc[date].push(s)
    return acc
  }, {} as Record<string, Schedule[]>)

  return (
    <div style={{padding:'2rem',maxWidth:1200,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'#111827',margin:'0 0 4px'}}>Schedule</h1>
          <p style={{fontSize:14,color:'#6b7280',margin:0}}>{schedules.length} scheduled items</p>
        </div>
        <button onClick={()=>setShowAdd(true)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:'pointer'}}>+ Add Schedule</button>
      </div>

      {loading ? <p>Loading...</p> : (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {Object.keys(grouped).length===0 ? (
            <div style={{background:'#fff',borderRadius:16,padding:'3rem',textAlign:'center',border:'1px solid #e5e7eb'}}>
              <p style={{color:'#9ca3af',fontSize:14}}>No schedules yet</p>
            </div>
          ) : Object.entries(grouped).map(([date, items])=>(
            <div key={date} style={{background:'#fff',borderRadius:16,border:'1px solid #e5e7eb',overflow:'hidden'}}>
              <div style={{background:'#f9fafb',padding:'12px 16px',borderBottom:'1px solid #e5e7eb'}}>
                <h3 style={{margin:0,fontSize:14,fontWeight:600,color:'#374151'}}>{date}</h3>
              </div>
              {items.map(s=>(
                <div key={s.id} style={{padding:'12px 16px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
                  <div style={{flex:1}}>
                    <p style={{margin:'0 0 4px',fontSize:14,fontWeight:500,color:'#111827'}}>
                      {s.scheduled_start ? new Date(s.scheduled_start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—'}
                      {s.scheduled_end ? ` → ${new Date(s.scheduled_end).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}` : ''}
                    </p>
                    {s.notes && <p style={{margin:0,fontSize:13,color:'#6b7280'}}>{s.notes}</p>}
                  </div>
                  <span style={{background:statusColor[s.status]||'#f3f4f6',padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:500,whiteSpace:'nowrap'}}>{s.status}</span>
                  <button onClick={()=>handleDelete(s.id)} style={{background:'#fef2f2',color:'#991b1b',border:'none',borderRadius:6,padding:'4px 10px',fontSize:12,cursor:'pointer'}}>Delete</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'1rem'}}>
          <div style={{background:'#fff',borderRadius:20,padding:'2rem',width:'100%',maxWidth:500}}>
            <h2 style={{fontSize:18,fontWeight:700,margin:'0 0 1.5rem'}}>Add Schedule</h2>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Start *</label>
              <input type="datetime-local" value={form.scheduled_start} onChange={e=>setForm({...form,scheduled_start:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>End</label>
              <input type="datetime-local" value={form.scheduled_end} onChange={e=>setForm({...form,scheduled_end:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Notes</label>
              <textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={{width:'100%',padding:'10px 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none',minHeight:80,resize:'vertical'}} />
            </div>
            <div style={{marginBottom:'1.5rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Status</label>
              <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}}>
                {['scheduled','dispatched','completed','missed'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowAdd(false)} style={{padding:'10px 20px',border:'1.5px solid #e5e7eb',borderRadius:10,background:'#fff',cursor:'pointer',fontSize:14}}>Cancel</button>
              <button onClick={handleAdd} style={{padding:'10px 20px',border:'none',borderRadius:10,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:600}}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}