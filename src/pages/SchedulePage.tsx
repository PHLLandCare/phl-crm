import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface ScheduleItem {
  id: string
  title: string
  client_name: string
  phone?: string
  email?: string
  address: string
  scheduled_start: string
  scheduled_end: string
  status: string
  assigned_to: string
  division: string
  notes: string
  line_items?: { name: string; description: string; qty: number }[]
  job_number?: string
}

interface Employee { id: string; fname: string; lname: string; division: string }

const STATUS_STYLE = {
  scheduled:   { bg:'#0c1a2e', color:'#7dd3fc', dot:'#0ea5e9' },
  dispatched:  { bg:'#1a1000', color:'#fcd34d', dot:'#d97706' },
  in_progress: { bg:'#1a0533', color:'#d8b4fe', dot:'#9333ea' },
  completed:   { bg:'#052e16', color:'#4ade80', dot:'#16a34a' },
  missed:      { bg:'#450a0a', color:'#fca5a5', dot:'#ef4444' },
}
const DIVS  = ['Lawn & Tree','Irrigation','Extermination','Nursery','Farm']
const VIEWS = ['Day','Week','Month','List']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const inp = {width:'100%',height:42,padding:'0 12px',background:'#1e293b',border:'1.5px solid #334155',borderRadius:8,fontSize:14,boxSizing:'border-box' as const,outline:'none',color:'#f1f5f9',fontFamily:'inherit'}
const lbl = {fontSize:12,fontWeight:600 as const,color:'#94a3b8',textTransform:'uppercase' as const,letterSpacing:'0.04em',display:'block',marginBottom:6}

function fmtTime(ts: string) { return new Date(ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) }
function fmtDate(ts: string) { return new Date(ts).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) }
function fmtDateFull(ts: string) { return new Date(ts).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) }
function isSameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate() }

