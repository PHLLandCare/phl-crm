import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const COMPANY = {
  name: 'PHL Land Care Inc.',
  address: '123 PHL Way',
  cityStateZip: 'Lake Park, FL 33403',
  email: 'info@phllandcare.com',
  logo: 'https://phllandcare.github.io/phl-crm/phl_logo.jpg',
}

interface Employee {
  id: string
  employee_id: string
  fname: string
  lname: string
  role: string
  hourly_rate: number
  employee_type: 'W2' | '1099'
  division?: string
}

interface ClockEvent {
  employee_id: string
  event_type: string
  timestamp: string
}

// Get Monday of week offset by n weeks from today
function getWeekStart(offset = 0): Date {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + offset * 7
  const mon = new Date(d.setDate(diff))
  mon.setHours(0, 0, 0, 0)
  return mon
}

function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
}

// Federal income tax withholding (2024 IRS Pub 15-T single filer weekly payroll)
function federalWithholding(weeklyGross: number): number {
  const tiers = [
    [0, 73, 0, 0],
    [73, 260, 0, 0.10],
    [260, 834, 18.7, 0.12],
    [834, 1731, 87.58, 0.22],
    [1731, 3315, 284.92, 0.24],
    [3315, 4213, 665.08, 0.32],
    [4213, 10275, 952.44, 0.35],
    [10275, Infinity, 3073.89, 0.37],
  ]
  for (const [low, high, base, rate] of tiers) {
    if (weeklyGross >= low && weeklyGross < high) return base + (weeklyGross - low) * rate
  }
  return 0
}

