import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface ScheduleItem {
  id: string
  title: string
  client_name: string
  address: string
  scheduled_start: string
  scheduled_end: string
  status: string
  assigned_to: string
  division: string
  notes: string
  lat?: number
  lng?: number
}

interface Employee { id: string; fname: string; lname: string; division: string }

const STATUS = {
  scheduled:  { bg:'#0c1a2e', color:'#7dd3fc',  dot:'#0ea5e9'  },
  dispatched: { bg:'#1a1000', color:'#fcd34d',  dot:'#d97706'  },
  in_progress:{ bg:'#1a0533', color:'#d8b4fe',  dot:'#9333ea'  },
  completed:  { bg:'#052e16', color:'#4ade80',  dot:'#16a34a'  },
  missed:     { bg:'#450a0a', color:'#fca5a5',  dot:'#ef4444'  },
}

const DIVS = ['Lawn & Tree','Irrigation','Extermination','Nursery','Farm']
const VIEWS = ['Day','Week','Month','List']

const inp  = {width:'100%',height:42,padding:'0 12px',background:'#1e293b',border:'1.5px solid #334155',borderRadius:8,fontSize:14,boxSizing:'border-box' as const,outline:'none',color:'#f1f5f9',fontFamily:'inherit'}
const lbl  = {fontSize:12,fontWeight:600 as const,color:'#94a3b8',textTransform:'uppercase' as const,letterSpacing:'0.04em',display:'block',marginBottom:6}

function fmtTime(ts: string) { return new Date(ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) }
function fmtDate(ts: string) { return new Date(ts).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) }
function isSameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate() }