export default function SchedulePage() {
  const navigate = useNavigate()
  const [items, setItems]         = useState<ScheduleItem[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState<'Day'|'Week'|'Month'|'List'>('Month')
  const [today, setToday]         = useState(new Date())
  const [currentDate, setCurrentDate] = useState(new Date())
  const [weekStart, setWeekStart] = useState(() => { const d=new Date(); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0); return d })
  const [showAdd, setShowAdd]     = useState(false)
  const [addDate, setAddDate]     = useState<Date|null>(null)
  const [divFilter, setDivFilter] = useState('All')
  const [empFilter, setEmpFilter] = useState('All')

  // Day-click context menu
  const [dayMenu, setDayMenu]     = useState<{day: Date; x: number; y: number}|null>(null)
  const dayMenuRef = useRef<HTMLDivElement>(null)

  // Selected visit detail
  const [selected, setSelected]   = useState<ScheduleItem|null>(null)
  const [detailTab, setDetailTab] = useState<'info'|'client'|'notes'>('info')
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [noteText, setNoteText]   = useState('')
  const [savedNotes, setSavedNotes] = useState<{text:string; author:string; date:string}[]>([])

  // Month/year mini-calendar
  const [showMiniCal, setShowMiniCal] = useState(false)
  const [miniCalYear, setMiniCalYear] = useState(new Date().getFullYear())
  const [miniCalMonth, setMiniCalMonth] = useState(new Date().getMonth())

  const [form, setForm] = useState({
    title:'', client_name:'', address:'', phone:'', scheduled_start:'', scheduled_end:'',
    status:'scheduled', assigned_to:'', division:'Lawn & Tree', notes:'', job_number:''
  })

  const load = async () => {
    setLoading(true)
    const [sRes, eRes] = await Promise.all([
      supabase.from('schedules').select('*').order('scheduled_start'),
      supabase.from('employees').select('id,fname,lname,division').eq('active',true).order('fname'),
    ])
    setItems(sRes.data ?? [])
    setEmployees(eRes.data ?? [])
    // Also pull jobs as schedule items
    const { data: jobs } = await supabase.from('jobs').select('*').is('deleted_at',null).not('scheduled_start','is',null)
    if (jobs) {
      const jobItems: ScheduleItem[] = jobs.map((j:any) => ({
        id: `job-${j.id}`, title: j.title, client_name: j.client_name || '',
        phone: j.phone || '', email: j.email || '',
        address: [j.service_address, j.city, j.state, j.zip].filter(Boolean).join(', '),
        scheduled_start: j.scheduled_start, scheduled_end: j.scheduled_end || j.scheduled_start,
        status: j.status || 'scheduled', assigned_to: j.assigned_name || '',
        division: j.job_type || 'Lawn & Tree', notes: j.instructions || '',
        job_number: j.job_number,
      }))
      setItems(prev => {
        const ids = new Set(prev.map(i=>i.id))
        return [...prev, ...jobItems.filter(j=>!ids.has(j.id))]
      })
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('schedules').on('postgres_changes',{event:'*',schema:'public',table:'schedules'},load).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dayMenuRef.current && !dayMenuRef.current.contains(e.target as Node)) {
        setDayMenu(null)
      }
      setShowMoreActions(false)
      setShowMiniCal(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSave = async () => {
    if (!form.scheduled_start || !form.title) return
    const start = addDate && !form.scheduled_start
      ? new Date(addDate.setHours(8,0,0,0)).toISOString()
      : form.scheduled_start
    await supabase.from('schedules').insert({ ...form, scheduled_start: start, phone: form.phone })
    setShowAdd(false)
    setAddDate(null)
    setForm({title:'',client_name:'',address:'',phone:'',scheduled_start:'',scheduled_end:'',status:'scheduled',assigned_to:'',division:'Lawn & Tree',notes:'',job_number:''})
    load()
  }

  const handleMarkComplete = async (item: ScheduleItem) => {
    const newStatus = item.status === 'completed' ? 'scheduled' : 'completed'
    if (!item.id.startsWith('job-')) {
      await supabase.from('schedules').update({ status: newStatus }).eq('id', item.id)
    } else {
      const jobId = item.id.replace('job-','')
      await supabase.from('jobs').update({ status: newStatus === 'completed' ? 'completed' : 'scheduled', updated_at: new Date().toISOString() }).eq('id', jobId)
    }
    setSelected(s => s ? { ...s, status: newStatus } : null)
    load()
  }

  const handleDelete = async (item: ScheduleItem) => {
    if (!confirm('Delete this visit?')) return
    if (!item.id.startsWith('job-')) {
      await supabase.from('schedules').delete().eq('id', item.id)
    }
    setSelected(null)
    load()
  }

  const handleSaveNote = () => {
    if (!noteText.trim()) return
    setSavedNotes(prev => [...prev, { text: noteText, author: 'Jesenia Fagarass', date: new Date().toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}) }])
    setNoteText('')
  }

  const openDayMenu = (day: Date, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDayMenu({ day, x: rect.left, y: rect.bottom + 4 })
  }

  const openVisit = (item: ScheduleItem) => {
    setSelected(item)
    setDetailTab('info')
    setShowMoreActions(false)
    setSavedNotes([])
    setNoteText('')
  }

  const filtered = items.filter(i => {
    if (divFilter !== 'All' && i.division !== divFilter) return false
    if (empFilter !== 'All' && i.assigned_to !== empFilter) return false
    return true
  })

  const weekDays = Array.from({length:7},(_,n)=>{ const d=new Date(weekStart); d.setDate(d.getDate()+n); return d })
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const monthDays  = Array.from({length:42},(_,n)=>{ const d=new Date(monthStart); d.setDate(d.getDate()-monthStart.getDay()+n); return d })
  const jobsForDay = (day: Date) => filtered.filter(i => i.scheduled_start && isSameDay(new Date(i.scheduled_start), day))

  const st = (status: string) => STATUS_STYLE[status as keyof typeof STATUS_STYLE] || STATUS_STYLE.scheduled

  const navigate_date = (dir: number) => {
    if (view === 'Week') {
      const d = new Date(weekStart); d.setDate(d.getDate() + dir*7); setWeekStart(d); setCurrentDate(d)
    } else if (view === 'Month') {
      const d = new Date(currentDate); d.setMonth(d.getMonth() + dir); setCurrentDate(d)
    } else if (view === 'Day') {
      const d = new Date(currentDate); d.setDate(d.getDate() + dir); setCurrentDate(d)
    }
  }

  const headerLabel = () => {
    if (view === 'Week') return `${weekStart.toLocaleDateString('en-US',{month:'long',year:'numeric'})}`
    if (view === 'Month') return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    if (view === 'Day') return currentDate.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})
    return 'Schedule'
  }

  const JobChip = ({item, small}:{item:ScheduleItem; small?:boolean}) => {
    const s = st(item.status)
    return (
      <div onClick={e=>{e.stopPropagation();openVisit(item)}}
        style={{background:s.bg,border:`1px solid ${s.dot}44`,borderLeft:`3px solid ${s.dot}`,borderRadius:5,padding:small?'3px 7px':'5px 8px',cursor:'pointer',marginBottom:2,fontSize:small?10:12,color:s.color,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',display:'flex',alignItems:'center',gap:4}}>
        <span style={{width:7,height:7,borderRadius:'50%',background:s.dot,flexShrink:0,display:'inline-block'}}/>
        <span style={{overflow:'hidden',textOverflow:'ellipsis',flex:1}}>{item.client_name || item.title || 'Visit'}</span>
        {!small && item.scheduled_start && <span style={{opacity:0.6,fontSize:10,flexShrink:0}}>{fmtTime(item.scheduled_start)}</span>}
      </div>
    )
  }

  // Day context menu options (Jobber-style)
  const DAY_MENU_OPTIONS = [
    { icon:'🔧', label:'New Job',            action:(day:Date)=>{ navigate('/jobs',{state:{openCreate:true,scheduleDate:day.toISOString()}}) } },
    { icon:'📬', label:'New Request',        action:(day:Date)=>{ navigate('/requests',{state:{openCreate:true}}) } },
    { icon:'✅', label:'New Task',            action:(day:Date)=>{ setAddDate(day); const d=new Date(day); d.setHours(8,0,0,0); setForm(f=>({...f,title:'Task',scheduled_start:d.toISOString().slice(0,16),scheduled_end:new Date(d.getTime()+60*60000).toISOString().slice(0,16)})); setShowAdd(true) } },
    { icon:'📅', label:'New Calendar Event', action:(day:Date)=>{ setAddDate(day); const d=new Date(day); d.setHours(9,0,0,0); setForm(f=>({...f,title:'',scheduled_start:d.toISOString().slice(0,16),scheduled_end:new Date(d.getTime()+60*60000).toISOString().slice(0,16)})); setShowAdd(true) } },
    null,
    { icon:'📋', label:'Show on Day View',   action:(day:Date)=>{ setCurrentDate(day); setView('Day') } },
    { icon:'📍', label:'Show on Map View',   action:(_day:Date)=>{ navigate('/routes') } },
  ]

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',background:'#0a0f1a',position:'relative'}}>

      {/* ── Main ── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

        {/* Toolbar */}
        <div style={{padding:'10px 1.5rem',borderBottom:'1px solid #1e293b',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',background:'#0d1526',minHeight:52}}>
          <h1 style={{fontSize:18,fontWeight:700,color:'#f1f5f9',margin:0,marginRight:4}}>Schedule</h1>

          {/* View toggle */}
          <div style={{display:'flex',background:'#0f172a',borderRadius:8,border:'1px solid #1e293b',overflow:'hidden'}}>
            {VIEWS.map(v=>(
              <button key={v} onClick={()=>setView(v as any)}
                style={{padding:'5px 12px',border:'none',background:view===v?'#16a34a':'transparent',color:view===v?'#fff':'#64748b',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit'}}>
                {v}
              </button>
            ))}
          </div>

          {/* Nav */}
          <button onClick={()=>navigate_date(-1)} style={{padding:'5px 11px',background:'#1e293b',border:'1px solid #334155',borderRadius:7,color:'#94a3b8',cursor:'pointer',fontSize:14}}>‹</button>
          <button onClick={()=>{ setCurrentDate(new Date()); const d=new Date(); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0); setWeekStart(d) }}
            style={{padding:'5px 11px',background:'#1e293b',border:'1px solid #334155',borderRadius:7,color:'#94a3b8',cursor:'pointer',fontSize:12,fontWeight:600}}>Today</button>
          <button onClick={()=>navigate_date(1)} style={{padding:'5px 11px',background:'#1e293b',border:'1px solid #334155',borderRadius:7,color:'#94a3b8',cursor:'pointer',fontSize:14}}>›</button>

          {/* Month/year label — clickable to show mini-calendar */}
          <div style={{position:'relative'}}>
            <button onClick={e=>{e.stopPropagation();setMiniCalYear(currentDate.getFullYear());setMiniCalMonth(currentDate.getMonth());setShowMiniCal(v=>!v)}}
              style={{padding:'5px 12px',background:'none',border:'1px solid #334155',borderRadius:7,color:'#f1f5f9',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit',display:'flex',alignItems:'center',gap:6}}>
              {headerLabel()} <span style={{fontSize:10,color:'#64748b'}}>▾</span>
            </button>
            {showMiniCal && (
              <div onClick={e=>e.stopPropagation()} style={{position:'absolute',top:'100%',left:0,marginTop:4,background:'#0d1526',border:'1px solid #1e293b',borderRadius:12,zIndex:300,padding:16,width:260,boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <button onClick={()=>{ if(miniCalMonth===0){setMiniCalMonth(11);setMiniCalYear(y=>y-1)}else setMiniCalMonth(m=>m-1) }} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:16}}>‹</button>
                  <span style={{fontSize:14,fontWeight:700,color:'#f1f5f9'}}>{MONTHS[miniCalMonth]} {miniCalYear} <span style={{fontSize:10,color:'#64748b'}}>▾</span></span>
                  <button onClick={()=>{ if(miniCalMonth===11){setMiniCalMonth(0);setMiniCalYear(y=>y+1)}else setMiniCalMonth(m=>m+1) }} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:16}}>›</button>
                </div>
                {/* Day headers */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4}}>
                  {['SU','MO','TU','WE','TH','FR','SA'].map(d=><div key={d} style={{textAlign:'center',fontSize:9,fontWeight:700,color:'#475569'}}>{d}</div>)}
                </div>
                {/* Days */}
                {(() => {
                  const ms = new Date(miniCalYear, miniCalMonth, 1)
                  const days = Array.from({length:35},(_,n)=>{ const d=new Date(ms); d.setDate(d.getDate()-ms.getDay()+n); return d })
                  return (
                    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
                      {days.map((d,i)=>{
                        const isThisMonth = d.getMonth()===miniCalMonth
                        const isToday = isSameDay(d,new Date())
                        const isSel = isSameDay(d, currentDate)
                        return (
                          <button key={i} onClick={()=>{ setCurrentDate(new Date(d)); const ws=new Date(d); ws.setDate(ws.getDate()-ws.getDay()); ws.setHours(0,0,0,0); setWeekStart(ws); setShowMiniCal(false) }}
                            style={{padding:'4px 0',borderRadius:6,border:'none',background:isSel?'#16a34a':isToday?'#052e16':'transparent',color:!isThisMonth?'#334155':isToday?'#4ade80':isSel?'#fff':'#f1f5f9',cursor:'pointer',fontSize:12,fontWeight:isToday||isSel?700:400,fontFamily:'inherit'}}>
                            {d.getDate()}
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

          {/* Filters */}
          <select value={divFilter} onChange={e=>setDivFilter(e.target.value)} style={{...inp,width:'auto',height:32,padding:'0 10px',fontSize:12}}>
            <option>All</option>{DIVS.map(d=><option key={d}>{d}</option>)}
          </select>
          <select value={empFilter} onChange={e=>setEmpFilter(e.target.value)} style={{...inp,width:'auto',height:32,padding:'0 10px',fontSize:12}}>
            <option value="All">All Employees</option>
            {employees.map(e=><option key={e.id} value={`${e.fname} ${e.lname}`}>{e.fname} {e.lname}</option>)}
          </select>

          {/* More Actions dropdown */}
          <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center',position:'relative'}}>
            <div style={{position:'relative'}}>
              <button onClick={e=>{e.stopPropagation();setShowMoreActions(v=>!v)}}
                style={{padding:'6px 14px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit',display:'flex',alignItems:'center',gap:6}}>
                ··· More Actions
              </button>
              {showMoreActions && (
                <div onClick={e=>e.stopPropagation()} style={{position:'absolute',top:'100%',right:0,marginTop:4,background:'#0d1526',border:'1px solid #1e293b',borderRadius:10,zIndex:200,minWidth:200,overflow:'hidden',boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
                  <p style={{margin:0,padding:'8px 14px 4px',fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.06em'}}>Create New...</p>
                  {[
                    {icon:'🔧',label:'Job',action:()=>{setShowMoreActions(false);navigate('/jobs',{state:{openCreate:true}})}},
                    {icon:'📬',label:'Request',action:()=>{setShowMoreActions(false);navigate('/requests',{state:{openCreate:true}})}},
                    {icon:'✅',label:'Task',action:()=>{setShowMoreActions(false);setShowAdd(true)}},
                    {icon:'📅',label:'Calendar Event',action:()=>{setShowMoreActions(false);setShowAdd(true)}},
                    {icon:'🚚',label:'Visits',action:()=>{setShowMoreActions(false)}},
                  ].map(item=>(
                    <button key={item.label} onClick={item.action}
                      style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 14px',background:'none',border:'none',color:'#f1f5f9',fontSize:13,cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                      {item.icon} {item.label}
                    </button>
                  ))}
                  <div style={{borderTop:'1px solid #1e293b',marginTop:4,paddingTop:4}}>
                    {[
                      {icon:'🚚',label:'Move Visits',action:()=>setShowMoreActions(false)},
                      {icon:'📥',label:'Import Jobs',action:()=>setShowMoreActions(false)},
                      {icon:'🔄',label:'Set Up Calendar Sync',action:()=>setShowMoreActions(false)},
                    ].map(item=>(
                      <button key={item.label} onClick={item.action}
                        style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 14px',background:'none',border:'none',color:'#f1f5f9',fontSize:13,cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}
                        onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                        {item.icon} {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={()=>setShowAdd(true)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
              + Schedule
            </button>
          </div>
        </div>

        {/* Calendar body */}
        {loading ? <p style={{color:'#64748b',padding:'2rem'}}>Loading...</p> : (
          <div style={{flex:1,overflowY:'auto'}}>

            {/* MONTH VIEW */}
            {view === 'Month' && (
              <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
                {/* Day-of-week headers */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',background:'#0d1526',borderBottom:'1px solid #1e293b'}}>
                  {['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d=>(
                    <div key={d} style={{padding:'8px 12px',fontSize:11,fontWeight:700,color:'#475569',textAlign:'center',letterSpacing:'0.05em'}}>{d}</div>
                  ))}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',flex:1,gridAutoRows:'1fr'}}>
                  {monthDays.map((day, i) => {
                    const isThisMonth = day.getMonth() === currentDate.getMonth()
                    const isToday2 = isSameDay(day, new Date())
                    const dayJobs = jobsForDay(day)
                    return (
                      <div key={i}
                        style={{borderRight:'1px solid #1e293b',borderBottom:'1px solid #1e293b',padding:'6px 8px',minHeight:100,background:isThisMonth?'transparent':'rgba(0,0,0,0.15)',position:'relative',cursor:'pointer'}}
                        onClick={e => openDayMenu(day, e)}>
                        {/* Date number */}
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{fontSize:13,fontWeight:isToday2?700:400,color:isToday2?'#fff':isThisMonth?'#f1f5f9':'#334155',width:26,height:26,borderRadius:'50%',background:isToday2?'#16a34a':'transparent',display:'flex',alignItems:'center',justifyContent:'center'}}>
                            {day.getDate()}
                          </span>
                        </div>
                        {/* Jobs chips */}
                        {dayJobs.slice(0,3).map(item => <JobChip key={item.id} item={item} small />)}
                        {dayJobs.length > 3 && <div style={{fontSize:10,color:'#64748b',marginTop:2}}>{dayJobs.length-3} more...</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* WEEK VIEW */}
            {view === 'Week' && (
              <div style={{display:'grid',gridTemplateColumns:'56px repeat(7,1fr)',minHeight:'100%'}}>
                <div style={{background:'#0d1526',borderBottom:'1px solid #1e293b',borderRight:'1px solid #1e293b'}} />
                {weekDays.map(day => {
                  const isToday2 = isSameDay(day, new Date())
                  return (
                    <div key={day.toISOString()} style={{background:'#0d1526',borderBottom:'1px solid #1e293b',borderLeft:'1px solid #1e293b',padding:'8px 10px',textAlign:'center',cursor:'pointer'}} onClick={e=>openDayMenu(day,e)}>
                      <div style={{fontSize:10,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em'}}>{day.toLocaleDateString('en-US',{weekday:'short'})}</div>
                      <div style={{fontSize:18,fontWeight:700,color:isToday2?'#4ade80':'#f1f5f9',width:30,height:30,borderRadius:'50%',background:isToday2?'#052e16':'transparent',display:'flex',alignItems:'center',justifyContent:'center',margin:'2px auto 0'}}>
                        {day.getDate()}
                      </div>
                    </div>
                  )
                })}
                {/* Time slots */}
                {Array.from({length:12},(_,h)=>h+7).map(hour=>(
                  <>
                    <div key={`t${hour}`} style={{borderBottom:'1px solid #1e293b',borderRight:'1px solid #1e293b',padding:'4px 6px',background:'#0a0f1a',minHeight:56}}>
                      <span style={{fontSize:10,color:'#475569'}}>{hour>12?hour-12:hour}{hour>=12?'pm':'am'}</span>
                    </div>
                    {weekDays.map(day => {
                      const dayJobsHour = jobsForDay(day).filter(i=>{
                        if(!i.scheduled_start) return false
                        const h2=new Date(i.scheduled_start).getHours()
                        return h2===hour
                      })
                      return (
                        <div key={`${day.toISOString()}-${hour}`}
                          style={{borderBottom:'1px solid #1e293b',borderLeft:'1px solid #1e293b',padding:'2px 4px',background:'#0a0f1a',minHeight:56,cursor:'pointer'}}
                          onClick={e=>{e.stopPropagation();const d=new Date(day);d.setHours(hour,0,0,0);openDayMenu(d,e)}}>
                          {dayJobsHour.map(item=><JobChip key={item.id} item={item} />)}
                        </div>
                      )
                    })}
                  </>
                ))}
              </div>
            )}

            {/* DAY VIEW */}
            {view === 'Day' && (
              <div style={{padding:'1rem'}}>
                <h2 style={{fontSize:16,fontWeight:700,color:'#f1f5f9',marginBottom:16}}>{fmtDate(currentDate.toISOString())}</h2>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {jobsForDay(currentDate).length === 0 ? (
                    <div style={{textAlign:'center',padding:'3rem',color:'#475569'}}>
                      <div style={{fontSize:32,marginBottom:8}}>📅</div>
                      <p style={{margin:0,fontSize:14}}>No visits scheduled for this day</p>
                      <button onClick={()=>setShowAdd(true)} style={{marginTop:12,padding:'8px 20px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ Add</button>
                    </div>
                  ) : jobsForDay(currentDate).map(item=>(
                    <div key={item.id} onClick={()=>openVisit(item)}
                      style={{background:'#0f172a',border:`1px solid ${st(item.status).dot}44`,borderLeft:`4px solid ${st(item.status).dot}`,borderRadius:10,padding:'12px 16px',cursor:'pointer',display:'flex',alignItems:'flex-start',gap:12}}
                      onMouseEnter={e=>(e.currentTarget.style.background='#111c2d')} onMouseLeave={e=>(e.currentTarget.style.background='#0f172a')}>
                      <div style={{flex:1}}>
                        <p style={{margin:'0 0 2px',fontSize:14,fontWeight:700,color:'#f1f5f9'}}>{item.client_name || item.title}</p>
                        <p style={{margin:'0 0 4px',fontSize:12,color:'#64748b'}}>{item.title}</p>
                        {item.address && <p style={{margin:0,fontSize:12,color:'#475569'}}>📍 {item.address}</p>}
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <span style={{background:st(item.status).bg,color:st(item.status).color,padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:700}}>{item.status}</span>
                        {item.scheduled_start && <p style={{margin:'4px 0 0',fontSize:12,color:'#64748b'}}>{fmtTime(item.scheduled_start)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LIST VIEW */}
            {view === 'List' && (
              <div style={{padding:'1rem'}}>
                {filtered.length === 0 ? (
                  <div style={{textAlign:'center',padding:'3rem',color:'#475569'}}><div style={{fontSize:32,marginBottom:8}}>📋</div><p>No scheduled visits</p></div>
                ) : filtered.map(item=>(
                  <div key={item.id} onClick={()=>openVisit(item)}
                    style={{background:'#0f172a',border:'1px solid #1e293b',borderLeft:`4px solid ${st(item.status).dot}`,borderRadius:10,padding:'12px 16px',cursor:'pointer',marginBottom:8,display:'flex',alignItems:'flex-start',gap:12}}
                    onMouseEnter={e=>(e.currentTarget.style.background='#111c2d')} onMouseLeave={e=>(e.currentTarget.style.background='#0f172a')}>
                    <div style={{flex:1}}>
                      <p style={{margin:'0 0 2px',fontSize:14,fontWeight:700,color:'#f1f5f9'}}>{item.client_name || item.title}</p>
                      <p style={{margin:'0 0 2px',fontSize:12,color:'#64748b'}}>{item.title}{item.job_number?` — Job # ${item.job_number}`:''}</p>
                      {item.address && <p style={{margin:0,fontSize:12,color:'#475569'}}>📍 {item.address}</p>}
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <span style={{background:st(item.status).bg,color:st(item.status).color,padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:700}}>{item.status}</span>
                      {item.scheduled_start && <p style={{margin:'4px 0 0',fontSize:12,color:'#64748b'}}>{fmtDate(item.scheduled_start)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Day context menu ── */}
      {dayMenu && (
        <div ref={dayMenuRef}
          style={{position:'fixed',top:dayMenu.y,left:Math.min(dayMenu.x,window.innerWidth-220),background:'#0d1526',border:'1px solid #1e293b',borderRadius:10,zIndex:400,minWidth:210,overflow:'hidden',boxShadow:'0 8px 32px rgba(0,0,0,0.6)'}}>
          <p style={{margin:0,padding:'10px 14px 6px',fontSize:12,fontWeight:700,color:'#f1f5f9'}}>
            Add to {dayMenu.day.toLocaleDateString('en-US',{month:'long',day:'numeric'})}
          </p>
          <div style={{borderTop:'1px solid #1e293b',marginBottom:4}} />
          {DAY_MENU_OPTIONS.map((opt, i) => opt === null ? (
            <div key={i} style={{borderTop:'1px solid #1e293b',margin:'4px 0'}} />
          ) : (
            <button key={opt.label} onClick={()=>{opt.action(dayMenu.day);setDayMenu(null)}}
              style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 14px',background:'none',border:'none',color:'#f1f5f9',fontSize:13,cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}
              onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
              <span style={{fontSize:16}}>{opt.icon}</span> {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Visit Detail Panel (Jobber-style popup) ── */}
      {selected && (
        <>
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:500}} onClick={()=>setSelected(null)} />
          <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(580px,95vw)',maxHeight:'90vh',overflowY:'auto',background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:501,display:'flex',flexDirection:'column'}}>

            {/* Header */}
            <div style={{padding:'16px 20px',borderBottom:'1px solid #1e293b',display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
              <div style={{flex:1}}>
                <h2 style={{margin:'0 0 6px',fontSize:16,fontWeight:700,color:'#f1f5f9',lineHeight:1.3}}>
                  {selected.client_name && selected.title ? `${selected.client_name} — ${selected.title}` : selected.title || selected.client_name || 'Visit'}
                </h2>
                <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
                  {selected.scheduled_start && (
                    <span style={{display:'flex',alignItems:'center',gap:5,fontSize:13,color:'#94a3b8'}}>
                      📅 {fmtDateFull(selected.scheduled_start)} {selected.status==='scheduled'?'Anytime':fmtTime(selected.scheduled_start)}
                    </span>
                  )}
                  {selected.phone && <a href={`tel:${selected.phone}`} style={{display:'flex',alignItems:'center',gap:5,fontSize:13,color:'#4ade80',textDecoration:'none'}}>📞 {selected.phone}</a>}
                  {selected.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.address)}`} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:5,fontSize:13,color:'#60a5fa',textDecoration:'none'}}>📍 Directions</a>}
                </div>
              </div>
              <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer',marginLeft:12,flexShrink:0}}>×</button>
            </div>

            {/* Action buttons */}
            <div style={{padding:'12px 20px',borderBottom:'1px solid #1e293b',display:'flex',gap:8}}>
              <button onClick={()=>handleMarkComplete(selected)}
                style={{flex:1,padding:'10px',background:selected.status==='completed'?'rgba(74,222,128,0.15)':'#16a34a',color:selected.status==='completed'?'#4ade80':'#fff',border:selected.status==='completed'?'1px solid #16a34a':'none',borderRadius:9,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                {selected.status==='completed'?'✓ Completed':'Mark Complete'}
              </button>
              <div style={{position:'relative'}}>
                <button onClick={e=>{e.stopPropagation();setShowMoreActions(v=>!v)}}
                  style={{padding:'10px 16px',background:'#1e293b',border:'1px solid #334155',borderRadius:9,color:'#f1f5f9',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6}}>
                  ··· More Actions
                </button>
                {showMoreActions && (
                  <div onClick={e=>e.stopPropagation()} style={{position:'absolute',top:'100%',right:0,marginTop:4,background:'#0d1526',border:'1px solid #1e293b',borderRadius:10,zIndex:600,minWidth:180,overflow:'hidden',boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
                    {[
                      {icon:'✏️',label:'Edit',action:()=>{setShowMoreActions(false)}},
                      {icon:'🔄',label:'Update Future Visits',action:()=>{setShowMoreActions(false)}},
                      {icon:'💬',label:'Text Reminder',action:()=>{setShowMoreActions(false);alert(`Text reminder sent to ${selected.client_name}`)}},
                      {icon:'✉️',label:'Email Reminder',action:()=>{setShowMoreActions(false);alert(`Email reminder sent to ${selected.client_name}`)}},
                      {icon:'🗑️',label:'Delete',action:()=>{setShowMoreActions(false);handleDelete(selected)},red:true},
                    ].map((item:any)=>(
                      <button key={item.label} onClick={item.action}
                        style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 14px',background:'none',border:'none',color:item.red?'#f87171':'#f1f5f9',fontSize:13,cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}
                        onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                        {item.icon} {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div style={{display:'flex',borderBottom:'1px solid #1e293b',padding:'0 20px'}}>
              {(['info','client','notes'] as const).map(tab=>(
                <button key={tab} onClick={()=>setDetailTab(tab)}
                  style={{padding:'10px 16px',background:'none',border:'none',borderBottom:detailTab===tab?'2px solid #4ade80':'2px solid transparent',color:detailTab===tab?'#f1f5f9':'#64748b',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',textTransform:'capitalize',display:'flex',alignItems:'center',gap:6}}>
                  {tab.charAt(0).toUpperCase()+tab.slice(1)}
                  {tab==='notes' && savedNotes.length>0 && <span style={{background:'#1e293b',borderRadius:'50%',width:18,height:18,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#94a3b8'}}>{savedNotes.length}</span>}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{padding:'16px 20px',overflowY:'auto',flex:1}}>

              {/* INFO TAB */}
              {detailTab === 'info' && (
                <div>
                  {/* Completed checkbox */}
                  <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:16,padding:'12px',background:'#0f172a',borderRadius:10,border:'1px solid #1e293b'}}>
                    <input type="checkbox" checked={selected.status==='completed'} onChange={()=>handleMarkComplete(selected)} style={{width:18,height:18,cursor:'pointer',accentColor:'#16a34a'}} />
                    <span style={{fontSize:14,color:'#f1f5f9',fontWeight:600}}>Completed</span>
                  </label>

                  {/* Details section */}
                  <div style={{marginBottom:16}}>
                    <p style={{margin:'0 0 8px',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em'}}>Details</p>
                    {selected.client_name && <p style={{margin:'0 0 4px',fontSize:14,color:'#4ade80',fontWeight:600}}>{selected.client_name}{selected.job_number?` — Job # ${selected.job_number}`:''}</p>}
                  </div>

                  {/* Team */}
                  <div style={{marginBottom:16}}>
                    <p style={{margin:'0 0 8px',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em'}}>Team</p>
                    {selected.assigned_to ? (
                      <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'#0f172a',borderRadius:8,border:'1px solid #1e293b'}}>
                        <div style={{width:28,height:28,borderRadius:'50%',background:'#1e3a5f',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#60a5fa'}}>
                          {selected.assigned_to.split(' ').map((n:string)=>n[0]).slice(0,2).join('')}
                        </div>
                        <span style={{fontSize:13,color:'#f1f5f9'}}>{selected.assigned_to}</span>
                      </div>
                    ) : (
                      <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'rgba(248,113,113,0.1)',borderRadius:8,border:'1px solid rgba(248,113,113,0.2)'}}>
                        <span style={{fontSize:13,color:'#f87171'}}>⊘ Unassigned</span>
                      </div>
                    )}
                  </div>

                  {/* Location */}
                  {selected.address && (
                    <div style={{marginBottom:16}}>
                      <p style={{margin:'0 0 8px',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em'}}>Location</p>
                      <p style={{margin:'0 0 6px',fontSize:13,color:'#f1f5f9'}}>{selected.address}</p>
                    </div>
                  )}

                  {/* Dates */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                    {selected.scheduled_start && (
                      <div><p style={{margin:'0 0 4px',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em'}}>Starts</p><p style={{margin:0,fontSize:13,color:'#f1f5f9'}}>{fmtDate(selected.scheduled_start)}</p></div>
                    )}
                    {selected.scheduled_end && (
                      <div><p style={{margin:'0 0 4px',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em'}}>Ends</p><p style={{margin:0,fontSize:13,color:'#f1f5f9'}}>{fmtDate(selected.scheduled_end)}</p></div>
                    )}
                  </div>

                  {/* Instructions */}
                  <div style={{marginBottom:16}}>
                    <p style={{margin:'0 0 6px',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em'}}>Instructions</p>
                    <p style={{margin:0,fontSize:13,color:selected.notes?'#f1f5f9':'#475569',fontStyle:selected.notes?'normal':'italic'}}>{selected.notes || 'No additional instructions'}</p>
                  </div>

                  {/* Line items */}
                  {selected.line_items && selected.line_items.length > 0 && (
                    <div>
                      <p style={{margin:'0 0 8px',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em'}}>Line items</p>
                      <table style={{width:'100%',borderCollapse:'collapse'}}>
                        <thead><tr style={{borderBottom:'1px solid #1e293b'}}><th style={{padding:'6px 8px',textAlign:'left',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase'}}>Product / Service</th><th style={{padding:'6px 8px',textAlign:'right',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase'}}>Qty</th></tr></thead>
                        <tbody>{selected.line_items.map((li,i)=>(
                          <tr key={i} style={{borderBottom:'1px solid #1e293b'}}>
                            <td style={{padding:'8px',fontSize:13,color:'#f1f5f9',fontWeight:600}}>{li.name}<br/><span style={{fontSize:11,color:'#64748b',fontWeight:400}}>{li.description}</span></td>
                            <td style={{padding:'8px',fontSize:13,color:'#f1f5f9',textAlign:'right'}}>{li.qty}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}

                  {/* Reminders */}
                  <div style={{marginTop:16}}>
                    <p style={{margin:'0 0 4px',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em'}}>Reminders</p>
                    <p style={{margin:0,fontSize:13,color:'#475569',fontStyle:'italic'}}>No reminders scheduled</p>
                  </div>
                </div>
              )}

              {/* CLIENT TAB */}
              {detailTab === 'client' && (
                <div>
                  <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1rem'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                      <h3 style={{margin:0,fontSize:14,fontWeight:700,color:'#f1f5f9'}}>Contacts</h3>
                      <button onClick={()=>navigate('/clients')} style={{color:'#4ade80',fontSize:13,fontWeight:600,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>View Client</button>
                    </div>
                    <p style={{margin:'0 0 12px',fontSize:12,color:'#64748b'}}>(1 result{selected.client_name?'s':''})</p>
                    {selected.client_name && (
                      <div style={{borderTop:'1px solid #1e293b',paddingTop:12}}>
                        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
                          <div>
                            <p style={{margin:'0 0 2px',fontSize:14,fontWeight:700,color:'#f1f5f9'}}>{selected.client_name.toUpperCase()}</p>
                            <p style={{margin:0,fontSize:12,color:'#64748b'}}>(Primary Contact)</p>
                          </div>
                          <div style={{textAlign:'right'}}>
                            {selected.phone && <a href={`tel:${selected.phone}`} style={{display:'block',fontSize:13,color:'#4ade80',textDecoration:'none'}}>{selected.phone}</a>}
                            {selected.email && <a href={`mailto:${selected.email}`} style={{display:'block',fontSize:12,color:'#4ade80',textDecoration:'none'}}>{selected.email}</a>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* NOTES TAB */}
              {detailTab === 'notes' && (
                <div>
                  <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Leave a note..."
                    style={{width:'100%',padding:'12px',background:'#0f172a',border:'1px solid #1e293b',borderRadius:10,color:'#f1f5f9',fontSize:13,fontFamily:'inherit',resize:'vertical',minHeight:80,boxSizing:'border-box',outline:'none'}} />
                  <div style={{background:'#0f172a',border:'1px dashed #334155',borderRadius:10,padding:'14px',marginTop:8,textAlign:'center',cursor:'pointer'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='#111c2d')} onMouseLeave={e=>(e.currentTarget.style.background='#0f172a')}>
                    <p style={{margin:'0 0 4px',fontSize:13,fontWeight:700,color:'#4ade80'}}>Attach files & photos</p>
                    <p style={{margin:0,fontSize:12,color:'#64748b'}}>Drag your files here or select a file</p>
                  </div>
                  <button onClick={handleSaveNote} style={{marginTop:10,padding:'8px 20px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Save Note</button>
                  {savedNotes.map((note,i)=>(
                    <div key={i} style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:10,padding:'14px',marginTop:12}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                        <div style={{width:28,height:28,borderRadius:'50%',background:'#1e3a5f',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#60a5fa'}}>
                          {note.author.split(' ').map(n=>n[0]).slice(0,2).join('')}
                        </div>
                        <div>
                          <p style={{margin:0,fontSize:13,fontWeight:700,color:'#f1f5f9'}}>{note.author}</p>
                          <p style={{margin:0,fontSize:10,color:'#64748b'}}>Created: {note.date}</p>
                        </div>
                        <button style={{marginLeft:'auto',background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:14}}>✏️</button>
                      </div>
                      <p style={{margin:'0 0 6px',fontSize:13,color:'#cbd5e1',whiteSpace:'pre-wrap'}}>{note.text}</p>
                      <p style={{margin:0,fontSize:11,color:'#4ade80'}}>🔗 Client note linked to related jobs</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div style={{padding:'12px 20px',borderTop:'1px solid #1e293b',display:'flex',gap:8}}>
              <button onClick={()=>setShowAdd(true)} style={{flex:1,padding:'9px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#94a3b8',cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'inherit'}}>Edit</button>
              <button onClick={()=>{ if(selected.job_number) navigate('/jobs',{state:{openItem:selected.id}}) }} style={{flex:1,padding:'9px',background:'#16a34a',border:'none',borderRadius:8,color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>View Details</button>
            </div>
          </div>
        </>
      )}

      {/* ── Add/Schedule Modal ── */}
      {showAdd && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:600,padding:'1rem'}}>
          <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:16,padding:'1.5rem',width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
              <h2 style={{fontSize:17,fontWeight:700,color:'#f1f5f9',margin:0}}>📅 Schedule a Visit</h2>
              <button onClick={()=>{setShowAdd(false);setAddDate(null)}} style={{background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer'}}>×</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={{gridColumn:'1/-1'}}><label style={lbl}>Title *</label><input placeholder="e.g. Lawn maintenance" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} style={inp} /></div>
              <div><label style={lbl}>Client Name</label><input placeholder="Client" value={form.client_name} onChange={e=>setForm({...form,client_name:e.target.value})} style={inp} /></div>
              <div><label style={lbl}>Phone</label><input placeholder="(561) 000-0000" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} style={inp} /></div>
              <div style={{gridColumn:'1/-1'}}><label style={lbl}>Address</label><input placeholder="123 Main St, Port St. Lucie, FL" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} style={inp} /></div>
              <div><label style={lbl}>Start *</label><input type="datetime-local" value={form.scheduled_start} onChange={e=>setForm({...form,scheduled_start:e.target.value})} style={inp} /></div>
              <div><label style={lbl}>End</label><input type="datetime-local" value={form.scheduled_end} onChange={e=>setForm({...form,scheduled_end:e.target.value})} style={inp} /></div>
              <div><label style={lbl}>Assign To</label><select value={form.assigned_to} onChange={e=>setForm({...form,assigned_to:e.target.value})} style={{...inp,padding:'0 10px'}}><option value="">Unassigned</option>{employees.map(e=><option key={e.id} value={`${e.fname} ${e.lname}`}>{e.fname} {e.lname}</option>)}</select></div>
              <div><label style={lbl}>Division</label><select value={form.division} onChange={e=>setForm({...form,division:e.target.value})} style={{...inp,padding:'0 10px'}}>{DIVS.map(d=><option key={d}>{d}</option>)}</select></div>
              <div><label style={lbl}>Status</label><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{...inp,padding:'0 10px'}}>{Object.keys(STATUS_STYLE).map(s=><option key={s}>{s}</option>)}</select></div>
              <div style={{gridColumn:'1/-1'}}><label style={lbl}>Notes / Instructions</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={{...inp,height:70,padding:'10px 12px',resize:'vertical' as const}} /></div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:'1rem'}}>
              <button onClick={()=>{setShowAdd(false);setAddDate(null)}} style={{padding:'10px 22px',border:'1px solid #334155',borderRadius:9,background:'transparent',color:'#cbd5e1',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>Cancel</button>
              <button onClick={handleSave} style={{padding:'10px 22px',border:'none',borderRadius:9,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700,fontFamily:'inherit'}}>Save Visit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