export default function PayrollPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [clockEvents, setClockEvents] = useState<ClockEvent[]>([])
  const [manualHours, setManualHours] = useState<Record<string, Record<string, number>>>({})
  const [weekOffset, setWeekOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'payroll' | 'stubs' | 'history'>('payroll')
  const [stubEmp, setStubEmp] = useState<Employee | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const weekStart = getWeekStart(weekOffset)
  const days = weekDays(weekStart)
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [empRes, clockRes] = await Promise.all([
        supabase.from('employees').select('*').eq('active', true).order('fname'),
        supabase.from('clock_events').select('*')
          .gte('timestamp', weekStart.toISOString())
          .lt('timestamp', new Date(weekStart.getTime() + 7 * 86400000).toISOString()),
      ])
      setEmployees(empRes.data ?? [])
      setClockEvents(clockRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [weekOffset])

  // Compute clock hours per employee per day
  const clockHours = (empId: string, dayIdx: number): number => {
    const day = days[dayIdx]
    const dayStart = day.getTime()
    const dayEnd = dayStart + 86400000
    const events = clockEvents
      .filter(e => e.employee_id === empId && new Date(e.timestamp).getTime() >= dayStart && new Date(e.timestamp).getTime() < dayEnd)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    let hrs = 0
    let lastIn: number | null = null
    for (const ev of events) {
      if (ev.event_type === 'in') lastIn = new Date(ev.timestamp).getTime()
      else if (ev.event_type === 'out' && lastIn) { hrs += (new Date(ev.timestamp).getTime() - lastIn) / 3600000; lastIn = null }
    }
    return Math.round(hrs * 100) / 100
  }

  const getHours = (empId: string, dayIdx: number): number => {
    return manualHours[empId]?.[dayIdx] ?? clockHours(empId, dayIdx)
  }

  const totalHours = (emp: Employee): number => days.reduce((a, _, i) => a + getHours(emp.employee_id, i), 0)

  const calcPay = (emp: Employee) => {
    const rate = emp.hourly_rate || 15
    const total = totalHours(emp)
    const regular = Math.min(total, 40)
    const overtime = Math.max(total - 40, 0)
    const gross = regular * rate + overtime * rate * 1.5
    if (emp.employee_type === '1099') return { gross, federal: 0, ss: 0, medicare: 0, net: gross, regular, overtime, rate }
    const federal = federalWithholding(gross)
    const ss = gross * 0.062
    const medicare = gross * 0.0145
    const net = gross - federal - ss - medicare
    return { gross, federal, ss, medicare, net, regular, overtime, rate }
  }

  const totals = employees.reduce((acc, emp) => {
    const p = calcPay(emp)
    return { ...acc, gross: acc.gross + p.gross, net: acc.net + p.net, hours: acc.hours + totalHours(emp) }
  }, { gross: 0, net: 0, hours: 0 })

  const fmt = (n: number) => `$${n.toFixed(2)}`
  const fmtH = (n: number) => `${n.toFixed(1)}h`

  const printStub = (emp: Employee) => {
    setStubEmp(emp)
    setTimeout(() => {
      const w = window.open('', '_blank')
      if (!w || !printRef.current) return
      w.document.write(`<html><head><title>Paystub</title><style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #111; }
        * { box-sizing: border-box; }
      </style></head><body>`)
      w.document.write(printRef.current.innerHTML)
      w.document.write('</body></html>')
      w.document.close()
      w.focus()
      setTimeout(() => { w.print(); w.close() }, 400)
    }, 100)
  }

  const printAll = () => employees.forEach(e => printStub(e))

  const exportCSV = () => {
    const rows = [['Employee', 'Type', 'Rate', 'Regular Hrs', 'OT Hrs', 'Gross', 'Federal', 'SS', 'Medicare', 'Net']]
    employees.forEach(emp => {
      const p = calcPay(emp)
      rows.push([`${emp.fname} ${emp.lname}`, emp.employee_type, String(p.rate), fmtH(p.regular), fmtH(p.overtime), fmt(p.gross), fmt(p.federal), fmt(p.ss), fmt(p.medicare), fmt(p.net)])
    })
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `payroll_${weekStart.toLocaleDateString().replace(/\//g,'-')}.csv`
    a.click()
  }

  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <div style={{ padding: '2rem', maxWidth: 1300, margin: '0 auto', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Payroll</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>{weekLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' }}>‹</button>
            <span style={{ fontSize: 13, color: '#6b7280', minWidth: 120, textAlign: 'center' }}>{weekLabel}</span>
            <button onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, cursor: weekOffset < 0 ? 'pointer' : 'not-allowed', fontSize: 16, fontFamily: 'inherit', opacity: weekOffset >= 0 ? 0.4 : 1 }}>›</button>
          </div>
          <button onClick={exportCSV} style={{ padding: '9px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600 }}>📥 Export CSV</button>
          <button onClick={printAll} style={{ padding: '9px 16px', background: '#16a34a', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600, color: '#fff' }}>🖨️ Print All Stubs</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
        {[{id:'payroll',label:'Payroll'},{id:'stubs',label:'Pay Stubs'},{id:'history',label:'Punch History'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{ padding: '10px 20px', border: 'none', background: 'transparent', color: tab === t.id ? '#16a34a' : '#6b7280', fontWeight: tab === t.id ? 700 : 400, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', borderBottom: tab === t.id ? '2px solid #16a34a' : '2px solid transparent', marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: '1.5rem' }}>
        {[
          { label: 'Employees', value: employees.length },
          { label: 'Total Hrs', value: fmtH(totals.hours) },
          { label: 'Overtime Hrs', value: fmtH(employees.reduce((a, e) => a + Math.max(totalHours(e) - 40, 0), 0)) },
          { label: 'Gross Payroll', value: fmt(totals.gross) },
          { label: 'Net Payroll', value: fmt(totals.net) },
          { label: 'Employer Taxes', value: fmt(employees.filter(e => e.employee_type === 'W2').reduce((a, e) => { const g = calcPay(e).gross; return a + g * 0.062 + g * 0.0145 + g * 0.006 }, 0)) },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '1rem', border: '1px solid #e5e7eb' }}>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 4px' }}>{s.label}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {tab === 'payroll' && !loading && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={th}>Employee</th>
                <th style={th}>Type / Rate</th>
                {DAY_LABELS.map(d => <th key={d} style={{ ...th, textAlign: 'center' }}>{d}</th>)}
                <th style={th}>Total Hrs</th>
                <th style={th}>OT Hrs</th>
                <th style={th}>Gross</th>
                <th style={th}>Tax</th>
                <th style={th}>Net</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr><td colSpan={13} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>No employees found</td></tr>
              ) : employees.map(emp => {
                const p = calcPay(emp)
                const isManual = (i: number) => manualHours[emp.employee_id]?.[i] !== undefined
                return (
                  <tr key={emp.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={td}><span style={{ fontWeight: 600 }}>{emp.fname} {emp.lname}</span><br /><span style={{ fontSize: 11, color: '#6b7280' }}>{emp.employee_id}</span></td>
                    <td style={td}>
                      <span style={{ background: emp.employee_type === 'W2' ? '#dbeafe' : '#fef9c3', color: emp.employee_type === 'W2' ? '#1d4ed8' : '#854d0e', padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{emp.employee_type}</span>
                      <br /><span style={{ fontSize: 12, color: '#6b7280' }}>${emp.hourly_rate || 15}/hr</span>
                    </td>
                    {DAY_LABELS.map((_, i) => (
                      <td key={i} style={{ padding: '8px 6px', textAlign: 'center' }}>
                        <input
                          type="number" min="0" max="24" step="0.5"
                          placeholder={String(clockHours(emp.employee_id, i) || '0')}
                          value={manualHours[emp.employee_id]?.[i] ?? ''}
                          onChange={e => {
                            const v = parseFloat(e.target.value)
                            setManualHours(m => ({ ...m, [emp.employee_id]: { ...(m[emp.employee_id] || {}), [i]: isNaN(v) ? 0 : v } }))
                          }}
                          style={{ width: 46, height: 32, padding: '0 4px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, textAlign: 'center', outline: 'none', background: isManual(i) ? '#fef9c3' : '#fff', fontFamily: 'inherit' }}
                        />
                      </td>
                    ))}
                    <td style={{ ...td, fontWeight: 700 }}>{fmtH(totalHours(emp))}{p.overtime > 0 && <span style={{ color: '#f59e0b', fontSize: 11, marginLeft: 4 }}>+{fmtH(p.overtime)}OT</span>}</td>
                    <td style={{ ...td, color: p.overtime > 0 ? '#f59e0b' : '#9ca3af' }}>{fmtH(p.overtime)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{fmt(p.gross)}</td>
                    <td style={{ ...td, color: '#6b7280', fontSize: 12 }}>{emp.employee_type === 'W2' ? fmt(p.federal + p.ss + p.medicare) : '—'}</td>
                    <td style={{ ...td, fontWeight: 700, color: '#16a34a' }}>{fmt(p.net)}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <button onClick={() => printStub(emp)} style={{ padding: '5px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>🖨️ Stub</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'stubs' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {employees.map(emp => {
            const p = calcPay(emp)
            return (
              <div key={emp.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{emp.fname} {emp.lname}</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{emp.employee_id} · {emp.employee_type} · ${emp.hourly_rate || 15}/hr</p>
                  </div>
                  <button onClick={() => printStub(emp)} style={{ padding: '6px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>🖨️</button>
                </div>
                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 10, fontSize: 13 }}>
                  {[
                    { label: 'Regular', value: `${fmtH(p.regular)} × $${p.rate} = ${fmt(p.regular * p.rate)}` },
                    p.overtime > 0 ? { label: 'Overtime', value: `${fmtH(p.overtime)} × $${(p.rate * 1.5).toFixed(2)} = ${fmt(p.overtime * p.rate * 1.5)}`, color: '#f59e0b' } : null,
                    { label: 'Gross Pay', value: fmt(p.gross), bold: true },
                    emp.employee_type === 'W2' ? { label: 'Federal Income Tax', value: `-${fmt(p.federal)}`, color: '#ef4444' } : null,
                    emp.employee_type === 'W2' ? { label: 'Social Security', value: `-${fmt(p.ss)}`, color: '#ef4444' } : null,
                    emp.employee_type === 'W2' ? { label: 'Medicare', value: `-${fmt(p.medicare)}`, color: '#ef4444' } : null,
                    { label: 'Net Pay', value: fmt(p.net), bold: true, color: '#16a34a' },
                  ].filter(Boolean).map((row, i) => row && (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: row.bold ? '1px solid #e5e7eb' : 'none' }}>
                      <span style={{ color: '#374151', fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                      <span style={{ color: row.color || '#111827', fontWeight: row.bold ? 700 : 400 }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'history' && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Employee','Event','Date','Time'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {clockEvents.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>No clock events this week</td></tr>
              ) : clockEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((ev, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={td}>{ev.employee_id}</td>
                  <td style={td}><span style={{ background: ev.event_type === 'in' ? '#dcfce7' : '#fee2e2', color: ev.event_type === 'in' ? '#15803d' : '#dc2626', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>Clock {ev.event_type}</span></td>
                  <td style={td}>{new Date(ev.timestamp).toLocaleDateString()}</td>
                  <td style={td}>{new Date(ev.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Hidden print stub */}
      {stubEmp && (
        <div ref={printRef} style={{ display: 'none' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', padding: 32, border: '1px solid #ccc', borderRadius: 12, fontFamily: 'Arial,sans-serif' }}>
            {/* Company header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '2px solid #16a34a', paddingBottom: 16, marginBottom: 20 }}>
              <img src={COMPANY.logo} alt="PHL" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover' }} />
              <div>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{COMPANY.name}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#555' }}>{COMPANY.address}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#555' }}>{COMPANY.cityStateZip}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#555' }}>{COMPANY.email}</p>
              </div>
            </div>
            {/* Stub title */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 13, color: '#6b7280' }}>EMPLOYEE</p>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{stubEmp.fname} {stubEmp.lname}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{stubEmp.employee_id} · {stubEmp.employee_type} · ${stubEmp.hourly_rate || 15}/hr</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: '0 0 4px', fontSize: 13, color: '#6b7280' }}>PAY PERIOD</p>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{weekLabel}</p>
              </div>
            </div>
            {/* Earnings / deductions table */}
            {(() => {
              const p = calcPay(stubEmp)
              return (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 20 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Description</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Hours</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Rate</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>Regular Pay</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{p.regular.toFixed(1)}</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>${p.rate.toFixed(2)}</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>${(p.regular * p.rate).toFixed(2)}</td></tr>
                    {p.overtime > 0 && <tr><td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', color: '#f59e0b' }}>Overtime Pay</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{p.overtime.toFixed(1)}</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>${(p.rate * 1.5).toFixed(2)}</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6', color: '#f59e0b' }}>${(p.overtime * p.rate * 1.5).toFixed(2)}</td></tr>}
                    <tr style={{ background: '#f9fafb', fontWeight: 700 }}><td colSpan={3} style={{ padding: '8px 12px', borderBottom: '2px solid #e5e7eb' }}>Gross Pay</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>${p.gross.toFixed(2)}</td></tr>
                    {stubEmp.employee_type === 'W2' && <>
                      <tr><td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', color: '#dc2626' }}>Federal Income Tax</td><td colSpan={2} style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}></td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6', color: '#dc2626' }}>-${p.federal.toFixed(2)}</td></tr>
                      <tr><td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', color: '#dc2626' }}>Social Security (6.2%)</td><td colSpan={2} style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}></td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6', color: '#dc2626' }}>-${p.ss.toFixed(2)}</td></tr>
                      <tr><td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', color: '#dc2626' }}>Medicare (1.45%)</td><td colSpan={2} style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}></td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6', color: '#dc2626' }}>-${p.medicare.toFixed(2)}</td></tr>
                    </>}
                    <tr style={{ background: '#dcfce7', fontWeight: 700 }}><td colSpan={3} style={{ padding: '10px 12px', fontSize: 16 }}>Net Pay</td><td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 16, color: '#15803d' }}>${p.net.toFixed(2)}</td></tr>
                  </tbody>
                </table>
              )
            })()}
            <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>This is an official pay statement from {COMPANY.name} · {COMPANY.cityStateZip} · {COMPANY.email}</p>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '12px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }
const td: React.CSSProperties = { padding: '12px 12px', fontSize: 14 }
