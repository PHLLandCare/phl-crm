import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Employee {
  id: string
  employee_id: string
  fname: string
  lname: string
  role: string
  division: string
  hourly_rate: number
  employee_type: string
  phone: string
  personal_email: string
}

interface ClockEvent {
  id: string
  clock_in: string
  clock_out: string | null
  division: string
  method: string
}

interface Job {
  id: string
  title: string
  client_name: string
  scheduled_start: string | null
  status: string
  service_address: string | null
  instructions: string | null
}

type Screen = 'login' | 'home' | 'schedule' | 'timeclock' | 'pay' | 'qr'

const CARD: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '1.25rem',
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function federalWithholding(g: number) {
  const t = [[0,73,0,0],[73,260,0,.1],[260,834,18.7,.12],[834,1731,87.58,.22],[1731,3315,284.92,.24],[3315,4213,665.08,.32],[4213,10275,952.44,.35],[10275,Infinity,3073.89,.37]]
  for (const [lo,hi,base,rate] of t) if (g>=lo && g<hi) return base+(g-lo)*rate
  return 0
}

export default function EmployeePortalPage() {
  const [screen, setScreen] = useState<Screen>('login')
  const [empId, setEmpId] = useState('')
  const [emp, setEmp] = useState<Employee | null>(null)
  const [loginErr, setLoginErr] = useState('')
  const [logging, setLogging] = useState(false)
  const [clockEvents, setClockEvents] = useState<ClockEvent[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [openEvent, setOpenEvent] = useState<ClockEvent | null>(null)
  const [clocking, setClocking] = useState(false)
  const [clockMsg, setClockMsg] = useState('')
  const [now, setNow] = useState(new Date())
  const [weekOffset, setWeekOffset] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Reload clock data whenever weekOffset changes (after login)
  useEffect(() => {
    if (emp) loadData(emp, weekOffset)
  }, [weekOffset])

  // Realtime — clock status updates live without manual refresh
  useEffect(() => {
    if (!emp) return
    const ch = supabase.channel('emp-portal-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clock_events' }, () => loadData(emp, weekOffset))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => loadData(emp, weekOffset))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [emp?.employee_id])

  // ── LOGIN ──
  const handleLogin = async () => {
    if (!empId.trim()) return
    setLogging(true); setLoginErr('')
    const { data } = await supabase.from('employees').select('*')
      .ilike('employee_id', empId.trim()).eq('active', true).single()
    if (!data) { setLoginErr('Employee ID not found. Check with your manager.'); setLogging(false); return }
    setEmp(data)
    await loadData(data)
    setScreen('home')
    setLogging(false)
  }

  const loadData = async (e: Employee, wOffset: number = weekOffset) => {
    const todayStart = new Date(localDateStr(new Date()) + 'T00:00:00').toISOString()
    const weekStart = getWeekStart(wOffset)
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000).toISOString()

    const [evtRes, jobRes, openRes] = await Promise.all([
      supabase.from('clock_events').select('*').eq('employee_id', e.employee_id)
        .gte('clock_in', weekStart.toISOString()).lt('clock_in', weekEnd).order('clock_in', { ascending: false }),
      supabase.from('jobs').select('id,title,client_name,scheduled_start,status,service_address,instructions')
        .or(`assigned_name.ilike.%${e.fname}%,assigned_to.eq.${e.employee_id}`)
        .not('status', 'in', '("Cancelled","completed","Completed")')
        .order('scheduled_start', { ascending: true }).limit(20),
      supabase.from('clock_events').select('*').eq('employee_id', e.employee_id)
        .is('clock_out', null).not('clock_in', 'is', null)
        .order('clock_in', { ascending: false }).limit(1),
    ])
    setClockEvents(evtRes.data ?? [])
    setJobs(jobRes.data ?? [])
    setOpenEvent(openRes.data?.[0] ?? null)
  }

  const handleClockToggle = async () => {
    if (!emp || clocking) return
    setClocking(true)
    const ts = new Date().toISOString()

    if (openEvent) {
      // Clock OUT — close the open session
      const { error } = await supabase.from('clock_events')
        .update({ clock_out: ts })
        .eq('id', openEvent.id)
      if (error) {
        setClockMsg('❌ Clock-out failed: ' + error.message)
        setClocking(false)
        return
      }
      setClockMsg(`✅ Clocked out at ${new Date(ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}`)
      setOpenEvent(null)
    } else {
      // Clock IN — first close ANY open sessions for this employee (safety net)
      await supabase.from('clock_events')
        .update({ clock_out: ts })
        .eq('employee_id', emp.employee_id)
        .is('clock_out', null)

      // Now create the new clock-in
      const { data, error } = await supabase.from('clock_events').insert({
        employee_id: emp.employee_id,
        employee_name: `${emp.fname} ${emp.lname}`,
        division: emp.division,
        clock_in: ts,
        method: 'Employee Portal',
        flagged: false,
      }).select().single()

      if (error) {
        setClockMsg('❌ Clock-in failed: ' + error.message)
        setClocking(false)
        return
      }
      setClockMsg(`✅ Clocked in at ${new Date(ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}`)
      setOpenEvent(data)
    }
    await loadData(emp)
    setClocking(false)
    setTimeout(() => setClockMsg(''), 4000)
  }

  function getWeekStart(offset = 0) {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7
    const mon = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0)
    return mon
  }

  const weekStart = getWeekStart(weekOffset)
  const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(weekStart); d.setDate(d.getDate()+i); return d })
  const weekLabel = `${weekStart.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${weekDays[6].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`

  const weekHours = clockEvents.reduce((sum, ev) => {
    if (ev.clock_in && ev.clock_out) return sum + (new Date(ev.clock_out).getTime() - new Date(ev.clock_in).getTime()) / 3600000
    return sum
  }, 0)

  const calcPay = () => {
    const rate = emp?.hourly_rate || 15
    const reg = Math.min(weekHours, 40); const ot = Math.max(weekHours - 40, 0)
    const gross = reg * rate + ot * rate * 1.5
    if (emp?.employee_type === '1099') return { gross, net: gross, federal: 0, ss: 0, medicare: 0, reg, ot, rate }
    const federal = federalWithholding(gross); const ss = gross * 0.062; const medicare = gross * 0.0145
    return { gross, net: gross - federal - ss - medicare, federal, ss, medicare, reg, ot, rate }
  }

  const pay = emp ? calcPay() : null

  if (screen === 'login') return (
    <div style={{ minHeight:'100vh', background:'#060d18', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'2rem', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <img src="https://phllandcare.github.io/phl-crm/phl_logo.jpg" alt="PHL" style={{ width:80, height:80, borderRadius:16, objectFit:'cover', marginBottom:20 }} />
      <h1 style={{ fontSize:22, fontWeight:800, color:'#f1f5f9', margin:'0 0 6px' }}>PHL Land Care</h1>
      <p style={{ fontSize:14, color:'#64748b', margin:'0 0 32px' }}>Employee Portal</p>
      <div style={{ width:'100%', maxWidth:360 }}>
        <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:6 }}>EMPLOYEE ID</label>
        <input
          value={empId} onChange={e => setEmpId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          placeholder="e.g. PHL-0001"
          style={{ width:'100%', padding:'14px 16px', background:'#0f172a', border:'1px solid #334155', borderRadius:12, color:'#f1f5f9', fontSize:16, outline:'none', boxSizing:'border-box', marginBottom:12, fontFamily:'inherit' }}
          autoFocus
        />
        {loginErr && <p style={{ color:'#f87171', fontSize:13, margin:'0 0 12px' }}>{loginErr}</p>}
        <button onClick={handleLogin} disabled={logging || !empId.trim()}
          style={{ width:'100%', padding:'14px', background: empId.trim() ? '#16a34a' : '#1e293b', border:'none', borderRadius:12, color:'#fff', fontSize:16, fontWeight:700, cursor: empId.trim() ? 'pointer' : 'not-allowed', fontFamily:'inherit' }}>
          {logging ? 'Signing in...' : 'Sign In'}
        </button>
      </div>
    </div>
  )

  if (!emp) return null

  const nav = (label: string, icon: string, s: Screen) => (
    <button onClick={() => setScreen(s)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'8px 0', background:'none', border:'none', color: screen===s ? '#16a34a' : '#475569', cursor:'pointer', fontFamily:'inherit' }}>
      <span style={{ fontSize:20 }}>{icon}</span>
      <span style={{ fontSize:10, fontWeight:600 }}>{label}</span>
    </button>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#060d18', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', maxWidth:480, margin:'0 auto', paddingBottom:80 }}>

      {/* Header */}
      <div style={{ background:'#0a1628', borderBottom:'1px solid #1e293b', padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:'#16a34a', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#fff' }}>
            {emp.fname[0]}{emp.lname[0]}
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#f1f5f9' }}>{emp.fname} {emp.lname}</div>
            <div style={{ fontSize:11, color:'#64748b' }}>{emp.employee_id} · {emp.division}</div>
          </div>
        </div>
        <button onClick={() => { setEmp(null); setScreen('login'); setEmpId('') }}
          style={{ background:'none', border:'1px solid #334155', borderRadius:8, color:'#64748b', padding:'5px 10px', cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>
          Sign Out
        </button>
      </div>

      {/* ── HOME ── */}
      {screen === 'home' && (
        <div style={{ padding:16 }}>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:20, fontWeight:800, color:'#f1f5f9' }}>
              Good {now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening'}, {emp.fname}! 👋
            </div>
            <div style={{ fontSize:13, color:'#64748b' }}>{now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
          </div>

          {/* Clock in/out big button */}
          <div style={{ ...CARD, marginBottom:16, textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:800, color:'#f1f5f9', fontVariantNumeric:'tabular-nums', marginBottom:4 }}>
              {now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
            </div>
            {openEvent && (
              <div style={{ fontSize:13, color:'#4ade80', marginBottom:12 }}>
                🟢 Clocked in since {new Date(openEvent.clock_in).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
              </div>
            )}
            {clockMsg && <div style={{ fontSize:13, color:'#4ade80', marginBottom:8 }}>{clockMsg}</div>}
            <button onClick={handleClockToggle} disabled={clocking}
              style={{ width:'100%', padding:'16px', background: openEvent ? '#dc2626' : '#16a34a', border:'none', borderRadius:12, color:'#fff', fontSize:18, fontWeight:800, cursor:'pointer', fontFamily:'inherit', opacity: clocking ? 0.7 : 1 }}>
              {clocking ? '...' : openEvent ? '⏹ Clock Out' : '▶ Clock In'}
            </button>
          </div>

          {/* Quick stats */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            <div style={{ ...CARD, borderTop:'3px solid #4ade80' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#4ade80', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>This Week</div>
              <div style={{ fontSize:22, fontWeight:800, color:'#f1f5f9' }}>{weekHours.toFixed(1)}h</div>
            </div>
            <div style={{ ...CARD, borderTop:'3px solid #a78bfa' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#a78bfa', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Est. Pay</div>
              <div style={{ fontSize:22, fontWeight:800, color:'#f1f5f9' }}>${pay?.gross.toFixed(0)}</div>
            </div>
          </div>

          {/* Today's jobs */}
          <div style={{ ...CARD }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#f1f5f9', marginBottom:12 }}>📋 My Upcoming Jobs</div>
            {jobs.length === 0
              ? <div style={{ fontSize:13, color:'#475569', textAlign:'center', padding:'1rem 0' }}>No upcoming jobs assigned</div>
              : jobs.slice(0,5).map(j => (
                <div key={j.id} style={{ padding:'10px 0', borderBottom:'1px solid #1e293b' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:3 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'#f1f5f9' }}>{j.title}</div>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:'rgba(74,222,128,0.1)', color:'#4ade80', whiteSpace:'nowrap', marginLeft:8 }}>{j.status}</span>
                  </div>
                  <div style={{ fontSize:12, color:'#64748b' }}>{j.client_name}</div>
                  {j.service_address && <div style={{ fontSize:12, color:'#475569' }}>📍 {j.service_address}</div>}
                  {j.scheduled_start && <div style={{ fontSize:12, color:'#60a5fa' }}>🗓 {new Date(j.scheduled_start).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>}
                  {j.instructions && <div style={{ fontSize:12, color:'#94a3b8', marginTop:4, padding:'6px 8px', background:'#1e293b', borderRadius:6 }}>📝 {j.instructions}</div>}
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── TIME CLOCK ── */}
      {screen === 'timeclock' && (
        <div style={{ padding:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:'#f1f5f9' }}>Time Clock</h2>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <button onClick={()=>setWeekOffset(w=>w-1)} style={{ padding:'5px 10px', background:'#1e293b', border:'1px solid #334155', borderRadius:7, color:'#f1f5f9', cursor:'pointer' }}>‹</button>
              <span style={{ fontSize:11, color:'#64748b', minWidth:100, textAlign:'center' }}>{weekLabel}</span>
              <button onClick={()=>setWeekOffset(w=>Math.min(w+1,0))} disabled={weekOffset>=0} style={{ padding:'5px 10px', background:'#1e293b', border:'1px solid #334155', borderRadius:7, color:'#f1f5f9', cursor:'pointer', opacity:weekOffset>=0?0.4:1 }}>›</button>
            </div>
          </div>

          <div style={{ ...CARD, marginBottom:16, textAlign:'center' }}>
            {openEvent
              ? <div style={{ marginBottom:12 }}><div style={{ fontSize:13, color:'#4ade80' }}>🟢 Currently clocked in since {new Date(openEvent.clock_in).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</div></div>
              : <div style={{ marginBottom:12, fontSize:13, color:'#475569' }}>Not clocked in</div>
            }
            {clockMsg && <div style={{ fontSize:13, color:'#4ade80', marginBottom:8 }}>{clockMsg}</div>}
            <button onClick={handleClockToggle} disabled={clocking}
              style={{ width:'100%', padding:'14px', background: openEvent ? '#dc2626' : '#16a34a', border:'none', borderRadius:10, color:'#fff', fontSize:16, fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>
              {clocking ? '...' : openEvent ? '⏹ Clock Out' : '▶ Clock In'}
            </button>
          </div>

          <div style={{ ...CARD }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#f1f5f9', marginBottom:12 }}>
              Punch History — <span style={{ color:'#64748b', fontWeight:400 }}>{weekLabel}</span>
              <span style={{ marginLeft:8, fontSize:13, color:'#4ade80', fontWeight:800 }}>{weekHours.toFixed(1)}h total</span>
            </div>
            {clockEvents.length === 0
              ? <div style={{ fontSize:13, color:'#475569', textAlign:'center', padding:'1rem 0' }}>No punches this week</div>
              : clockEvents.map(ev => {
                const inT = ev.clock_in ? new Date(ev.clock_in) : null
                const outT = ev.clock_out ? new Date(ev.clock_out) : null
                const hrs = inT && outT ? ((outT.getTime()-inT.getTime())/3600000).toFixed(1) : null
                return (
                  <div key={ev.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #1e293b' }}>
                    <div>
                      <div style={{ fontSize:13, color:'#f1f5f9', fontWeight:600 }}>{inT?.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>
                      <div style={{ fontSize:12, color:'#64748b' }}>
                        <span style={{ color:'#4ade80' }}>{inT?.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span>
                        {' → '}
                        {outT
                          ? <span style={{ color:'#f87171' }}>{outT.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span>
                          : <span style={{ color:'#4ade80', fontWeight:700 }}>Active</span>}
                      </div>
                    </div>
                    <div style={{ fontSize:15, fontWeight:700, color: hrs ? '#f1f5f9' : '#4ade80' }}>{hrs ? `${hrs}h` : '—'}</div>
                  </div>
                )
              })
            }
          </div>
        </div>
      )}

      {/* ── PAY ── */}
      {screen === 'pay' && pay && (
        <div style={{ padding:16 }}>
          <h2 style={{ margin:'0 0 16px', fontSize:18, fontWeight:700, color:'#f1f5f9' }}>My Pay — {weekLabel}</h2>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            {[
              { label:'Hours Worked', value:`${weekHours.toFixed(1)}h`, color:'#4ade80' },
              { label:'Hourly Rate',  value:`$${pay.rate}/hr`,         color:'#60a5fa' },
              { label:'Gross Pay',   value:`$${pay.gross.toFixed(2)}`, color:'#a78bfa' },
              { label:'Est. Net Pay',value:`$${pay.net.toFixed(2)}`,   color:'#4ade80' },
            ].map(s=>(
              <div key={s.label} style={{ ...CARD, borderTop:`3px solid ${s.color}` }}>
                <div style={{ fontSize:10, fontWeight:700, color:s.color, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{s.label}</div>
                <div style={{ fontSize:20, fontWeight:800, color:'#f1f5f9' }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ ...CARD }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#f1f5f9', marginBottom:12 }}>Pay Breakdown</div>
            {[
              { label:`Regular Pay (${pay.reg.toFixed(1)}h × $${pay.rate})`, amount: pay.reg * pay.rate, color:'#f1f5f9' },
              ...(pay.ot > 0 ? [{ label:`Overtime (${pay.ot.toFixed(1)}h × $${(pay.rate*1.5).toFixed(2)})`, amount: pay.ot * pay.rate * 1.5, color:'#fbbf24' }] : []),
              { label:'Gross Pay', amount: pay.gross, color:'#f1f5f9', bold: true },
              ...(emp.employee_type === 'W2' ? [
                { label:'Federal Tax', amount: -pay.federal, color:'#f87171' },
                { label:'Social Security (6.2%)', amount: -pay.ss, color:'#f87171' },
                { label:'Medicare (1.45%)', amount: -pay.medicare, color:'#f87171' },
              ] : []),
            ].map((row: any, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid #1e293b' }}>
                <span style={{ fontSize:13, color: row.color, fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                <span style={{ fontSize:13, color: row.color, fontWeight: row.bold ? 700 : 600 }}>{row.amount < 0 ? '-' : ''}${Math.abs(row.amount).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0', marginTop:4, borderTop:'2px solid #334155' }}>
              <span style={{ fontSize:16, fontWeight:800, color:'#4ade80' }}>Est. Net Pay</span>
              <span style={{ fontSize:16, fontWeight:800, color:'#4ade80' }}>${pay.net.toFixed(2)}</span>
            </div>
            <p style={{ margin:'8px 0 0', fontSize:11, color:'#475569' }}>* Estimates based on current week hours. Actual pay stub generated by payroll admin.</p>
          </div>
        </div>
      )}

      {/* ── SCHEDULE ── */}
      {screen === 'schedule' && (
        <div style={{ padding:16 }}>
          <h2 style={{ margin:'0 0 16px', fontSize:18, fontWeight:700, color:'#f1f5f9' }}>My Schedule</h2>
          {jobs.length === 0
            ? <div style={{ ...CARD, textAlign:'center', padding:'2rem' }}><div style={{ fontSize:32, marginBottom:8 }}>📋</div><div style={{ color:'#475569' }}>No jobs assigned yet</div></div>
            : jobs.map(j => (
              <div key={j.id} style={{ ...CARD, marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:'#f1f5f9', flex:1 }}>{j.title}</div>
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'rgba(74,222,128,0.12)', color:'#4ade80', marginLeft:8, whiteSpace:'nowrap' }}>{j.status}</span>
                </div>
                <div style={{ fontSize:13, color:'#94a3b8', marginBottom:4 }}>👤 {j.client_name}</div>
                {j.scheduled_start && (
                  <div style={{ fontSize:13, color:'#60a5fa', marginBottom:4 }}>
                    🗓 {new Date(j.scheduled_start).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
                    {' at '}{new Date(j.scheduled_start).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
                  </div>
                )}
                {j.service_address && <div style={{ fontSize:13, color:'#64748b', marginBottom:4 }}>📍 {j.service_address}</div>}
                {j.instructions && (
                  <div style={{ marginTop:8, padding:'8px 10px', background:'#1e293b', borderRadius:8, fontSize:12, color:'#94a3b8' }}>
                    📝 {j.instructions}
                  </div>
                )}
              </div>
            ))
          }
        </div>
      )}

      {/* ── QR CODE ── */}
      {screen === 'qr' && (
        <div style={{ padding:16 }}>
          <h2 style={{ margin:'0 0 4px', fontSize:18, fontWeight:700, color:'#f1f5f9' }}>My Clock-In QR</h2>
          <p style={{ margin:'0 0 20px', fontSize:13, color:'#64748b' }}>Show or scan this at the kiosk to clock in instantly</p>

          {/* Big QR code card */}
          <div style={{ ...CARD, textAlign:'center', padding:'2rem 1rem', marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#94a3b8', marginBottom:12 }}>{emp.fname} {emp.lname} · {emp.employee_id}</div>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(emp.employee_id)}&color=f1f5f9&bgcolor=0f172a&margin=2`}
              alt="QR Code"
              style={{ width:220, height:220, borderRadius:12, border:'2px solid #1e293b' }}
            />
            <div style={{ marginTop:16, fontSize:12, color:'#475569', fontFamily:'monospace', letterSpacing:'0.1em' }}>{emp.employee_id}</div>
          </div>

          {/* Employee Info card */}
          <div style={{ ...CARD, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#f1f5f9', marginBottom:12 }}>My Info</div>
            {[
              { label:'Full Name',    value:`${emp.fname} ${emp.lname}` },
              { label:'Employee ID',  value:emp.employee_id },
              { label:'Division',     value:emp.division },
              { label:'Type',         value:emp.employee_type },
              { label:'Phone',        value:emp.phone || '—' },
              { label:'Email',        value:emp.personal_email || '—' },
            ].map(row => (
              <div key={row.label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #1e293b' }}>
                <span style={{ fontSize:12, color:'#64748b', fontWeight:600 }}>{row.label}</span>
                <span style={{ fontSize:13, color:'#f1f5f9' }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Print button */}
          <button onClick={() => {
            const w = window.open('', '_blank')
            if (!w) return
            w.document.write(`<!DOCTYPE html><html><head><title>Clock-In Badge — ${emp.fname} ${emp.lname}</title>
            <style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f6f9;}
            .badge{background:#fff;border:2px solid #1e293b;border-radius:16px;padding:32px;text-align:center;max-width:300px;width:100%;}
            .name{font-size:22px;font-weight:800;color:#0a2540;margin:16px 0 4px;}
            .id{font-size:13px;color:#64748b;font-family:monospace;letter-spacing:.1em;}
            .div{font-size:13px;color:#16a34a;font-weight:600;margin-top:6px;}
            @media print{button{display:none!important}}</style></head><body>
            <div class="badge">
              <img src="https://phllandcare.github.io/phl-crm/phl_logo.jpg" style="width:60px;height:60px;border-radius:10px;object-fit:cover;margin-bottom:8px;" />
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(emp.employee_id)}&color=0a2540&bgcolor=ffffff&margin=2" style="width:200px;height:200px;border-radius:8px;" />
              <div class="name">${emp.fname} ${emp.lname}</div>
              <div class="id">${emp.employee_id}</div>
              <div class="div">${emp.division}</div>
              <p style="font-size:11px;color:#94a3b8;margin-top:12px">Scan at kiosk to clock in/out</p>
              <button onclick="window.print()" style="margin-top:12px;padding:8px 20px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">🖨️ Print Badge</button>
            </div></body></html>`)
            w.document.close()
          }} style={{ width:'100%', padding:'14px', background:'#1e293b', border:'1px solid #334155', borderRadius:12, color:'#f1f5f9', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
            🖨️ Print / Save My Badge
          </button>
        </div>
      )}

      {/* Bottom nav */}
      <div style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:480, background:'#0a1628', borderTop:'1px solid #1e293b', display:'flex' }}>
        {nav('Home', '🏠', 'home')}
        {nav('Schedule', '📋', 'schedule')}
        {nav('Clock', '⏱', 'timeclock')}
        {nav('Pay', '💰', 'pay')}
        {nav('My QR', '⊞', 'qr')}
      </div>
    </div>
  )
}