export default function SchedulePage() {
  const [items, setItems]         = useState<ScheduleItem[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState<'Day'|'Week'|'Month'|'List'>('Week')
  const [today, setToday]         = useState(new Date())
  const [weekStart, setWeekStart] = useState(() => { const d=new Date(); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0); return d })
  const [showAdd, setShowAdd]     = useState(false)
  const [divFilter, setDivFilter] = useState('All')
  const [empFilter, setEmpFilter] = useState('All')
  const [selected, setSelected]   = useState<ScheduleItem|null>(null)
  const [form, setForm]           = useState({
    title:'', client_name:'', address:'', scheduled_start:'', scheduled_end:'',
    status:'scheduled', assigned_to:'', division:'Lawn & Tree', notes:''
  })

  const load = async () => {
    setLoading(true)
    const [sRes, eRes] = await Promise.all([
      supabase.from('schedules').select('*').order('scheduled_start'),
      supabase.from('employees').select('id,fname,lname,division').eq('active',true).order('fname'),
    ])
    setItems(sRes.data ?? [])
    setEmployees(eRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('schedules').on('postgres_changes',{event:'*',schema:'public',table:'schedules'},load).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const handleSave = async () => {
    if (!form.scheduled_start || !form.title) return
    await supabase.from('schedules').insert(form)
    setShowAdd(false)
    setForm({title:'',client_name:'',address:'',scheduled_start:'',scheduled_end:'',status:'scheduled',assigned_to:'',division:'Lawn & Tree',notes:''})
  }

  const handleStatusChange = async (id: string, status: string) => {
    await supabase.from('schedules').update({status}).eq('id',id)
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this job?')) return
    await supabase.from('schedules').delete().eq('id',id)
    setSelected(null)
    load()
  }

  const filtered = items.filter(i => {
    if (divFilter !== 'All' && i.division !== divFilter) return false
    if (empFilter !== 'All' && i.assigned_to !== empFilter) return false
    return true
  })

  const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(weekStart); d.setDate(d.getDate()+i); return d })
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthDays  = Array.from({length:42},(_,i)=>{ const d=new Date(monthStart); d.setDate(d.getDate()-monthStart.getDay()+i); return d })

  const jobsForDay = (day: Date) => filtered.filter(i => i.scheduled_start && isSameDay(new Date(i.scheduled_start), day))

  const StatusDot = ({status}:{status:string}) => {
    const s = STATUS[status as keyof typeof STATUS] || STATUS.scheduled
    return <span style={{width:8,height:8,borderRadius:'50%',background:s.dot,display:'inline-block',marginRight:5,flexShrink:0}} />
  }

  const JobChip = ({item, small}:{item:ScheduleItem; small?:boolean}) => {
    const s = STATUS[item.status as keyof typeof STATUS] || STATUS.scheduled
    return (
      <div onClick={()=>setSelected(item)}
        style={{background:s.bg,border:`1px solid ${s.dot}44`,borderLeft:`3px solid ${s.dot}`,borderRadius:6,padding:small?'3px 6px':'5px 8px',cursor:'pointer',marginBottom:2,fontSize:small?10:12,color:s.color,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}
        title={`${item.title} — ${item.client_name}`}>
        <StatusDot status={item.status} />
        {item.title || item.client_name || 'Job'}
        {!small && item.scheduled_start && <span style={{opacity:0.7,marginLeft:4}}>{fmtTime(item.scheduled_start)}</span>}
      </div>
    )
  }

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',background:'#0a0f1a'}}>

      {/* ── Main ── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

        {/* Toolbar */}
        <div style={{padding:'12px 1.5rem',borderBottom:'1px solid #1e293b',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',background:'#0d1526'}}>
          <h1 style={{fontSize:20,fontWeight:700,color:'#f1f5f9',margin:0,marginRight:8}}>Schedule</h1>

          {/* View toggle */}
          <div style={{display:'flex',background:'#0f172a',borderRadius:8,border:'1px solid #1e293b',overflow:'hidden'}}>
            {VIEWS.map(v=>(
              <button key={v} onClick={()=>setView(v as any)}
                style={{padding:'6px 14px',border:'none',background:view===v?'#16a34a':'transparent',color:view===v?'#fff':'#64748b',cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'inherit'}}>
                {v}
              </button>
            ))}
          </div>

          {/* Nav arrows */}
          <button onClick={()=>{ const d=new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d); setToday(d) }}
            style={{padding:'6px 12px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#94a3b8',cursor:'pointer',fontSize:14}}>‹</button>
          <button onClick={()=>{ const d=new Date(); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0); setWeekStart(d); setToday(new Date()) }}
            style={{padding:'6px 12px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#94a3b8',cursor:'pointer',fontSize:13,fontWeight:600}}>Today</button>
          <button onClick={()=>{ const d=new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d); setToday(d) }}
            style={{padding:'6px 12px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#94a3b8',cursor:'pointer',fontSize:14}}>›</button>

          <span style={{fontSize:14,fontWeight:600,color:'#f1f5f9'}}>
            {weekStart.toLocaleDateString('en-US',{month:'long',year:'numeric'})}
          </span>

          {/* Filters */}
          <select value={divFilter} onChange={e=>setDivFilter(e.target.value)}
            style={{...inp,width:'auto',height:36,padding:'0 10px',fontSize:13}}>
            <option>All</option>{DIVS.map(d=><option key={d}>{d}</option>)}
          </select>
          <select value={empFilter} onChange={e=>setEmpFilter(e.target.value)}
            style={{...inp,width:'auto',height:36,padding:'0 10px',fontSize:13}}>
            <option value="All">All Employees</option>
            {employees.map(e=><option key={e.id} value={`${e.fname} ${e.lname}`}>{e.fname} {e.lname}</option>)}
          </select>

          <div style={{marginLeft:'auto'}}>
            <button onClick={()=>setShowAdd(true)}
              style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',fontSize:14,fontWeight:600,cursor:'pointer'}}>
              + Schedule Job
            </button>
          </div>
        </div>

        {/* Calendar body */}
        {loading ? <p style={{color:'#64748b',padding:'2rem'}}>Loading...</p> : (
          <div style={{flex:1,overflowY:'auto'}}>

            {/* WEEK VIEW */}
            {view === 'Week' && (
              <div style={{display:'grid',gridTemplateColumns:'60px repeat(7,1fr)',minHeight:'100%'}}>
                {/* Header row */}
                <div style={{background:'#0d1526',borderBottom:'1px solid #1e293b'}} />
                {weekDays.map(day => {
                  const isToday = isSameDay(day, new Date())
                  return (
                    <div key={day.toISOString()} style={{background:'#0d1526',borderBottom:'1px solid #1e293b',borderLeft:'1px solid #1e293b',padding:'8px 10px',textAlign:'center'}}>
                      <div style={{fontSize:11,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em'}}>{day.toLocaleDateString('en-US',{weekday:'short'})}</div>
                      <div style={{fontSize:20,fontWeight:700,color:isToday?'#4ade80':'#f1f5f9',width:32,height:32,borderRadius:'50%',background:isToday?'#052e16':'transparent',display:'flex',alignItems:'center',justifyContent:'center',margin:'2px auto 0'}}>
                        {day.getDate()}
                      </div>
                    </div>
                  )
                })}
                {/* Time slots */}
                {Array.from({length:12},(_,h)=>h+7).map(hour=>(
                  <>
                    <div key={`t${hour}`} style={{padding:'4px 6px',borderBottom:'1px solid #1e293b',fontSize:11,color:'#475569',textAlign:'right',background:'#0a0f1a',flexShrink:0,height:64}}>
                      {hour===12?'12pm':hour>12?`${hour-12}pm`:`${hour}am`}
                    </div>
                    {weekDays.map(day=>{
                      const dayJobs = jobsForDay(day).filter(i=>{
                        if(!i.scheduled_start) return false
                        const h2=new Date(i.scheduled_start).getHours()
                        return h2===hour
                      })
                      return (
                        <div key={`${day.toISOString()}-${hour}`}
                          style={{borderBottom:'1px solid #1e293b',borderLeft:'1px solid #1e293b',padding:'2px 4px',height:64,verticalAlign:'top',background:'#0a0f1a'}}
                          onClick={()=>{
                            const d=new Date(day); d.setHours(hour,0); 
                            setForm(f=>({...f,scheduled_start:d.toISOString().slice(0,16)}))
                            setShowAdd(true)
                          }}>
                          {dayJobs.map(j=><JobChip key={j.id} item={j} small />)}
                        </div>
                      )
                    })}
                  </>
                ))}
              </div>
            )}

            {/* DAY VIEW */}
            {view === 'Day' && (
              <div>
                <div style={{padding:'12px 1.5rem',borderBottom:'1px solid #1e293b',fontSize:16,fontWeight:700,color:'#f1f5f9'}}>
                  {today.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
                </div>
                <div style={{padding:'1rem 1.5rem',display:'flex',flexDirection:'column',gap:8}}>
                  {jobsForDay(today).length===0 ? (
                    <p style={{color:'#475569',textAlign:'center',padding:'3rem'}}>No jobs scheduled for today</p>
                  ) : jobsForDay(today).sort((a,b)=>a.scheduled_start.localeCompare(b.scheduled_start)).map(item=>{
                    const s = STATUS[item.status as keyof typeof STATUS] || STATUS.scheduled
                    return (
                      <div key={item.id} onClick={()=>setSelected(item)}
                        style={{background:'#0f172a',border:`1px solid ${s.dot}44`,borderLeft:`4px solid ${s.dot}`,borderRadius:10,padding:'1rem',cursor:'pointer'}}
                        onMouseEnter={e=>(e.currentTarget.style.background='#111c2d')}
                        onMouseLeave={e=>(e.currentTarget.style.background='#0f172a')}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                          <div>
                            <p style={{margin:'0 0 4px',fontSize:15,fontWeight:700,color:'#f1f5f9'}}>{item.title||'Untitled Job'}</p>
                            <p style={{margin:'0 0 4px',fontSize:13,color:'#94a3b8'}}>{item.client_name}</p>
                            {item.address && <p style={{margin:0,fontSize:12,color:'#64748b'}}>📍 {item.address}</p>}
                          </div>
                          <div style={{textAlign:'right'}}>
                            <span style={{background:s.bg,color:s.color,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700}}>{item.status}</span>
                            <p style={{margin:'6px 0 0',fontSize:12,color:'#64748b'}}>{item.scheduled_start?fmtTime(item.scheduled_start):''}{item.scheduled_end?` – ${fmtTime(item.scheduled_end)}`:''}</p>
                          </div>
                        </div>
                        {item.assigned_to && <p style={{margin:'8px 0 0',fontSize:12,color:'#475569'}}>👤 {item.assigned_to}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* MONTH VIEW */}
            {view === 'Month' && (
              <div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:'1px solid #1e293b'}}>
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>(
                    <div key={d} style={{padding:'8px',textAlign:'center',fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',background:'#0d1526'}}>{d}</div>
                  ))}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
                  {monthDays.map((day,i)=>{
                    const isCurrentMonth = day.getMonth()===today.getMonth()
                    const isToday2 = isSameDay(day,new Date())
                    const dayJobs = jobsForDay(day)
                    return (
                      <div key={i} style={{minHeight:100,borderRight:'1px solid #1e293b',borderBottom:'1px solid #1e293b',padding:'4px',background:isCurrentMonth?'#0a0f1a':'#080d16',opacity:isCurrentMonth?1:0.4}}>
                        <div style={{fontSize:13,fontWeight:700,color:isToday2?'#4ade80':'#94a3b8',width:24,height:24,borderRadius:'50%',background:isToday2?'#052e16':'transparent',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:4}}>
                          {day.getDate()}
                        </div>
                        {dayJobs.slice(0,3).map(j=><JobChip key={j.id} item={j} small />)}
                        {dayJobs.length>3 && <div style={{fontSize:10,color:'#64748b',padding:'1px 4px'}}>+{dayJobs.length-3} more</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* LIST VIEW */}
            {view === 'List' && (
              <div style={{padding:'1rem 1.5rem'}}>
                {filtered.length===0 ? (
                  <p style={{color:'#475569',textAlign:'center',padding:'3rem'}}>No scheduled jobs</p>
                ) : Object.entries(
                    filtered.reduce((acc,i)=>{
                      const d=i.scheduled_start?i.scheduled_start.split('T')[0]:'No date'
                      if(!acc[d]) acc[d]=[]
                      acc[d].push(i)
                      return acc
                    },{} as Record<string,ScheduleItem[]>)
                  ).sort(([a],[b])=>a.localeCompare(b)).map(([date,jobs])=>(
                    <div key={date} style={{marginBottom:'1.5rem'}}>
                      <h3 style={{fontSize:13,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 8px',padding:'0 0 6px',borderBottom:'1px solid #1e293b'}}>
                        {date==='No date'?'No date':new Date(date+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
                      </h3>
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        {jobs.map(item=>{
                          const s=STATUS[item.status as keyof typeof STATUS]||STATUS.scheduled
                          return (
                            <div key={item.id} onClick={()=>setSelected(item)}
                              style={{background:'#0f172a',border:`1px solid #1e293b`,borderLeft:`3px solid ${s.dot}`,borderRadius:10,padding:'10px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:14}}
                              onMouseEnter={e=>(e.currentTarget.style.background='#111c2d')}
                              onMouseLeave={e=>(e.currentTarget.style.background='#0f172a')}>
                              <div style={{flex:1}}>
                                <p style={{margin:'0 0 2px',fontSize:14,fontWeight:600,color:'#f1f5f9'}}>{item.title||'Untitled'}</p>
                                <p style={{margin:0,fontSize:12,color:'#64748b'}}>{item.client_name} {item.address?`· 📍 ${item.address}`:''}</p>
                              </div>
                              <div style={{textAlign:'right',flexShrink:0}}>
                                <span style={{background:s.bg,color:s.color,padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:700}}>{item.status}</span>
                                <p style={{margin:'4px 0 0',fontSize:12,color:'#64748b'}}>{item.scheduled_start?fmtTime(item.scheduled_start):''}</p>
                              </div>
                              {item.assigned_to && <div style={{fontSize:12,color:'#475569',flexShrink:0}}>👤 {item.assigned_to}</div>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Job detail panel ── */}
      {selected && (
        <div style={{width:340,borderLeft:'1px solid #1e293b',background:'#0d1526',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'1rem',borderBottom:'1px solid #1e293b',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <h2 style={{fontSize:16,fontWeight:700,color:'#f1f5f9',margin:0}}>{selected.title||'Job Details'}</h2>
            <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',color:'#64748b',fontSize:20,cursor:'pointer',lineHeight:1}}>×</button>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'1rem'}}>
            {[
              {label:'Client',   value:selected.client_name},
              {label:'Address',  value:selected.address},
              {label:'Division', value:selected.division},
              {label:'Assigned', value:selected.assigned_to},
              {label:'Start',    value:selected.scheduled_start?`${fmtDate(selected.scheduled_start)} ${fmtTime(selected.scheduled_start)}`:''},
              {label:'End',      value:selected.scheduled_end?fmtTime(selected.scheduled_end):''},
              {label:'Notes',    value:selected.notes},
            ].filter(r=>r.value).map(r=>(
              <div key={r.label} style={{marginBottom:'0.75rem'}}>
                <p style={{margin:'0 0 2px',fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.04em'}}>{r.label}</p>
                <p style={{margin:0,fontSize:14,color:'#f1f5f9'}}>{r.value}</p>
              </div>
            ))}
            <div style={{marginBottom:'1rem'}}>
              <p style={{...lbl,marginBottom:8}}>Status</p>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {Object.keys(STATUS).map(s=>{
                  const st=STATUS[s as keyof typeof STATUS]
                  return (
                    <button key={s} onClick={()=>handleStatusChange(selected.id,s)}
                      style={{padding:'5px 12px',borderRadius:20,fontSize:12,fontWeight:700,cursor:'pointer',border:`1px solid ${selected.status===s?st.dot:'#334155'}`,background:selected.status===s?st.bg:'transparent',color:selected.status===s?st.color:'#64748b',fontFamily:'inherit'}}>
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>
            {/* Route map placeholder */}
            {selected.address && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.address)}`} target="_blank" rel="noreferrer"
                style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'#0f172a',border:'1px solid #1e293b',borderRadius:10,color:'#60a5fa',fontSize:13,textDecoration:'none',fontWeight:600}}>
                🗺️ Open in Google Maps
              </a>
            )}
          </div>
          <div style={{padding:'1rem',borderTop:'1px solid #1e293b',display:'flex',gap:8}}>
            <button onClick={()=>handleDelete(selected.id)}
              style={{flex:1,padding:'9px',background:'#450a0a',border:'1px solid #7f1d1d',borderRadius:8,color:'#fca5a5',cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'inherit'}}>
              Delete
            </button>
          </div>
        </div>
      )}

      {/* ── Add modal ── */}
      {showAdd && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'1rem'}}>
          <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:20,padding:'2rem',width:'100%',maxWidth:540,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
              <h2 style={{fontSize:18,fontWeight:700,color:'#f1f5f9',margin:0}}>Schedule a Job</h2>
              <button onClick={()=>setShowAdd(false)} style={{background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer',lineHeight:1}}>×</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:'1rem'}}>
              <div style={{gridColumn:'1/-1'}}>
                <label style={lbl}>Job Title *</label>
                <input placeholder="e.g. Lawn maintenance" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} style={inp} />
              </div>
              <div>
                <label style={lbl}>Client Name</label>
                <input placeholder="Client" value={form.client_name} onChange={e=>setForm({...form,client_name:e.target.value})} style={inp} />
              </div>
              <div>
                <label style={lbl}>Division</label>
                <select value={form.division} onChange={e=>setForm({...form,division:e.target.value})} style={{...inp,padding:'0 10px'}}>
                  {DIVS.map(d=><option key={d}>{d}</option>)}
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label style={lbl}>Address</label>
                <input placeholder="123 Main St, Lake Park, FL" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} style={inp} />
              </div>
              <div>
                <label style={lbl}>Start *</label>
                <input type="datetime-local" value={form.scheduled_start} onChange={e=>setForm({...form,scheduled_start:e.target.value})} style={inp} />
              </div>
              <div>
                <label style={lbl}>End</label>
                <input type="datetime-local" value={form.scheduled_end} onChange={e=>setForm({...form,scheduled_end:e.target.value})} style={inp} />
              </div>
              <div>
                <label style={lbl}>Assign To</label>
                <select value={form.assigned_to} onChange={e=>setForm({...form,assigned_to:e.target.value})} style={{...inp,padding:'0 10px'}}>
                  <option value="">Unassigned</option>
                  {employees.map(e=><option key={e.id} value={`${e.fname} ${e.lname}`}>{e.fname} {e.lname}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{...inp,padding:'0 10px'}}>
                  {Object.keys(STATUS).map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label style={lbl}>Notes</label>
                <textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}
                  style={{...inp,height:70,padding:'10px 12px',resize:'vertical' as const}} />
              </div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowAdd(false)} style={{padding:'10px 22px',border:'1px solid #334155',borderRadius:10,background:'transparent',color:'#cbd5e1',cursor:'pointer',fontSize:14,fontFamily:'inherit'}}>Cancel</button>
              <button onClick={handleSave} style={{padding:'10px 22px',border:'none',borderRadius:10,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700,fontFamily:'inherit'}}>Save Job</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
