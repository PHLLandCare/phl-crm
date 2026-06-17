import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getCurrentUserAccess, filterAssignedTo, type CurrentUserAccess } from '../lib/currentUserAccess'

interface Stop {
  id: string
  order: number
  title: string
  client_name: string
  address: string
  scheduled_start: string
  status: string
  assigned_to: string
  division: string
  lat?: number
  lng?: number
}

const DIVS = ['All','Lawn & Tree','Irrigation','Extermination','Nursery','Farm','Hardscape']

const STATUS_COLOR: Record<string,{bg:string;color:string}> = {
  scheduled:   {bg:'#0c1a2e', color:'#7dd3fc'},
  dispatched:  {bg:'#1a1000', color:'#fcd34d'},
  in_progress: {bg:'#1a0533', color:'#d8b4fe'},
  completed:   {bg:'#052e16', color:'#4ade80'},
  missed:      {bg:'#450a0a', color:'#fca5a5'},
}

export default function RoutePage() {
  const [stops, setStops]       = useState<Stop[]>([])
  const [access, setAccess]     = useState<CurrentUserAccess>({ role: 'worker_limited', fullName: '', isFieldWorker: true })
  const [loading, setLoading]   = useState(true)
  const [date, setDate]         = useState(new Date().toISOString().slice(0,10))
  const [division, setDivision] = useState('All')
  const [employee, setEmployee] = useState('All')
  const [employees, setEmployees] = useState<{fname:string;lname:string}[]>([])
  const [optimized, setOptimized] = useState(false)
  const [dragging, setDragging] = useState<number|null>(null)
  const [shareToast, setShareToast] = useState('')

  const load = async () => {
    setLoading(true)
    const [sRes, eRes, currentAccess] = await Promise.all([
      supabase.from('schedules').select('*').gte('scheduled_start', date+'T00:00:00').lte('scheduled_start', date+'T23:59:59').order('scheduled_start'),
      supabase.from('employees').select('fname,lname').eq('active',true).order('fname'),
      getCurrentUserAccess(),
    ])
    setAccess(currentAccess)
    const raw = filterAssignedTo(sRes.data ?? [], currentAccess, s => s.assigned_to).map((s,i) => ({...s, order: i}))
    setStops(raw)
    setEmployees(eRes.data ?? [])
    setLoading(false)
    setOptimized(false)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('route-rt').on('postgres_changes',{event:'*',schema:'public',table:'schedules'},load).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [date])

  const filtered = stops.filter(s => {
    if (division !== 'All' && s.division !== division) return false
    if (employee !== 'All' && s.assigned_to !== employee) return false
    return true
  })

  const [optimizing, setOptimizing] = useState(false)
  const [optimizeError, setOptimizeError] = useState('')

  const optimizeRoute = async () => {
    setOptimizeError('')
    const withAddr = filtered.filter(s => s.address && s.address.trim())
    if (withAddr.length < 2) { setOptimized(true); return }

    setOptimizing(true)
    try {
      const { data, error } = await supabase.functions.invoke('optimize-route', {
        body: { stops: filtered.map(s => ({ id: s.id, address: s.address })) }
      })
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Optimization failed')

      const orderMap = new Map<string, number>(data.order.map((id: string, i: number) => [id, i]))
      const reordered = [...filtered].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999))

      setStops(prev => {
        const other = prev.filter(s => !filtered.find(f => f.id === s.id))
        return [...other, ...reordered.map((s, i) => ({ ...s, order: i }))]
      })
      setOptimized(true)
    } catch (e: any) {
      setOptimizeError(e.message.includes('not configured')
        ? 'Route optimization isn\'t set up yet — add a free OpenRouteService API key in Settings → Integrations.'
        : 'Couldn\'t optimize: ' + e.message)
    }
    setOptimizing(false)
  }

  const openInMaps = () => {
    const addrs = filtered.filter(s=>s.address).map(s=>encodeURIComponent(s.address))
    if (addrs.length === 0) return
    if (addrs.length === 1) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${addrs[0]}`, '_blank')
      return
    }
    const origin = addrs[0]
    const dest   = addrs[addrs.length-1]
    const wpts   = addrs.slice(1,-1).join('|')
    const url    = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${wpts?`&waypoints=${wpts}`:''}&travelmode=driving`
    window.open(url, '_blank')
  }

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('schedules').update({status}).eq('id',id)
    load()
  }

  const moveStop = (from: number, to: number) => {
    const arr = [...filtered]
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    setStops(prev => {
      const other = prev.filter(s => !filtered.find(f=>f.id===s.id))
      return [...other, ...arr.map((s,i)=>({...s, order:i}))]
    })
  }

  const completed = filtered.filter(s=>s.status==='completed').length
  const pct = filtered.length > 0 ? Math.round(completed/filtered.length*100) : 0

  return (
    <div style={{padding:'2rem',maxWidth:1200,margin:'0 auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      {shareToast && (
        <div style={{position:'fixed',top:'1rem',right:'1rem',background:'#052e16',border:'1px solid #16a34a',borderRadius:10,padding:'12px 20px',fontSize:13,color:'#4ade80',fontWeight:600,zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
          {shareToast}
        </div>
      )}

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'#f1f5f9',margin:'0 0 4px'}}>🗺️ Route Optimization</h1>
          <p style={{fontSize:14,color:'#64748b',margin:0}}>{filtered.length} stops · {completed} completed · {pct}% done</p>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button onClick={optimizeRoute} disabled={optimizing}
            style={{padding:'9px 18px',background:'#1a0533',border:'1px solid #9333ea',borderRadius:8,color:'#d8b4fe',fontSize:13,fontWeight:700,cursor:optimizing?'default':'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6,opacity:optimizing?0.7:1}}>
            {optimizing ? '⏳ Optimizing…' : '⚡ Optimize Route'}
          </button>
          <button onClick={openInMaps} disabled={filtered.length===0}
            style={{padding:'9px 18px',background:'#0c1a2e',border:'1px solid #0ea5e9',borderRadius:8,color:'#7dd3fc',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6,opacity:filtered.length===0?0.5:1}}>
            🗺️ Open in Google Maps
          </button>
          <button onClick={async()=>{
            const lines = filtered.filter(s=>s.address).map((s,i)=>`${i+1}. ${s.client_name||s.title}: ${s.address}`)
            const msg = `PHL Route ${new Date(date+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})} (${filtered.length} stops):\n${lines.join('\n')}`
            try { await navigator.clipboard.writeText(msg); setShareToast('✅ Route copied — paste into SMS or WhatsApp!') }
            catch { setShareToast('⚠️ Copy failed — try again') }
            setTimeout(()=>setShareToast(''),4000)
          }} disabled={filtered.length===0}
            style={{padding:'9px 18px',background:'rgba(74,222,128,0.1)',border:'1px solid rgba(74,222,128,0.3)',borderRadius:8,color:'#4ade80',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:filtered.length===0?0.5:1}}>
            📋 Copy Route for SMS
          </button>
        </div>
      </div>
      {optimizeError && (
        <div style={{background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.3)',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#f87171',marginBottom:'1rem'}}>
          {optimizeError}
        </div>
      )}
      <div style={{display:'flex',gap:10,marginBottom:'1.5rem',flexWrap:'wrap',alignItems:'center'}}>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          style={{padding:'8px 12px',background:'#0f172a',border:'1.5px solid #1e293b',borderRadius:8,color:'#f1f5f9',fontSize:14,outline:'none',fontFamily:'inherit'}} />
        <select value={division} onChange={e=>setDivision(e.target.value)}
          style={{padding:'8px 12px',background:'#0f172a',border:'1.5px solid #1e293b',borderRadius:8,color:'#f1f5f9',fontSize:14,outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
          {DIVS.map(d=><option key={d}>{d}</option>)}
        </select>
        <select value={employee} onChange={e=>setEmployee(e.target.value)}
          style={{padding:'8px 12px',background:'#0f172a',border:'1.5px solid #1e293b',borderRadius:8,color:'#f1f5f9',fontSize:14,outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
          <option value="All">All Employees</option>
          {employees.map(e=><option key={`${e.fname}${e.lname}`} value={`${e.fname} ${e.lname}`}>{e.fname} {e.lname}</option>)}
        </select>
        {optimized && (
          <span style={{background:'#1a0533',border:'1px solid #9333ea',borderRadius:20,padding:'4px 12px',fontSize:12,fontWeight:700,color:'#d8b4fe'}}>⚡ Route optimized</span>
        )}
      </div>

      {/* Progress bar */}
      {filtered.length > 0 && (
        <div style={{background:'#1e293b',borderRadius:8,height:8,marginBottom:'1.5rem',overflow:'hidden'}}>
          <div style={{width:`${pct}%`,height:'100%',background:'linear-gradient(90deg,#16a34a,#4ade80)',borderRadius:8,transition:'width .5s'}} />
        </div>
      )}

      {/* Stops list */}
      {loading ? <p style={{color:'#64748b'}}>Loading...</p> : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {filtered.length === 0 ? (
            <div style={{background:'#0f172a',borderRadius:16,border:'1px solid #1e293b',padding:'3rem',textAlign:'center',color:'#475569'}}>
              No jobs scheduled for {new Date(date+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
            </div>
          ) : filtered.map((stop, idx) => {
            const s = STATUS_COLOR[stop.status] || STATUS_COLOR.scheduled
            return (
              <div key={stop.id}
                draggable
                onDragStart={()=>setDragging(idx)}
                onDragOver={e=>{e.preventDefault()}}
                onDrop={()=>{ if(dragging!==null&&dragging!==idx){moveStop(dragging,idx);setDragging(null)} }}
                style={{background:'#0f172a',border:`1px solid #1e293b`,borderLeft:`4px solid ${stop.status==='completed'?'#16a34a':stop.status==='in_progress'?'#9333ea':'#334155'}`,borderRadius:12,padding:'1rem 1.25rem',display:'flex',alignItems:'center',gap:16,cursor:'grab',opacity:dragging===idx?0.5:1}}>

                {/* Stop number */}
                <div style={{width:32,height:32,borderRadius:'50%',background:stop.status==='completed'?'#052e16':'#1e293b',border:`2px solid ${stop.status==='completed'?'#16a34a':'#334155'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:stop.status==='completed'?'#4ade80':'#64748b',flexShrink:0}}>
                  {stop.status==='completed'?'✓':idx+1}
                </div>

                {/* Info */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                    <p style={{margin:0,fontSize:15,fontWeight:700,color:'#f1f5f9',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{stop.title||stop.client_name||'Job'}</p>
                    <span style={{background:s.bg,color:s.color,padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:700,flexShrink:0}}>{stop.status}</span>
                  </div>
                  <p style={{margin:'0 0 2px',fontSize:13,color:'#94a3b8'}}>{stop.client_name}</p>
                  {stop.address && (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`} target="_blank" rel="noreferrer"
                      style={{fontSize:12,color:'#60a5fa',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:4}}
                      onClick={e=>e.stopPropagation()}>
                      📍 {stop.address}
                    </a>
                  )}
                </div>

                {/* Time + assignee */}
                <div style={{textAlign:'right',flexShrink:0}}>
                  {stop.scheduled_start && (
                    <p style={{margin:'0 0 4px',fontSize:13,fontWeight:600,color:'#f1f5f9'}}>
                      {new Date(stop.scheduled_start).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
                    </p>
                  )}
                  {stop.assigned_to && <p style={{margin:0,fontSize:12,color:'#64748b'}}>👤 {stop.assigned_to}</p>}
                </div>

                {/* Status actions */}
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  {stop.status !== 'completed' && (
                    <button onClick={()=>updateStatus(stop.id,'completed')}
                      style={{padding:'5px 10px',background:'#052e16',border:'1px solid #16a34a',borderRadius:6,color:'#4ade80',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                      ✓ Done
                    </button>
                  )}
                  {stop.status !== 'in_progress' && stop.status !== 'completed' && (
                    <button onClick={()=>updateStatus(stop.id,'in_progress')}
                      style={{padding:'5px 10px',background:'#1a0533',border:'1px solid #9333ea',borderRadius:6,color:'#d8b4fe',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                      ▶ Start
                    </button>
                  )}
                </div>

                {/* Drag handle */}
                <div style={{color:'#334155',fontSize:18,cursor:'grab',flexShrink:0,userSelect:'none'}}>⠿</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Summary */}
      {filtered.length > 0 && (
        <div style={{marginTop:'1.5rem',background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',padding:'1.25rem',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:12}}>
          {[
            {label:'Total Stops',  value:filtered.length,              color:'#f1f5f9'},
            {label:'Completed',    value:completed,                    color:'#4ade80'},
            {label:'Remaining',    value:filtered.length-completed,    color:'#fcd34d'},
            {label:'In Progress',  value:filtered.filter(s=>s.status==='in_progress').length, color:'#d8b4fe'},
          ].map(k=>(
            <div key={k.label}>
              <p style={{margin:'0 0 4px',fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.04em'}}>{k.label}</p>
              <p style={{margin:0,fontSize:22,fontWeight:800,color:k.color}}>{k.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
