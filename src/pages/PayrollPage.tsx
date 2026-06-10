import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const COMPANY = {
  name: 'PHL Land Care Inc.',
  address: 'PO Box 13767',
  cityStateZip: 'Fort Pierce, FL 34979',
  email: 'admin@phllandcare.com',
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
  ssn?: string
}

interface ClockEvent {
  id: string
  employee_id: string
  employee_name: string
  division: string
  clock_in: string | null
  clock_out: string | null
  method: string
}

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

// Get local date string YYYY-MM-DD for a Date object
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function federalWithholding(weeklyGross: number): number {
  const tiers = [
    [0, 73, 0, 0],[73, 260, 0, 0.10],[260, 834, 18.7, 0.12],
    [834, 1731, 87.58, 0.22],[1731, 3315, 284.92, 0.24],
    [3315, 4213, 665.08, 0.32],[4213, 10275, 952.44, 0.35],
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
  const [todayEvents, setTodayEvents] = useState<ClockEvent[]>([])
  const [manualHours, setManualHours] = useState<Record<string, Record<string, number>>>({})
  const [weekOffset, setWeekOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'today' | 'payroll' | 'stubs' | 'history'>('today')
  const [stubEmp, setStubEmp] = useState<Employee | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const weekStart = getWeekStart(weekOffset)
  const days = weekDays(weekStart)
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // useRef keeps weekStart stable inside the realtime callback (avoids stale closure)
  const weekStartRef = React.useRef(weekStart)
  useEffect(() => { weekStartRef.current = weekStart }, [weekOffset])

  const loadPayrollData = async (currentWeekStart: Date) => {
    setLoading(true)
    // Today boundaries built from local date parts — avoids any timezone string-parse issues
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    const [empRes, clockRes] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('fname'),
      supabase.from('clock_events').select('*')
        .or(`clock_in.gte.${currentWeekStart.toISOString()},clock_out.gte.${currentWeekStart.toISOString()}`)
        .lt('clock_in', new Date(currentWeekStart.getTime() + 8 * 86400000).toISOString()),
    ])

    // Today's log: events started today + events ended today (overnight) + open sessions
    const [todayInRes, todayOutRes, openRes] = await Promise.all([
      // Started today
      supabase.from('clock_events').select('*')
        .gte('clock_in', todayStart.toISOString())
        .lte('clock_in', todayEnd.toISOString()),
      // Ended today — overnight sessions (clock_out is today, clock_in may be yesterday)
      supabase.from('clock_events').select('*')
        .gte('clock_out', todayStart.toISOString())
        .lte('clock_out', todayEnd.toISOString()),
      // Currently open — clocked in but not out yet (any start date)
      supabase.from('clock_events').select('*')
        .is('clock_out', null)
        .not('clock_in', 'is', null),
    ])

    // Merge and deduplicate by id
    const allTodayMap = new Map<string, any>()
    for (const ev of [...(todayInRes.data ?? []), ...(todayOutRes.data ?? []), ...(openRes.data ?? [])]) {
      allTodayMap.set(String(ev.id), ev)
    }
    const todayAll = Array.from(allTodayMap.values())
      .sort((a, b) => new Date(b.clock_in ?? b.clock_out ?? 0).getTime() - new Date(a.clock_in ?? a.clock_out ?? 0).getTime())

    setEmployees(empRes.data ?? [])
    setClockEvents(clockRes.data ?? [])
    setTodayEvents(todayAll)
    setLoading(false)
  }

  useEffect(() => {
    loadPayrollData(weekStart)

    // Realtime — use ref so callback always has current weekStart
    const channel = supabase
      .channel('payroll-clock-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clock_events' }, () => {
        loadPayrollData(weekStartRef.current)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [weekOffset])

  const clockHours = (empId: string, dayIdx: number): number => {
    const day = days[dayIdx]
    const dayStart = day.getTime()
    const dayEnd = dayStart + 86400000
    const events = clockEvents.filter(e =>
      e.employee_id === empId &&
      e.clock_in !== null &&
      new Date(e.clock_in).getTime() >= dayStart &&
      new Date(e.clock_in).getTime() < dayEnd
    )
    let hrs = 0
    for (const ev of events) {
      if (ev.clock_in && ev.clock_out) {
        hrs += (new Date(ev.clock_out).getTime() - new Date(ev.clock_in).getTime()) / 3600000
      }
    }
    return Math.round(hrs * 100) / 100
  }

  const getHours = (empId: string, dayIdx: number): number =>
    manualHours[empId]?.[dayIdx] ?? clockHours(empId, dayIdx)

  const totalHours = (emp: Employee): number =>
    days.reduce((a, _, i) => a + getHours(emp.employee_id, i), 0)

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

  const fmt  = (n: number) => `$${n.toFixed(2)}`
  const fmtH = (n: number) => `${n.toFixed(1)}h`

  // For Today's Log: show all punch events (each clock_in row), newest first
  // The "Status" column shows whether the event is open (clocked in) or closed (clocked out)
  const latestEventPerEmployee = (): ClockEvent[] => {
    // Return ALL events for today, sorted newest first — admins need to see every punch
    return [...todayEvents].sort((a, b) =>
      new Date(b.clock_in ?? 0).getTime() - new Date(a.clock_in ?? 0).getTime()
    )
  }

  // For status badge: is the employee currently clocked in (has an open event right now)?
  const isEmployeeCurrentlyClockedIn = (empId: string): boolean => {
    return todayEvents.some(e => e.employee_id === empId && e.clock_in && !e.clock_out)
  }

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

  const printAll = () => {
    if (!employees.length) return
    const w = window.open('', '_blank')
    if (!w) { alert('Pop-up blocked — please allow pop-ups for this site'); return }
    const stubHTML = (emp: Employee) => {
      const p = calcPay(emp)
      const overtimeRow = p.overtime > 0 ? `
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#d97706">Overtime Pay</td>
        <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f3f4f6">${p.overtime.toFixed(1)}</td>
        <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f3f4f6">$${(p.rate * 1.5).toFixed(2)}</td>
        <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f3f4f6;color:#d97706">$${(p.overtime * p.rate * 1.5).toFixed(2)}</td></tr>` : ''
      const taxRows = emp.employee_type === 'W2' ? `
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#dc2626">Federal Income Tax</td><td colspan="2" style="padding:8px 12px;border-bottom:1px solid #f3f4f6"></td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f3f4f6;color:#dc2626">-$${p.federal.toFixed(2)}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#dc2626">Social Security (6.2%)</td><td colspan="2" style="padding:8px 12px;border-bottom:1px solid #f3f4f6"></td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f3f4f6;color:#dc2626">-$${p.ss.toFixed(2)}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#dc2626">Medicare (1.45%)</td><td colspan="2" style="padding:8px 12px;border-bottom:1px solid #f3f4f6"></td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f3f4f6;color:#dc2626">-$${p.medicare.toFixed(2)}</td></tr>` : ''
      return `
        <div class="stub-page">
          <div style="display:flex;align-items:center;gap:16px;border-bottom:2px solid #16a34a;padding-bottom:16px;margin-bottom:20px">
            <img src="${COMPANY.logo}" style="width:60px;height:60px;border-radius:8px;object-fit:cover" />
            <div>
              <p style="margin:0;font-size:18px;font-weight:700">${COMPANY.name}</p>
              <p style="margin:0;font-size:13px;color:#555">${COMPANY.address}</p>
              <p style="margin:0;font-size:13px;color:#555">${COMPANY.cityStateZip}</p>
              <p style="margin:0;font-size:13px;color:#555">${COMPANY.email}</p>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
            <div>
              <p style="margin:0 0 4px;font-size:13px;color:#64748b">EMPLOYEE</p>
              <p style="margin:0;font-size:18px;font-weight:700">${emp.fname} ${emp.lname}</p>
              <p style="margin:0;font-size:12px;color:#64748b">${emp.employee_id} · ${emp.employee_type} · $${emp.hourly_rate || 15}/hr</p>
            </div>
            <div style="text-align:right">
              <p style="margin:0 0 4px;font-size:13px;color:#64748b">PAY PERIOD</p>
              <p style="margin:0;font-size:14px;font-weight:600">${weekLabel}</p>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
            <thead><tr style="background:#f8fafc">
              <th style="padding:8px 12px;text-align:left;border-bottom:1px solid #e5e7eb">Description</th>
              <th style="padding:8px 12px;text-align:right;border-bottom:1px solid #e5e7eb">Hours</th>
              <th style="padding:8px 12px;text-align:right;border-bottom:1px solid #e5e7eb">Rate</th>
              <th style="padding:8px 12px;text-align:right;border-bottom:1px solid #e5e7eb">Amount</th>
            </tr></thead>
            <tbody>
              <tr><td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">Regular Pay</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f3f4f6">${p.regular.toFixed(1)}</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f3f4f6">$${p.rate.toFixed(2)}</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f3f4f6">$${(p.regular * p.rate).toFixed(2)}</td></tr>
              ${overtimeRow}
              <tr style="font-weight:700"><td colspan="3" style="padding:8px 12px;border-bottom:2px solid #e5e7eb">Gross Pay</td><td style="padding:8px 12px;text-align:right;border-bottom:2px solid #e5e7eb">$${p.gross.toFixed(2)}</td></tr>
              ${taxRows}
              <tr style="background:#dcfce7;font-weight:700"><td colspan="3" style="padding:10px 12px;font-size:16px">Net Pay</td><td style="padding:10px 12px;text-align:right;font-size:16px;color:#15803d">$${p.net.toFixed(2)}</td></tr>
            </tbody>
          </table>
          <p style="margin:0;font-size:11px;color:#475569;text-align:center">This is an official pay statement from ${COMPANY.name} · ${COMPANY.cityStateZip} · ${COMPANY.email}</p>
        </div>`
    }
    w.document.write(`<!DOCTYPE html><html><head><title>Pay Stubs — ${weekLabel}</title>
      <style>* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: Arial, sans-serif; color: #111; background: #fff; }
      .stub-page { max-width: 640px; margin: 0 auto; padding: 32px; border: 1px solid #e5e7eb; }
      @media print { .stub-page { page-break-after: always; border: none; padding: 24px; } .stub-page:last-child { page-break-after: avoid; } .no-print { display: none !important; } }
      .print-header { text-align: center; padding: 20px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; }
      .print-btn { display: inline-block; margin: 16px 8px; padding: 10px 24px; background: #16a34a; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; }
      .print-btn.close { background: #64748b; }</style></head><body>
      <div class="print-header no-print">
        <h1 style="font-size:20px;margin-bottom:4px">Pay Stubs — ${weekLabel}</h1>
        <p style="font-size:13px;color:#64748b">${employees.length} employee${employees.length !== 1 ? 's' : ''} · PHL Land Care Inc.</p>
        <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
        <button class="print-btn close" onclick="window.close()">Close</button>
      </div>
      ${employees.map(emp => stubHTML(emp)).join('\n')}
    </body></html>`)
    w.document.close()
    w.focus()
  }

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
  const latestToday = latestEventPerEmployee()

  return (
    <div style={{ padding: '2rem', maxWidth: 1300, margin: '0 auto', background: '#0a0f1a', minHeight: '100vh', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', margin: '0 0 4px' }}>Payroll</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>{weekLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '8px 14px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', fontSize: 16, color: '#f1f5f9' }}>‹</button>
            <span style={{ fontSize: 13, color: '#64748b', minWidth: 120, textAlign: 'center' }}>{weekLabel}</span>
            <button onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0} style={{ padding: '8px 14px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, cursor: weekOffset < 0 ? 'pointer' : 'not-allowed', fontSize: 16, color: '#f1f5f9', opacity: weekOffset >= 0 ? 0.4 : 1 }}>›</button>
          </div>
          <button onClick={exportCSV} style={{ padding: '9px 16px', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>📥 Export CSV</button>
          <button onClick={printAll} style={{ padding: '9px 16px', background: '#16a34a', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff' }}>🖨️ Print All Stubs</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '1px solid #1e293b' }}>
        {[{id:'today',label:"Today's Log"},{id:'payroll',label:'Payroll'},{id:'stubs',label:'Pay Stubs'},{id:'history',label:'Punch History'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{ padding: '10px 20px', border: 'none', background: 'transparent', color: tab === t.id ? '#16a34a' : '#64748b', fontWeight: tab === t.id ? 700 : 400, fontSize: 14, cursor: 'pointer', borderBottom: tab === t.id ? '2px solid #16a34a' : '2px solid transparent', marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: '1.5rem' }}>
        {[
          { label: 'Employees',     value: employees.length,  color: '#60a5fa' },
          { label: 'Total Hrs',     value: fmtH(totals.hours), color: '#4ade80' },
          { label: 'Overtime Hrs',  value: fmtH(employees.reduce((a, e) => a + Math.max(totalHours(e) - 40, 0), 0)), color: '#fcd34d' },
          { label: 'Gross Payroll', value: fmt(totals.gross),  color: '#a78bfa' },
          { label: 'Net Payroll',   value: fmt(totals.net),    color: '#4ade80' },
          { label: 'Employer Taxes',value: fmt(employees.filter(e => e.employee_type === 'W2').reduce((a, e) => { const g = calcPay(e).gross; return a + g * 0.062 + g * 0.0145 + g * 0.006 }, 0)), color: '#f87171' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f172a', borderRadius: 12, padding: '1rem', border: '1px solid #1e293b', borderTop: `3px solid ${s.color}` }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>{s.label}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* TODAY'S LOG — one row per employee, latest event only */}
      {tab === 'today' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
            {(() => {
              // Count unique employees currently clocked in (have open event)
              const clockedInEmps = new Set(todayEvents.filter(e => e.clock_in && !e.clock_out).map(e => e.employee_id)).size
              const clockedOutEmps = new Set(todayEvents.filter(e => e.clock_out).map(e => e.employee_id)).size
              return [
                { label:'Currently Clocked In',  value: clockedInEmps,   color:'#4ade80' },
                { label:'Clocked Out Today',      value: clockedOutEmps,  color:'#64748b' },
                { label:'Total Punches Today',    value: todayEvents.length, color:'#60a5fa' },
                { label:'Active Employees',       value: employees.length, color:'#a78bfa' },
              ].map(s => (
                <div key={s.label} style={{ background:'#0f172a', border:'1px solid #1e293b', borderTop:`3px solid ${s.color}`, borderRadius:12, padding:'12px 14px' }}>
                  <p style={{ margin:'0 0 2px', fontSize:10, fontWeight:700, color:s.color, textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.label}</p>
                  <p style={{ margin:0, fontSize:24, fontWeight:800, color:'#f1f5f9' }}>{s.value === 0 ? '—' : s.value}</p>
                </div>
              ))
            })()}
          </div>
          <div style={{ background:'#0f172a', borderRadius:14, border:'1px solid #1e293b', overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e293b', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#f1f5f9' }}>
                Clock events — {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
              </p>
              <button onClick={() => {
                const rows = [['Employee','Employee ID','Division','Clock In','Clock Out','Hours','Method','Status']]
                latestToday.forEach((e: ClockEvent) => {
                  const hrs = e.clock_in && e.clock_out ? ((new Date(e.clock_out).getTime()-new Date(e.clock_in).getTime())/3600000).toFixed(2) : ''
                  const status = e.clock_out ? 'Clocked Out' : 'Clocked In'
                  rows.push([e.employee_name||'',e.employee_id||'',e.division||'',e.clock_in?new Date(e.clock_in).toLocaleTimeString():'',e.clock_out?new Date(e.clock_out).toLocaleTimeString():'',hrs,e.method||'',status])
                })
                const csv=rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n')
                const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`timeclock-${new Date().toISOString().slice(0,10)}.csv`;a.click()
              }} style={{ padding:'7px 14px', background:'#1e293b', border:'1px solid #334155', borderRadius:8, color:'#94a3b8', cursor:'pointer', fontSize:12, fontWeight:600 }}>
                📥 Export CSV
              </button>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#0a0f1a', borderBottom:'1px solid #1e293b' }}>
                  {['Employee','Division','Clock In','Clock Out','Hours','Method','Status',''].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {latestToday.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding:'3rem', textAlign:'center', color:'#475569', fontSize:13 }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>⏰</div>
                    <p style={{ margin:0 }}>No clock events today yet</p>
                  </td></tr>
                ) : latestToday.map((e: ClockEvent) => {
                  const hrs = e.clock_in && e.clock_out
                    ? ((new Date(e.clock_out).getTime()-new Date(e.clock_in).getTime())/3600000).toFixed(1)+'h'
                    : '—'
                  const isOpen = !!(e.clock_in && !e.clock_out)
                  const isCurrentIn = isEmployeeCurrentlyClockedIn(e.employee_id)
                  return (
                    <tr key={e.id} style={{ borderBottom:'1px solid #1e293b' }}>
                      <td style={{ padding:'11px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:28, height:28, borderRadius:'50%', background:'#16a34a', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
                            {(e.employee_name||'?').split(' ').map((n: string)=>n[0]).slice(0,2).join('').toUpperCase()}
                          </div>
                          <span style={{ fontSize:13, fontWeight:600, color:'#f1f5f9' }}>{e.employee_name||'—'}</span>
                        </div>
                      </td>
                      <td style={{ padding:'11px 14px', fontSize:12, color:'#64748b' }}>{e.division||'—'}</td>
                      <td style={{ padding:'11px 14px', fontSize:13, color:'#4ade80', fontWeight:600 }}>
                        {e.clock_in ? new Date(e.clock_in).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) : '—'}
                      </td>
                      <td style={{ padding:'11px 14px', fontSize:13, color:'#f87171' }}>
                        {e.clock_out ? new Date(e.clock_out).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) : '—'}
                      </td>
                      <td style={{ padding:'11px 14px', fontSize:13, fontWeight:700, color:'#f1f5f9' }}>{hrs}</td>
                      <td style={{ padding:'11px 14px' }}>
                        <span style={{ background:'rgba(96,165,250,0.15)',color:'#60a5fa',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600 }}>{e.method||'QR'}</span>
                      </td>
                      <td style={{ padding:'11px 14px' }}>
                        <span style={{ background:isOpen?'rgba(74,222,128,0.15)':'rgba(100,116,139,0.15)',color:isOpen?'#4ade80':'#94a3b8',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600 }}>
                          {isOpen ? '🟢 Clocked In' : '⏹ Clocked Out'}
                        </span>
                        {!isOpen && isCurrentIn && <span style={{ marginLeft:6, fontSize:10, color:'#4ade80' }}>re-clocked in</span>}
                      </td>
                      <td style={{ padding:'11px 10px' }}>
                        <button onClick={async () => {
                          if (!confirm('Delete this clock entry?')) return
                          await supabase.from('clock_events').delete().eq('id', e.id)
                          setTodayEvents(prev => prev.filter(ev => ev.id !== e.id))
                        }} style={{ background:'rgba(248,113,113,0.1)',color:'#f87171',border:'1px solid rgba(248,113,113,0.3)',borderRadius:6,padding:'3px 8px',fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:600 }}>
                          🗑
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'payroll' && !loading && (
        <div style={{ background: '#0f172a', borderRadius: 16, border: '1px solid #1e293b', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: '#0a0f1a', borderBottom: '1px solid #1e293b' }}>
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
                <tr><td colSpan={13} style={{ padding: '2rem', textAlign: 'center', color: '#475569' }}>No employees found</td></tr>
              ) : employees.map(emp => {
                const p = calcPay(emp)
                const isManual = (i: number) => manualHours[emp.employee_id]?.[i] !== undefined
                return (
                  <tr key={emp.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={td}><span style={{ fontWeight: 600, color:'#f1f5f9' }}>{emp.fname} {emp.lname}</span><br /><span style={{ fontSize: 11, color: '#64748b' }}>{emp.employee_id}</span></td>
                    <td style={td}>
                      <span style={{ background: emp.employee_type === 'W2' ? '#1e3a5f' : '#3b2f00', color: emp.employee_type === 'W2' ? '#60a5fa' : '#fbbf24', padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{emp.employee_type}</span>
                      <br /><span style={{ fontSize: 12, color: '#64748b' }}>${emp.hourly_rate || 15}/hr</span>
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
                          style={{ width: 46, height: 32, padding: '0 4px', border: '1px solid #334155', borderRadius: 6, fontSize: 12, textAlign: 'center', outline: 'none', background: isManual(i) ? '#3b2f00' : '#0f172a', color: '#f1f5f9', fontFamily: 'inherit' }}
                        />
                      </td>
                    ))}
                    <td style={{ ...td, fontWeight: 700, color:'#f1f5f9' }}>{fmtH(totalHours(emp))}{p.overtime > 0 && <span style={{ color: '#f59e0b', fontSize: 11, marginLeft: 4 }}>+{fmtH(p.overtime)}OT</span>}</td>
                    <td style={{ ...td, color: p.overtime > 0 ? '#f59e0b' : '#475569' }}>{fmtH(p.overtime)}</td>
                    <td style={{ ...td, fontWeight: 700, color:'#f1f5f9' }}>{fmt(p.gross)}</td>
                    <td style={{ ...td, color: '#64748b', fontSize: 12 }}>{emp.employee_type === 'W2' ? fmt(p.federal + p.ss + p.medicare) : '—'}</td>
                    <td style={{ ...td, fontWeight: 700, color: '#4ade80' }}>{fmt(p.net)}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <button onClick={() => printStub(emp)} style={{ padding: '5px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer', fontSize: 12, color:'#cbd5e1' }}>🖨️ Stub</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'stubs' && (
        <div style={{ background: '#0f172a', borderRadius: 16, border: '1px solid #1e293b', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ background: '#0a0f1a', borderBottom: '2px solid #1e293b' }}>
                {['Employee', 'ID · Type · Rate', 'Regular', 'Overtime', 'Gross Pay', 'Fed Tax', 'SS', 'Medicare', 'Net Pay', ''].map(h => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: '#475569' }}>No employees found</td></tr>
              ) : employees.map((emp, idx) => {
                const p = calcPay(emp)
                return (
                  <tr key={emp.id} style={{ borderBottom: '1px solid #1e293b', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '13px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {emp.fname[0]}{emp.lname[0]}
                        </div>
                        <span style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 14 }}>{emp.fname} {emp.lname}</span>
                      </div>
                    </td>
                    <td style={{ padding: '13px 14px' }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{emp.employee_id}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                        <span style={{ background: emp.employee_type === 'W2' ? '#1e3a5f' : '#3b2f00', color: emp.employee_type === 'W2' ? '#60a5fa' : '#fbbf24', padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{emp.employee_type}</span>
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>${emp.hourly_rate || 15}/hr</span>
                      </div>
                    </td>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: '#cbd5e1' }}>{fmtH(p.regular)}</td>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: p.overtime > 0 ? '#f59e0b' : '#475569', fontWeight: p.overtime > 0 ? 600 : 400 }}>{fmtH(p.overtime)}</td>
                    <td style={{ padding: '13px 14px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{fmt(p.gross)}</td>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: p.federal > 0 ? '#ef4444' : '#475569' }}>{emp.employee_type === 'W2' ? `-${fmt(p.federal)}` : '—'}</td>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: p.ss > 0 ? '#ef4444' : '#475569' }}>{emp.employee_type === 'W2' ? `-${fmt(p.ss)}` : '—'}</td>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: p.medicare > 0 ? '#ef4444' : '#475569' }}>{emp.employee_type === 'W2' ? `-${fmt(p.medicare)}` : '—'}</td>
                    <td style={{ padding: '13px 14px', fontSize: 15, fontWeight: 800, color: '#4ade80' }}>{fmt(p.net)}</td>
                    <td style={{ padding: '13px 14px' }}>
                      <button onClick={() => printStub(emp)} style={{ padding: '6px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 4 }}>🖨️ Stub</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {employees.length > 0 && (() => {
              const totalGross = employees.reduce((a, e) => a + calcPay(e).gross, 0)
              const totalFed   = employees.filter(e => e.employee_type === 'W2').reduce((a, e) => a + calcPay(e).federal, 0)
              const totalSS    = employees.filter(e => e.employee_type === 'W2').reduce((a, e) => a + calcPay(e).ss, 0)
              const totalMed   = employees.filter(e => e.employee_type === 'W2').reduce((a, e) => a + calcPay(e).medicare, 0)
              const totalNet   = employees.reduce((a, e) => a + calcPay(e).net, 0)
              return (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #334155', background: '#0a0f1a' }}>
                    <td colSpan={4} style={{ padding: '13px 14px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Totals ({employees.length} employees)</td>
                    <td style={{ padding: '13px 14px', fontSize: 14, fontWeight: 800, color: '#f1f5f9' }}>{fmt(totalGross)}</td>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: '#ef4444', fontWeight: 600 }}>-{fmt(totalFed)}</td>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: '#ef4444', fontWeight: 600 }}>-{fmt(totalSS)}</td>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: '#ef4444', fontWeight: 600 }}>-{fmt(totalMed)}</td>
                    <td style={{ padding: '13px 14px', fontSize: 15, fontWeight: 800, color: '#4ade80' }}>{fmt(totalNet)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>
      )}

      {tab === 'history' && (
        <div style={{ background: '#0f172a', borderRadius: 14, border: '1px solid #1e293b', overflow: 'auto' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e293b', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#f1f5f9' }}>Punch History — {weekLabel}</p>
            <div style={{ fontSize:12, color:'#64748b' }}>{clockEvents.length} event{clockEvents.length !== 1 ? 's' : ''}</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0a0f1a', borderBottom: '1px solid #1e293b' }}>
                {['Employee','Date','Clock In','Clock Out','Hours','Method','Status'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {clockEvents.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#475569' }}>No clock events this week</td></tr>
              ) : [...clockEvents].sort((a, b) => new Date(b.clock_in ?? 0).getTime() - new Date(a.clock_in ?? 0).getTime()).map((ev, i) => {
                const inTime  = ev.clock_in  ? new Date(ev.clock_in)  : null
                const outTime = ev.clock_out ? new Date(ev.clock_out) : null
                const hrs = inTime && outTime
                  ? ((outTime.getTime() - inTime.getTime()) / 3600000).toFixed(2)
                  : null
                const isActive = !!(ev.clock_in && !ev.clock_out)
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #1e293b', background: isActive ? 'rgba(74,222,128,0.03)' : 'transparent' }}>
                    <td style={td}>
                      <span style={{ fontWeight: 600, color:'#f1f5f9' }}>{ev.employee_name || ev.employee_id}</span>
                      <br/><span style={{ fontSize: 11, color: '#64748b' }}>{ev.employee_id}</span>
                    </td>
                    <td style={td}>{inTime ? inTime.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) : '—'}</td>
                    <td style={{ ...td, color: '#4ade80', fontWeight: 600 }}>
                      {inTime ? inTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td style={{ ...td, color: outTime ? '#f87171' : '#475569' }}>
                      {outTime
                        ? outTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                        : <span style={{ background: '#16a34a22', color: '#4ade80', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Active</span>}
                    </td>
                    <td style={{ ...td, fontWeight: 600, color: hrs ? '#f1f5f9' : '#475569' }}>
                      {hrs ? `${hrs}h` : isActive ? <span style={{ color:'#4ade80', fontSize:11 }}>In progress</span> : '—'}
                    </td>
                    <td style={td}><span style={{ background:'rgba(96,165,250,0.15)',color:'#60a5fa',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600 }}>{ev.method||'QR'}</span></td>
                    <td style={td}>
                      <span style={{ background: isActive?'rgba(74,222,128,0.15)':'rgba(100,116,139,0.15)', color: isActive?'#4ade80':'#94a3b8', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600 }}>
                        {isActive ? '🟢 Clocked In' : '⏹ Clocked Out'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Hidden print stub */}
      {stubEmp && (
        <div ref={printRef} style={{ display: 'none' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', padding: 32, border: '1px solid #ccc', borderRadius: 12, fontFamily: 'Arial,sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '2px solid #16a34a', paddingBottom: 16, marginBottom: 20 }}>
              <img src={COMPANY.logo} alt="PHL" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover' }} />
              <div>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{COMPANY.name}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#555' }}>{COMPANY.address}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#555' }}>{COMPANY.cityStateZip}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#555' }}>{COMPANY.email}</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 13, color: '#64748b' }}>EMPLOYEE</p>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{stubEmp.fname} {stubEmp.lname}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{stubEmp.employee_id} · {stubEmp.employee_type} · ${stubEmp.hourly_rate || 15}/hr</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: '0 0 4px', fontSize: 13, color: '#64748b' }}>PAY PERIOD</p>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{weekLabel}</p>
              </div>
            </div>
            {(() => {
              const p = calcPay(stubEmp)
              return (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 20 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Description</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Hours</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Rate</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>Regular Pay</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{p.regular.toFixed(1)}</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>${p.rate.toFixed(2)}</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>${(p.regular * p.rate).toFixed(2)}</td></tr>
                    {p.overtime > 0 && <tr><td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', color: '#f59e0b' }}>Overtime Pay</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{p.overtime.toFixed(1)}</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>${(p.rate * 1.5).toFixed(2)}</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6', color: '#f59e0b' }}>${(p.overtime * p.rate * 1.5).toFixed(2)}</td></tr>}
                    <tr style={{ background: '#f8fafc', fontWeight: 700 }}><td colSpan={3} style={{ padding: '8px 12px', borderBottom: '2px solid #e5e7eb' }}>Gross Pay</td><td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>${p.gross.toFixed(2)}</td></tr>
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
            <p style={{ margin: 0, fontSize: 11, color: '#475569', textAlign: 'center' }}>This is an official pay statement from {COMPANY.name} · {COMPANY.cityStateZip} · {COMPANY.email}</p>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '12px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b' }
const td: React.CSSProperties = { padding: '12px 12px', fontSize: 14, color: '#cbd5e1' }
