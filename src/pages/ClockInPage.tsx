import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Employee {
  id: string
  employee_id: string
  fname: string
  lname: string
  division: string
}

export default function ClockInPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selected, setSelected] = useState<Employee | null>(null)
  const [action, setAction] = useState<'in' | 'out'>('in')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [search, setSearch] = useState('')
  const [now, setNow] = useState(new Date())

  // Read emp param from hash query string
  const empParam = new URLSearchParams(window.location.hash.split('?')[1] || '').get('emp')

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('employees').select('id,employee_id,fname,lname,division').eq('active', true).order('fname')
      const all = data ?? []
      setEmployees(all)
      // If emp param provided, auto-select
      if (empParam) {
        const match = all.find(e => e.employee_id === empParam)
        if (match) setSelected(match)
      }
    }
    load()
  }, [empParam])

  const filtered = employees.filter(e => {
    const q = search.toLowerCase()
    return `${e.fname} ${e.lname}`.toLowerCase().includes(q) || e.employee_id?.toLowerCase().includes(q)
  })

  const handleClockIn = async () => {
    if (!selected) return
    setSaving(true)
    const now = new Date().toISOString()

    if (action === 'in') {
      await supabase.from('clock_events').insert({
        employee_id: selected.employee_id,
        employee_name: `${selected.fname} ${selected.lname}`,
        division: selected.division,
        clock_in: now,
        method: 'Personal QR',
        flagged: false,
      })
    } else {
      const { data: open } = await supabase
        .from('clock_events')
        .select('id')
        .eq('employee_id', selected.employee_id)
        .is('clock_out', null)
        .not('clock_in', 'is', null)
        .order('clock_in', { ascending: false })
        .limit(1)

      if (open && open.length > 0) {
        await supabase.from('clock_events').update({ clock_out: now }).eq('id', open[0].id)
      } else {
        await supabase.from('clock_events').insert({
          employee_id: selected.employee_id,
          employee_name: `${selected.fname} ${selected.lname}`,
          division: selected.division,
          clock_out: now,
          method: 'Personal QR',
          flagged: false,
        })
      }
    }

    setSaving(false)
    setDone(true)
    setTimeout(() => { setDone(false); setSelected(null); setSearch('') }, 3000)
  }

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img src="https://phllandcare.github.io/phl-crm/phl_logo.jpg" alt="PHL" style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'cover', marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#f1f5f9' }}>{timeStr}</p>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>{dateStr}</p>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', background: '#0f172a', borderRadius: 20, padding: '3rem', border: '1px solid #16a34a' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#4ade80', margin: '0 0 8px' }}>{action === 'in' ? 'Clocked In!' : 'Clocked Out!'}</p>
            <p style={{ fontSize: 16, color: '#cbd5e1', margin: 0 }}>{selected?.fname} {selected?.lname}</p>
          </div>
        ) : (
          <div style={{ background: '#0f172a', borderRadius: 20, padding: '1.5rem', border: '1px solid #1e293b' }}>
            {/* In/Out toggle */}
            <div style={{ display: 'flex', background: '#0a0f1a', borderRadius: 12, padding: 4, marginBottom: '1.25rem', gap: 4 }}>
              {(['in', 'out'] as const).map(a => (
                <button key={a} onClick={() => setAction(a)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', background: action === a ? '#16a34a' : 'transparent', color: action === a ? '#fff' : '#64748b', transition: 'all .15s' }}>
                  Clock {a === 'in' ? 'In' : 'Out'}
                </button>
              ))}
            </div>

            {!empParam && (
              <>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or ID..." style={{ width: '100%', padding: '10px 14px', background: '#0a0f1a', border: '1px solid #1e293b', borderRadius: 10, color: '#f1f5f9', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                {search && (
                  <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12, borderRadius: 10, border: '1px solid #1e293b' }}>
                    {filtered.map(e => (
                      <button key={e.id} onClick={() => { setSelected(e); setSearch('') }} style={{ display: 'block', width: '100%', padding: '10px 14px', background: selected?.id === e.id ? 'rgba(74,222,128,0.1)' : 'transparent', border: 'none', borderBottom: '1px solid #1e293b', color: '#f1f5f9', textAlign: 'left', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                        <span style={{ fontWeight: 600 }}>{e.fname} {e.lname}</span>
                        <span style={{ color: '#64748b', marginLeft: 8, fontSize: 12 }}>{e.employee_id} · {e.division}</span>
                      </button>
                    ))}
                    {filtered.length === 0 && <p style={{ padding: '1rem', color: '#64748b', fontSize: 13, textAlign: 'center', margin: 0 }}>No employees found</p>}
                  </div>
                )}
              </>
            )}

            {selected && (
              <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12, padding: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {selected.fname[0]}{selected.lname[0]}
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: '#f1f5f9', fontSize: 16 }}>{selected.fname} {selected.lname}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{selected.employee_id} · {selected.division}</p>
                </div>
              </div>
            )}

            <button onClick={handleClockIn} disabled={!selected || saving} style={{ width: '100%', padding: '14px', background: selected ? '#16a34a' : '#1e293b', color: selected ? '#fff' : '#475569', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 17, cursor: selected ? 'pointer' : 'not-allowed', fontFamily: 'inherit', transition: 'all .15s' }}>
              {saving ? 'Saving...' : `Clock ${action === 'in' ? 'In' : 'Out'}${selected ? ` — ${selected.fname}` : ''}`}
            </button>
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <a href="https://phllandcare.github.io/phl-crm/" style={{ color: '#475569', fontSize: 13, textDecoration: 'none' }}>← Back to CRM</a>
        </p>
      </div>
    </div>
  )
}
