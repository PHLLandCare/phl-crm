import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Employee {
  id: string
  employee_id: string
  fname: string
  lname: string
  division: string
}

const DIVISION_COLORS: Record<string, string> = {
  'Lawn & Tree':    '#16a34a',
  'Irrigation':     '#0ea5e9',
  'Extermination':  '#dc2626',
  'Nursery':        '#d97706',
  'Farm':           '#7c3aed',
}

function divColor(division: string) {
  return DIVISION_COLORS[division] || '#475569'
}

export default function ClockInPage() {
  const [employees, setEmployees]   = useState<Employee[]>([])
  const [openEvents, setOpenEvents] = useState<Set<string>>(new Set()) // employee_ids currently clocked in
  const [saving, setSaving]         = useState<string | null>(null)    // employee_id being saved
  const [done, setDone]             = useState<{ name: string; action: 'in' | 'out' } | null>(null)
  const [now, setNow]               = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const load = async () => {
      const [empRes, evtRes] = await Promise.all([
        supabase.from('employees').select('id,employee_id,fname,lname,division').eq('active', true).order('fname'),
        supabase.from('clock_events').select('employee_id').is('clock_out', null).not('clock_in', 'is', null),
      ])
      setEmployees(empRes.data ?? [])
      const open = new Set((evtRes.data ?? []).map((e: any) => e.employee_id as string))
      setOpenEvents(open)
    }
    load()
  }, [])

  const handleTap = async (emp: Employee) => {
    if (saving) return
    const isIn = openEvents.has(emp.employee_id)
    const action: 'in' | 'out' = isIn ? 'out' : 'in'
    setSaving(emp.employee_id)
    const ts = new Date().toISOString()

    if (action === 'in') {
      await supabase.from('clock_events').insert({
        employee_id:   emp.employee_id,
        employee_name: `${emp.fname} ${emp.lname}`,
        division:      emp.division,
        clock_in:      ts,
        method:        'Kiosk QR',
        flagged:       false,
      })
      setOpenEvents(prev => new Set([...prev, emp.employee_id]))
    } else {
      const { data: open } = await supabase
        .from('clock_events')
        .select('id')
        .eq('employee_id', emp.employee_id)
        .is('clock_out', null)
        .not('clock_in', 'is', null)
        .order('clock_in', { ascending: false })
        .limit(1)

      if (open && open.length > 0) {
        await supabase.from('clock_events').update({ clock_out: ts }).eq('id', open[0].id)
      }
      setOpenEvents(prev => { const s = new Set(prev); s.delete(emp.employee_id); return s })
    }

    setSaving(null)
    setDone({ name: `${emp.fname} ${emp.lname}`, action })
    setTimeout(() => setDone(null), 2500)
  }

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div style={{ minHeight: '100vh', background: '#060d18', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>

      {/* Top bar */}
      <div style={{ background: '#0a1628', borderBottom: '1px solid #1e293b', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="https://phllandcare.github.io/phl-crm/phl_logo.jpg" alt="PHL" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>PHL Land Care</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Employee Time Clock</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', fontVariantNumeric: 'tabular-nums' }}>{timeStr}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{dateStr}</div>
        </div>
      </div>

      {/* Success flash */}
      {done && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: done.action === 'in' ? 'rgba(22,163,74,0.97)' : 'rgba(220,38,38,0.97)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, animation: 'fadeIn .15s ease'
        }}>
          <div style={{ fontSize: 80, marginBottom: 16 }}>{done.action === 'in' ? '✅' : '👋'}</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
            {done.action === 'in' ? 'Clocked In!' : 'Clocked Out!'}
          </div>
          <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.85)' }}>{done.name}</div>
        </div>
      )}

      {/* Instruction */}
      <div style={{ textAlign: 'center', padding: '20px 16px 8px', color: '#64748b', fontSize: 14 }}>
        Tap your name to clock in or out
      </div>

      {/* Employee grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, padding: '12px 16px 32px' }}>
        {employees.map(emp => {
          const isIn    = openEvents.has(emp.employee_id)
          const isBusy  = saving === emp.employee_id
          const color   = divColor(emp.division)

          return (
            <button
              key={emp.id}
              onClick={() => handleTap(emp)}
              disabled={!!saving}
              style={{
                background:    isIn ? `${color}22` : '#0f172a',
                border:        `2px solid ${isIn ? color : '#1e293b'}`,
                borderRadius:  16,
                padding:       '18px 12px',
                cursor:        saving ? 'default' : 'pointer',
                textAlign:     'center',
                transition:    'all .15s',
                opacity:       isBusy ? 0.6 : 1,
                display:       'flex',
                flexDirection: 'column',
                alignItems:    'center',
                gap:           10,
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 54, height: 54, borderRadius: '50%',
                background: isIn ? color : '#1e293b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 800, color: isIn ? '#fff' : '#64748b',
                border: isIn ? `3px solid ${color}` : '3px solid #334155',
                transition: 'all .15s',
              }}>
                {isBusy ? '⏳' : `${emp.fname[0]}${emp.lname[0]}`}
              </div>

              {/* Name */}
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2 }}>
                  {emp.fname}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.2 }}>
                  {emp.lname}
                </div>
              </div>

              {/* Status badge */}
              <div style={{
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: isIn ? color : '#1e293b',
                color:      isIn ? '#fff' : '#475569',
              }}>
                {isIn ? '● Clocked In' : 'Tap to Clock In'}
              </div>
            </button>
          )
        })}
      </div>

      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  )
}
