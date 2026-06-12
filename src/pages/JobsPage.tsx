import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getCurrentUserAccess, filterAssignedTo, type CurrentUserAccess } from '../lib/currentUserAccess'

interface Job {
  id: string
  job_number: string
  title: string
  description: string | null
  client_id: string | null
  client_name: string
  status: string
  job_type: string | null
  priority: string
  scheduled_start: string | null
  scheduled_end: string | null
  actual_start: string | null
  actual_end: string | null
  assigned_to: string | null
  assigned_name: string | null
  service_address: string | null
  city: string | null
  state: string | null
  zip: string | null
  instructions: string | null
  customer_notes: string | null
  total_amount: number
  job_recurrence?: string | null
  line_items?: any[]
  invoiced?: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

interface JobLineItem {
  id?: number
  name: string
  description: string
  qty: number
  unit_price: number
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:       { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
  scheduled:   { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
  in_progress: { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24' },
  completed:   { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' },
  cancelled:   { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  on_hold:     { bg: 'rgba(251,146,60,0.15)',  color: '#fb923c' },
}

const JOB_TYPES = [
  { value: 'lawn_care',    label: 'Lawn Care'    },
  { value: 'landscaping',  label: 'Landscaping'  },
  { value: 'irrigation',   label: 'Irrigation'   },
  { value: 'tree_service', label: 'Tree Service'  },
  { value: 'pest_control', label: 'Pest Control'  },
  { value: 'other',        label: 'Other'         },
]

const ALL_STATUSES = ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled', 'on_hold']

const REPEAT_OPTIONS = ['Does not repeat','Daily','Weekly','Every 2 weeks','Every 4 weeks','Monthly','Custom...']

const INVOICE_FREQUENCIES = [
  'Per visit', 'Monthly', 'Start of month', 'End of month',
  'Bi-weekly', 'Weekly', 'When job is complete', 'Custom'
]

const PHL_SERVICES = [
  { name: 'Free Assessment', description: 'Our experts will come to assess your needs and discuss solutions', unit_price: 0 },
  { name: 'Lawn Mowing Service', description: 'Weekly lawn mowing including trimming, edging, and blowing off clippings.', unit_price: 0 },
  { name: 'Core Aeration Service', description: 'Core aeration of lawn to reduce soil compaction, promote root growth, and improve nutrient uptake.', unit_price: 0 },
  { name: 'Mulch Installation', description: 'Delivery and installation of premium mulch to landscape beds, including bed preparation and edging.', unit_price: 0 },
  { name: 'Yard Clean Up', description: 'Includes trimming of trees and bushes, removal of weeds and debris from property, and hauling away yard waste.', unit_price: 0 },
  { name: 'Fertilizer and Weed Control Program', description: 'Annual program with pre-emergent, post-emergent, and fertilizer treatments.', unit_price: 0 },
  { name: 'Pest Control Bundle', description: 'Year-round perimeter pest control applications every 6-8 weeks.', unit_price: 0 },
  { name: 'Tree Trimming', description: 'Pruning of trees to remove dead or dangerous branches and promote healthy growth.', unit_price: 0 },
  { name: 'Irrigation System Startup', description: 'Spring startup service includes opening valves, setting timer, pressurizing system, and inspecting heads.', unit_price: 0 },
  { name: 'Landscape Enhancement Services', description: 'Design and installation services for wall construction, patio design, tree and shrub installation.', unit_price: 0 },
]

const EMPTY_FORM = {
  title: '', description: '', client_id: '', client_name: '', status: 'draft',
  job_type: '', priority: 'normal', scheduled_start: '', scheduled_end: '',
  assigned_to: '', assigned_name: '', service_address: '', city: '', state: '', zip: '',
  instructions: '', customer_notes: '', total_amount: '', job_recurrence: 'Does not repeat',
  irrigation: 'No', pest_control: 'No', landscape: 'Landscape',
  invoice_frequency: 'When job is complete', auto_invoice: true, split_invoices: false,
  discount: 0, discount_type: 'percent', tax: 0,
  internal_notes: '', salesperson_id: '', salesperson_name: '', line_items: [] as any[],
}

// ══════════════════════════════════════════════════════════
// JOB DETAIL VIEW — Jobber-style full detail page
// ══════════════════════════════════════════════════════════
function JobDetailView({ job, isLate, svcAddress, sc, statusLabel, fmtDate, fmt, JOB_TYPES, ALL_STATUSES, onBack, onEdit, onDelete, onStatusChange, onSmsClient, onCreateInvoice, setToast }: any) {
  const [detailTab, setDetailTab] = useState<'overview'|'visits'|'billing'|'reminders'>('overview')
  const [billingTab, setBillingTab] = useState<'invoicing'|'reminders'>('invoicing')
  const [jobInvoices, setJobInvoices] = useState<any[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [jobNotes, setJobNotes] = useState<string>('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [showLateVisit, setShowLateVisit] = useState(false)

  // profitability: revenue vs costs
  const revenue = job.total_amount || 0
  const profitPct = revenue > 0 ? 100 : 0

  useEffect(() => {
    if (detailTab === 'billing') loadInvoices()
  }, [detailTab])

  const loadInvoices = async () => {
    setLoadingInvoices(true)
    const { data } = await supabase
      .from('invoices')
      .select('id,invoice_number,status,amount,due_date,title,created_at')
      .or(`client_id.eq.${job.client_id},title.ilike.%${job.title?.replace(/'/g,"''")}%`)
      .order('due_date', { ascending: false })
    setJobInvoices(data ?? [])
    setLoadingInvoices(false)
  }

  const INV_STATUS: Record<string, { bg: string; color: string; label: string }> = {
    draft:     { bg:'rgba(100,116,139,0.15)', color:'#94a3b8', label:'Draft' },
    sent:      { bg:'rgba(251,191,36,0.15)',  color:'#fbbf24', label:'Awaiting payment' },
    partial:   { bg:'rgba(251,146,60,0.15)',  color:'#fb923c', label:'Partial' },
    paid:      { bg:'rgba(74,222,128,0.15)',  color:'#4ade80', label:'Paid' },
    overdue:   { bg:'rgba(248,113,113,0.15)', color:'#f87171', label:'Overdue' },
    void:      { bg:'rgba(100,116,139,0.1)',  color:'#475569', label:'Void' },
  }

  // Scheduled visits — derived from job recurrence or just the job itself
  const visits = (() => {
    if (!job.scheduled_start) return []
    const visits: any[] = []
    const start = new Date(job.scheduled_start)
    const end = job.scheduled_end ? new Date(job.scheduled_end) : null
    if (!job.job_recurrence || job.job_recurrence === 'Does not repeat') {
      visits.push({ date: start, status: job.status })
    } else {
      // Generate up to 20 visits from recurrence
      const now = new Date()
      let cur = new Date(start)
      let count = 0
      while (count < 20 && (!end || cur <= end)) {
        visits.push({ date: new Date(cur), status: cur < now && job.status !== 'completed' ? 'overdue' : job.status })
        if (job.job_recurrence === 'Weekly') cur.setDate(cur.getDate() + 7)
        else if (job.job_recurrence === 'Every 2 weeks') cur.setDate(cur.getDate() + 14)
        else if (job.job_recurrence === 'Every 4 weeks') cur.setDate(cur.getDate() + 28)
        else if (job.job_recurrence === 'Monthly') cur.setMonth(cur.getMonth() + 1)
        else if (job.job_recurrence === 'Daily') cur.setDate(cur.getDate() + 1)
        else break
        count++
      }
    }
    return visits
  })()

  const lateVisits = visits.filter(v => v.status === 'overdue')
  const upcomingVisits = visits.filter(v => v.status !== 'overdue' && v.status !== 'completed')

  const card: React.CSSProperties = { background:'#0f172a', border:'1px solid #1e293b', borderRadius:14, padding:'1.25rem', marginBottom:16 }
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding:'8px 18px', border:'none', borderRadius:0, background:'transparent', cursor:'pointer', fontFamily:'inherit',
    fontSize:13, fontWeight:700, color: active ? '#f1f5f9' : '#64748b',
    borderBottom: active ? '2px solid #16a34a' : '2px solid transparent',
  })

  return (
    <div style={{ background:'#0a0f1a', minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      {/* ── TOP HEADER ── */}
      <div style={{ background:'#0f172a', borderBottom:'1px solid #1e293b', padding:'0 2rem' }}>
        {/* breadcrumb */}
        <div style={{ paddingTop:16, paddingBottom:8 }}>
          <button onClick={onBack} style={{ background:'none',border:'none',color:'#64748b',fontSize:13,cursor:'pointer',fontFamily:'inherit',padding:0 }}>
            ← Jobs
          </button>
        </div>
        {/* title row */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12, paddingBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <div style={{ width:36, height:36, background:'rgba(22,163,74,0.15)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🔧</div>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                {isLate && <span style={{ background:'rgba(239,68,68,0.15)', color:'#f87171', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700 }}>● Late</span>}
                <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'#f1f5f9' }}>{job.title}</h1>
              </div>
              <p style={{ margin:'2px 0 0', fontSize:13, color:'#64748b' }}>{job.client_name}{svcAddress ? ` · ${svcAddress}` : ''}</p>
            </div>
          </div>
          {/* action buttons */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <button onClick={onSmsClient} style={{ padding:'7px 14px', background:'rgba(167,139,250,0.1)', color:'#a78bfa', border:'1px solid rgba(167,139,250,0.3)', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>💬 SMS</button>
            <button onClick={onCreateInvoice} style={{ padding:'7px 14px', background:'rgba(96,165,250,0.1)', color:'#60a5fa', border:'1px solid rgba(96,165,250,0.3)', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>📄 Invoice</button>
            {lateVisits.length > 0 && (
              <button onClick={() => setShowLateVisit(!showLateVisit)} style={{ padding:'7px 14px', background:'rgba(74,222,128,0.15)', color:'#4ade80', border:'1px solid rgba(74,222,128,0.3)', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>📍 Show Late Visit</button>
            )}
            <button onClick={onEdit} style={{ padding:'7px 16px', background:'rgba(100,116,139,0.15)', color:'#94a3b8', border:'1px solid #1e293b', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>••• More</button>
            <button onClick={onEdit} style={{ padding:'7px 16px', background:'#16a34a', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Edit Job</button>
          </div>
        </div>
        {/* nav tabs */}
        <div style={{ display:'flex', gap:0, borderTop:'1px solid #1e293b', marginTop:4 }}>
          {(['overview','visits','billing','reminders'] as const).map(t => (
            <button key={t} onClick={() => setDetailTab(t)} style={tabBtn(detailTab === t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENT + RIGHT PANEL ── */}
      <div style={{ display:'flex', flex:1, gap:0 }}>
        {/* LEFT MAIN CONTENT */}
        <div style={{ flex:1, padding:'1.5rem 2rem', overflow:'auto' }}>

          {/* ── OVERVIEW TAB ── */}
          {detailTab === 'overview' && (
            <>
              {/* Client card */}
              <div style={card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:700, color:'#4ade80' }}>{job.client_name} <span style={{ width:8, height:8, background:'#4ade80', borderRadius:'50%', display:'inline-block', verticalAlign:'middle' }}/></p>
                    {svcAddress && <p style={{ margin:'2px 0', fontSize:12, color:'#64748b' }}>Property Address<br/><span style={{ color:'#cbd5e1' }}>{svcAddress}</span></p>}
                    {job.instructions && <p style={{ margin:'6px 0 0', fontSize:12, color:'#475569' }}>{job.client_name?.split(' ')[0]}'s phone on file</p>}
                  </div>
                  <button style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:18, padding:'0 4px' }}>•••</button>
                </div>
              </div>

              {/* Job fields grid — matches Jobber exactly */}
              <div style={card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' } as any}>Job Details</span>
                  <button onClick={onEdit} style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:16 }}>✏️</button>
                </div>
                <div style={{ display:'grid', gap:0 }}>
                  {[
                    { label:'Job #',             value: job.job_number || '—' },
                    { label:'Job type',           value: job.job_recurrence && job.job_recurrence !== 'Does not repeat' ? 'Recurring job' : 'One-off job' },
                    { label:'Started on',         value: fmtDate(job.scheduled_start) },
                    { label:'Lasts for',          value: job.scheduled_end && job.scheduled_start ? (() => {
                      const ms = new Date(job.scheduled_end).getTime() - new Date(job.scheduled_start).getTime()
                      const days = Math.round(ms / 86400000)
                      if (days >= 365) return `${Math.round(days/365)} year${Math.round(days/365)>1?'s':''}`
                      if (days >= 30) return `${Math.round(days/30)} month${Math.round(days/30)>1?'s':''}`
                      return `${days} day${days!==1?'s':''}`
                    })() : '—' },
                    { label:'Billing frequency',  value: (job as any).invoice_frequency || '—' },
                    { label:'Billing type',       value: 'Fixed price' },
                    { label:'Schedule',           value: job.job_recurrence || 'Does not repeat' },
                    { label:'Salesperson',        value: job.assigned_name || '—' },
                    { label:'Irrigation',         value: (job as any).irrigation || '—' },
                    { label:'Pest Control',       value: (job as any).pest_control || '—' },
                  ].map(row => (
                    <div key={row.label} style={{ display:'grid', gridTemplateColumns:'180px 1fr', padding:'10px 0', borderBottom:'1px solid #1e293b' }}>
                      <span style={{ fontSize:13, color:'#64748b' }}>{row.label}</span>
                      <span style={{ fontSize:13, color:'#f1f5f9', fontWeight:500 }}>
                        {row.label === 'Salesperson' && job.assigned_name ? (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                            <span style={{ width:22, height:22, borderRadius:'50%', background:'rgba(74,222,128,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#4ade80' }}>
                              {job.assigned_name.split(' ').map((n:string) => n[0]).join('').slice(0,2)}
                            </span>
                            {job.assigned_name}
                          </span>
                        ) : row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Product / Service */}
              <div style={card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#f1f5f9' }}>Product / Service</span>
                  <button onClick={onEdit} style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:16 }}>✏️</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:'8px 16px', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase' }}>Line Item</span>
                  <span style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase' }}>Qty</span>
                  <span style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase' }}>Unit Price</span>
                  <span style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase' }}>Total</span>
                </div>
                {job.line_items?.length > 0 ? job.line_items.map((li: any, i: number) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:'8px 16px', padding:'10px 0', borderTop:'1px solid #1e293b' }}>
                    <div>
                      <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:600, color:'#f1f5f9' }}>{li.name}</p>
                      {li.description && <p style={{ margin:0, fontSize:12, color:'#64748b' }}>{li.description}</p>}
                    </div>
                    <span style={{ fontSize:13, color:'#f1f5f9', textAlign:'right' }}>{li.qty}</span>
                    <span style={{ fontSize:13, color:'#f1f5f9', textAlign:'right' }}>{li.unit_price > 0 ? `$${li.unit_price.toFixed(2)}` : '—'}</span>
                    <span style={{ fontSize:13, color:'#f1f5f9', fontWeight:700, textAlign:'right' }}>{li.unit_price > 0 ? `$${(li.qty * li.unit_price).toFixed(2)}` : '—'}</span>
                  </div>
                )) : (
                  <div style={{ padding:'20px 0', textAlign:'center', color:'#475569', fontSize:13 }}>
                    No line items — edit job to add services
                  </div>
                )}
                {job.total_amount > 0 && (
                  <div style={{ display:'flex', justifyContent:'flex-end', padding:'12px 0 0', borderTop:'1px solid #1e293b', gap:24 }}>
                    <span style={{ fontSize:13, color:'#64748b' }}>Total</span>
                    <span style={{ fontSize:15, fontWeight:800, color:'#4ade80' }}>{fmt(job.total_amount)}</span>
                  </div>
                )}
              </div>

              {/* Labor */}
              <div style={card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#f1f5f9' }}>Labor</span>
                  <button style={{ background:'none', border:'none', color:'#64748b', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>+ Add Time Entry</button>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12, color:'#475569', fontSize:13, padding:'8px 0' }}>
                  <span style={{ fontSize:20 }}>⏱</span>
                  <span>Time tracked to this job will show here</span>
                </div>
              </div>

              {/* Expenses */}
              <div style={card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#f1f5f9' }}>Expenses</span>
                  <button style={{ background:'none', border:'none', color:'#64748b', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>+ Add Expense</button>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12, color:'#475569', fontSize:13, padding:'8px 0' }}>
                  <span style={{ fontSize:20 }}>💵</span>
                  <span>Track all expenses for this job in one place</span>
                </div>
              </div>

              {/* Scheduled Visits preview */}
              {visits.length > 0 && (
                <div style={card}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'#f1f5f9' }}>Scheduled visits</span>
                    <button onClick={() => setDetailTab('visits')} style={{ background:'#16a34a', border:'none', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', padding:'5px 12px', borderRadius:7 }}>Edit All Visits</button>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto auto', gap:8, marginBottom:8 }}>
                    <div>
                      <p style={{ margin:'0 0 2px', fontSize:11, color:'#64748b' }}>First visit</p>
                      <p style={{ margin:0, fontSize:13, color:'#f1f5f9', fontWeight:600 }}>{fmtDate(job.scheduled_start)}</p>
                    </div>
                    <div>
                      <p style={{ margin:'0 0 2px', fontSize:11, color:'#64748b' }}>Last visit</p>
                      <p style={{ margin:0, fontSize:13, color:'#f1f5f9', fontWeight:600 }}>{fmtDate(job.scheduled_end) || '—'}</p>
                    </div>
                    <div>
                      <p style={{ margin:'0 0 2px', fontSize:11, color:'#64748b' }}>Repeats</p>
                      <p style={{ margin:0, fontSize:13, color:'#f1f5f9', fontWeight:600 }}>{job.job_recurrence || 'Once'}</p>
                    </div>
                    <div>
                      <p style={{ margin:'0 0 2px', fontSize:11, color:'#64748b' }}>Checklists</p>
                      <p style={{ margin:0, fontSize:13, color:'#f1f5f9' }}>—</p>
                    </div>
                  </div>
                  {/* visit rows */}
                  <div style={{ marginTop:8 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'140px 1fr auto auto auto', gap:8, padding:'6px 0', borderBottom:'1px solid #1e293b' }}>
                      {['Date and time','Title and instructions','Status','Assigned',''].map(h => (
                        <span key={h} style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase' }}>{h}</span>
                      ))}
                    </div>
                    {visits.slice(0, 10).map((v: any, i: number) => (
                      <div key={i} style={{ display:'grid', gridTemplateColumns:'140px 1fr auto auto auto', gap:8, padding:'10px 0', borderBottom:'1px solid #0f172a', alignItems:'center' }}>
                        <div>
                          <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#f1f5f9' }}>{v.date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</p>
                          <p style={{ margin:0, fontSize:11, color:'#475569' }}>Anytime</p>
                        </div>
                        <div>
                          <p style={{ margin:0, fontSize:13, color:'#f1f5f9' }}>{job.client_name} - {job.title}</p>
                          {job.instructions && <p style={{ margin:0, fontSize:11, color:'#64748b' }}>{job.instructions}</p>}
                        </div>
                        <span style={{
                          background: v.status === 'overdue' || (v.date < new Date() && v.status !== 'completed') ? 'rgba(239,68,68,0.15)' : v.status === 'completed' ? 'rgba(74,222,128,0.15)' : 'rgba(96,165,250,0.1)',
                          color: v.status === 'overdue' || (v.date < new Date() && v.status !== 'completed') ? '#f87171' : v.status === 'completed' ? '#4ade80' : '#60a5fa',
                          padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700, whiteSpace:'nowrap' as const
                        }}>
                          ● {v.status === 'overdue' || (v.date < new Date() && v.status !== 'completed') ? 'Overdue' : v.status === 'completed' ? 'Complete' : 'Upcoming'}
                        </span>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ width:24, height:24, borderRadius:'50%', background:'rgba(74,222,128,0.15)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#4ade80' }}>
                            {job.assigned_name ? job.assigned_name.split(' ').map((n:string)=>n[0]).join('').slice(0,2) : 'NA'}
                          </span>
                          <span style={{ fontSize:12, color:'#94a3b8' }}>{job.assigned_name || '—'}</span>
                        </div>
                        <div style={{ display:'flex', gap:6 }}>
                          <button style={{ background:'none', border:'none', color:'#4ade80', cursor:'pointer', fontSize:16 }}>✓</button>
                          <button style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:14 }}>✏️</button>
                        </div>
                      </div>
                    ))}
                    {visits.length > 10 && (
                      <div style={{ padding:'10px 0', color:'#475569', fontSize:12, textAlign:'center' }}>
                        Showing 1–10 of {visits.length} visits · <button onClick={() => setDetailTab('visits')} style={{ background:'none', border:'none', color:'#4ade80', cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>View all</button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Instructions */}
              {job.instructions && (
                <div style={card}>
                  <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:700, color:'#fbbf24', textTransform:'uppercase', letterSpacing:'0.05em' }}>Crew Instructions</p>
                  <p style={{ margin:0, fontSize:13, color:'#cbd5e1' }}>{job.instructions}</p>
                </div>
              )}
            </>
          )}

          {/* ── VISITS TAB ── */}
          {detailTab === 'visits' && (
            <div style={card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <span style={{ fontSize:15, fontWeight:700, color:'#f1f5f9' }}>All Visits ({visits.length})</span>
                <button style={{ background:'#16a34a', border:'none', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', padding:'6px 14px', borderRadius:7 }}>+ Add Visit</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'140px 1fr auto auto auto', gap:8, padding:'6px 0', borderBottom:'1px solid #1e293b' }}>
                {['Date','Title','Status','Assigned',''].map(h => (
                  <span key={h} style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase' }}>{h}</span>
                ))}
              </div>
              {visits.map((v: any, i: number) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'140px 1fr auto auto auto', gap:8, padding:'10px 0', borderBottom:'1px solid #1e293b', alignItems:'center' }}>
                  <div>
                    <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#f1f5f9' }}>{v.date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</p>
                    <p style={{ margin:0, fontSize:11, color:'#475569' }}>Anytime</p>
                  </div>
                  <div>
                    <p style={{ margin:0, fontSize:13, color:'#f1f5f9' }}>{job.client_name} - {job.title}</p>
                    {job.instructions && <p style={{ margin:0, fontSize:11, color:'#64748b' }}>{job.instructions}</p>}
                  </div>
                  <span style={{
                    background: v.date < new Date() && v.status !== 'completed' ? 'rgba(239,68,68,0.15)' : 'rgba(96,165,250,0.1)',
                    color: v.date < new Date() && v.status !== 'completed' ? '#f87171' : '#60a5fa',
                    padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700
                  }}>
                    ● {v.date < new Date() && v.status !== 'completed' ? 'Overdue' : 'Upcoming'}
                  </span>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ width:24, height:24, borderRadius:'50%', background:'rgba(74,222,128,0.15)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#4ade80' }}>
                      {job.assigned_name ? job.assigned_name.split(' ').map((n:string)=>n[0]).join('').slice(0,2) : 'NA'}
                    </span>
                    <span style={{ fontSize:12, color:'#94a3b8' }}>{job.assigned_name || '—'}</span>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button style={{ background:'none', border:'none', color:'#4ade80', cursor:'pointer', fontSize:16 }}>✓</button>
                    <button style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:14 }}>✏️</button>
                  </div>
                </div>
              ))}
              {visits.length === 0 && (
                <div style={{ padding:'40px 0', textAlign:'center', color:'#475569', fontSize:13 }}>No visits scheduled</div>
              )}
            </div>
          )}

          {/* ── BILLING TAB ── */}
          {detailTab === 'billing' && (
            <>
              <div style={{ ...card, paddingBottom:0 }}>
                <div style={{ display:'flex', gap:24, marginBottom:16 }}>
                  <div>
                    <p style={{ margin:'0 0 2px', fontSize:11, color:'#64748b' }}>Frequency</p>
                    <p style={{ margin:0, fontSize:13, color:'#f1f5f9' }}>
                      {(job as any).invoice_frequency || 'When job is complete'}{' '}
                      <span style={{ background:'rgba(96,165,250,0.1)', color:'#60a5fa', padding:'1px 6px', borderRadius:4, fontSize:11 }}>{(job as any).invoice_frequency || 'When complete'}</span>
                    </p>
                  </div>
                  <div>
                    <p style={{ margin:'0 0 2px', fontSize:11, color:'#64748b' }}>Billing type</p>
                    <p style={{ margin:0, fontSize:13, color:'#f1f5f9' }}>Fixed price</p>
                  </div>
                </div>
                {/* billing sub-tabs */}
                <div style={{ display:'flex', borderTop:'1px solid #1e293b', gap:0 }}>
                  {(['invoicing','reminders'] as const).map(t => (
                    <button key={t} onClick={() => setBillingTab(t)} style={{
                      padding:'10px 20px', border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit',
                      fontSize:13, fontWeight:700, color: billingTab === t ? '#f1f5f9' : '#64748b',
                      borderBottom: billingTab === t ? '2px solid #16a34a' : '2px solid transparent',
                    }}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {billingTab === 'invoicing' && (
                <div style={card}>
                  {loadingInvoices ? (
                    <div style={{ padding:'20px 0', textAlign:'center', color:'#475569', fontSize:13 }}>Loading invoices…</div>
                  ) : (
                    <>
                      <div style={{ display:'grid', gridTemplateColumns:'auto 1fr auto auto auto auto', gap:8, padding:'6px 0', borderBottom:'1px solid #1e293b', marginBottom:4 }}>
                        {['Invoice','Subject','Due date','Status','Total','Balance'].map(h => (
                          <span key={h} style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase' }}>{h}</span>
                        ))}
                      </div>
                      {jobInvoices.length === 0 ? (
                        <div style={{ padding:'20px 0', color:'#475569', fontSize:13 }}>No invoices found for this job.</div>
                      ) : jobInvoices.map((inv: any) => {
                        const is = INV_STATUS[inv.status] || INV_STATUS.draft
                        return (
                          <div key={inv.id} style={{ display:'grid', gridTemplateColumns:'auto 1fr auto auto auto auto', gap:8, padding:'10px 0', borderBottom:'1px solid #1e293b', alignItems:'center' }}>
                            <span style={{ color:'#4ade80', fontSize:13, fontWeight:600, cursor:'pointer' }}>#{inv.invoice_number}</span>
                            <span style={{ fontSize:13, color:'#f1f5f9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{inv.title || `For Services`}</span>
                            <span style={{ fontSize:13, color:'#94a3b8' }}>{inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—'}</span>
                            <span style={{ background:is.bg, color:is.color, padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700, whiteSpace:'nowrap' as const }}>● {is.label}</span>
                            <span style={{ fontSize:13, color:'#f1f5f9', textAlign:'right', fontWeight:600 }}>{fmt(inv.amount)}</span>
                            <span style={{ fontSize:13, color: inv.status === 'paid' ? '#4ade80' : '#f87171', textAlign:'right', fontWeight:600 }}>{inv.status === 'paid' ? '$0.00' : fmt(inv.amount)}</span>
                          </div>
                        )
                      })}
                      {/* totals row */}
                      {jobInvoices.length > 0 && (
                        <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0 0', borderTop:'1px solid #1e293b' }}>
                          <span style={{ fontSize:13, fontWeight:700, color:'#f1f5f9' }}>Total</span>
                          <div style={{ display:'flex', gap:32 }}>
                            <span style={{ fontSize:13, fontWeight:700, color:'#f1f5f9' }}>
                              {fmt(jobInvoices.reduce((s: number, i: any) => s + (i.amount || 0), 0))}
                            </span>
                            <span style={{ fontSize:13, fontWeight:700, color:'#f87171' }}>
                              {fmt(jobInvoices.filter((i: any) => i.status !== 'paid').reduce((s: number, i: any) => s + (i.amount || 0), 0))}
                            </span>
                          </div>
                        </div>
                      )}
                      <button onClick={onCreateInvoice} style={{ marginTop:16, background:'none', border:'none', color:'#4ade80', fontSize:13, cursor:'pointer', fontFamily:'inherit', fontWeight:600, padding:'4px 0' }}>
                        + Create Invoice
                      </button>
                    </>
                  )}
                </div>
              )}

              {billingTab === 'reminders' && (
                <div style={card}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto auto', gap:8, padding:'6px 0', borderBottom:'1px solid #1e293b', marginBottom:4 }}>
                    {['Scheduled','Description','Status','Assigned'].map(h => (
                      <span key={h} style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase' }}>{h}</span>
                    ))}
                  </div>
                  {/* Generate periodic reminders based on invoice_frequency */}
                  {job.scheduled_start ? (() => {
                    const reminders: Date[] = []
                    let cur = new Date(job.scheduled_end || job.scheduled_start)
                    const freq = (job as any).invoice_frequency || 'Monthly'
                    for (let i = 0; i < 10; i++) {
                      reminders.push(new Date(cur))
                      if (freq.includes('Monthly') || freq.includes('month')) {
                        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 0) // last day of next month
                      } else if (freq.includes('Weekly')) {
                        cur.setDate(cur.getDate() + 7)
                      } else {
                        cur.setMonth(cur.getMonth() + 1)
                      }
                    }
                    return reminders.map((d, i) => (
                      <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto auto', gap:8, padding:'10px 0', borderBottom:'1px solid #1e293b', alignItems:'center' }}>
                        <span style={{ fontSize:13, fontWeight:600, color:'#f1f5f9' }}>{d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</span>
                        <span style={{ fontSize:12, color:'#64748b' }}>This is your periodic reminder to invoice…</span>
                        <span style={{ background:'rgba(74,222,128,0.15)', color:'#4ade80', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700 }}>● Upcoming</span>
                        <span style={{ fontSize:12, color:'#475569' }}>—</span>
                      </div>
                    ))
                  })() : (
                    <div style={{ padding:'20px 0', textAlign:'center', color:'#475569', fontSize:13 }}>No reminders scheduled</div>
                  )}
                  <button style={{ marginTop:12, background:'none', border:'none', color:'#4ade80', fontSize:13, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>+ Add Reminder</button>
                </div>
              )}
            </>
          )}

          {/* ── REMINDERS TAB ── */}
          {detailTab === 'reminders' && (
            <div style={card}>
              <p style={{ margin:'0 0 16px', fontSize:15, fontWeight:700, color:'#f1f5f9' }}>Reminders</p>
              <div style={{ padding:'40px 0', textAlign:'center', color:'#475569', fontSize:13 }}>
                No reminders set for this job.
                <br/>
                <button style={{ marginTop:12, background:'none', border:'none', color:'#4ade80', fontSize:13, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>+ Add Reminder</button>
              </div>
            </div>
          )}

        </div>

        {/* ── RIGHT SIDEBAR — profitability + notes ── */}
        <div style={{ width:280, borderLeft:'1px solid #1e293b', padding:'1.5rem', flexShrink:0, background:'#0a0f1a' }}>
          {/* Profitability */}
          <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:12, padding:'1rem', marginBottom:16 }}>
            <p style={{ margin:'0 0 2px', fontSize:12, fontWeight:700, color:'#94a3b8' }}>📅 Past 30 days profitability</p>
            <p style={{ margin:'0 0 4px', fontSize:11, color:'#475569' }}>30 day average profit margin</p>
            <p style={{ margin:'0 0 4px', fontSize:32, fontWeight:800, color:'#f1f5f9' }}>{profitPct}%</p>
            <p style={{ margin:'0 0 12px', fontSize:11, color:'#475569' }}>30 day average profit margin</p>
            {[
              { label:'Revenue', value: fmt(revenue), color:'#f1f5f9' },
              { label:'Line Item Cost', value:'($0.00)', color:'#94a3b8' },
              { label:'Labor', value:'($0.00)', color:'#94a3b8' },
              { label:'Expenses', value:'($0.00)', color:'#94a3b8' },
              { label:'Profit', extra:`${profitPct}%`, value: fmt(revenue), color:'#f1f5f9' },
            ].map(row => (
              <div key={row.label} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderTop:'1px solid #1e293b' }}>
                <span style={{ fontSize:12, color:'#64748b' }}>{row.label} {row.extra ? <span style={{ fontSize:11, color:'#4ade80', marginLeft:4 }}>{row.extra}</span> : null}</span>
                <span style={{ fontSize:12, fontWeight:600, color:row.color }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:12, padding:'1rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#f1f5f9' }}>Notes</span>
              <button onClick={() => setShowNoteInput(!showNoteInput)} style={{ width:28, height:28, borderRadius:8, background:'rgba(74,222,128,0.15)', border:'1px solid rgba(74,222,128,0.3)', color:'#4ade80', cursor:'pointer', fontFamily:'inherit', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
            </div>
            {showNoteInput && (
              <div style={{ marginBottom:12 }}>
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Add a note…"
                  rows={3}
                  style={{ width:'100%', padding:'8px', border:'1px solid #1e293b', borderRadius:8, background:'#0a0f1a', color:'#f1f5f9', fontSize:12, fontFamily:'inherit', resize:'vertical', boxSizing:'border-box' }}
                />
                <div style={{ display:'flex', gap:8, marginTop:6 }}>
                  <button onClick={() => {
                    if (noteText.trim()) {
                      setJobNotes(noteText.trim())
                      setNoteText('')
                      setShowNoteInput(false)
                      setToast('✅ Note saved')
                    }
                  }} style={{ padding:'5px 12px', background:'#16a34a', border:'none', borderRadius:7, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Save</button>
                  <button onClick={() => { setShowNoteInput(false); setNoteText('') }} style={{ padding:'5px 12px', background:'transparent', border:'1px solid #1e293b', borderRadius:7, color:'#64748b', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
                </div>
              </div>
            )}
            {job.instructions || jobNotes ? (
              <div style={{ padding:'8px 10px', background:'rgba(251,191,36,0.05)', border:'1px solid rgba(251,191,36,0.15)', borderRadius:8 }}>
                <p style={{ margin:'0 0 4px', fontSize:11, color:'#64748b' }}>Internal notes</p>
                <p style={{ margin:0, fontSize:12, color:'#cbd5e1' }}>{jobNotes || job.instructions}</p>
              </div>
            ) : (
              <p style={{ margin:0, fontSize:12, color:'#475569', fontStyle:'italic' }}>No notes yet</p>
            )}
          </div>

          {/* Quick status */}
          <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:12, padding:'1rem', marginTop:16 }}>
            <p style={{ margin:'0 0 10px', fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.05em' }}>Status</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {ALL_STATUSES.map((s: string) => (
                <button key={s} onClick={() => onStatusChange(s)} style={{
                  padding:'5px 12px', borderRadius:99, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                  background: job.status === s ? sc(s).bg : 'transparent',
                  color: job.status === s ? sc(s).color : '#64748b',
                  border: job.status === s ? `1px solid ${sc(s).color}` : '1px solid #1e293b',
                }}>{statusLabel(s)}</button>
              ))}
            </div>
          </div>

          {/* Delete */}
          <button onClick={onDelete} style={{ marginTop:16, width:'100%', padding:'8px', background:'rgba(248,113,113,0.05)', color:'#f87171', border:'1px solid rgba(248,113,113,0.2)', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            🗑 Delete Job
          </button>
        </div>
      </div>
    </div>
  )
}

export default function JobsPage() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>([])
  const [access, setAccess] = useState<CurrentUserAccess>({ role: 'worker_limited', fullName: '', isFieldWorker: true })
  const [clients, setClients] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [jobToast, setJobToast] = useState('')
  const setJobToastFn = (msg: string) => { setJobToast(msg); setTimeout(() => setJobToast(''), 5000) }
  const location = useLocation()

  useEffect(() => {
    const f = (location.state as any)?.filter
    if (f) setStatusFilter(f === 'in_progress' ? 'In Progress' : f === 'action_required' ? 'Action Required' : f)
    if ((location.state as any)?.openCreate) {
      const state = location.state as any
      const updates: any = {}
      if (state.clientName) { updates.client_name = state.clientName; updates.client_id = state.clientId || '' }
      if (state.title) updates.title = state.title
      if (state.amount) updates.total_amount = state.amount
      if (state.description) updates.description = state.description
      if (state.division) updates.division = state.division
      if (state.quoteId) updates.quote_id = state.quoteId
      if (Object.keys(updates).length) setForm((prev: any) => ({ ...prev, ...updates }))
      if (state.lineItems?.length) setLineItems(state.lineItems.map((li: any) => ({ name: li.name || '', description: li.description || '', qty: li.qty || 1, unit_price: li.unit_price || 0 })))
      setShowModal(true)
    }
  }, [location.state])

  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [form, setForm] = useState<any>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [jobType, setJobType] = useState<'one-off'|'recurring'>('one-off')
  const [activeTab, setActiveTab] = useState<'schedule'|'billing'|'services'>('schedule')
  const [showServicePicker, setShowServicePicker] = useState(false)
  const [showCustomField, setShowCustomField] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1024)
  useEffect(() => {
    const fn = () => { setIsMobile(window.innerWidth < 768); setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024) }
    window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn)
  }, [])
  const [customFieldForm, setCustomFieldForm] = useState({ name: '', value: '' })
  const [customFields, setCustomFields] = useState<{name:string;value:string}[]>([])
  const [serviceSearch, setServiceSearch] = useState('')
  const [lineItems, setLineItems] = useState<JobLineItem[]>([{ name:'', description:'', qty:1, unit_price:0 }])
  const [showCalendar, setShowCalendar] = useState(false)
  const [nextJobNum, setNextJobNum]     = useState('Auto-assigned')
  const [showSalesDropdown, setShowSalesDropdown] = useState(false)
  const [salesSearch, setSalesSearch] = useState('')
  const [showAssignDropdown, setShowAssignDropdown] = useState(false)
  const [assignSearch, setAssignSearch] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [showInternalNoteInput, setShowInternalNoteInput] = useState(false)

  const loadNextJobNum = async () => {
    const { data } = await supabase.from('jobs').select('job_number').order('created_at', { ascending: false }).limit(1)
    if (data?.[0]?.job_number) {
      const last = parseInt((data[0].job_number || '0').replace(/\D/g, '')) || 3547
      setNextJobNum(String(last + 1))
    } else setNextJobNum('3548')
  }

  const loadJobs = async () => {
    setLoading(true)
    const [{ data }, currentAccess] = await Promise.all([
      supabase.from('jobs').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      getCurrentUserAccess(),
    ])
    setAccess(currentAccess)
    setJobs(filterAssignedTo(data ?? [], currentAccess, j => j.assigned_name))
    setLoading(false)
  }

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('id,first_name,last_name').is('deleted_at', null).order('last_name')
    setClients(data ?? [])
  }

  const loadEmployees = async () => {
    const { data, error } = await supabase.from('employees').select('id,fname,lname').eq('active', true).order('fname')
    if (error) { console.error('loadEmployees error:', error); setEmployees([]); return }
    setEmployees((data ?? []).map((e: any) => ({ id: e.id, name: `${e.fname ?? ''} ${e.lname ?? ''}`.trim() })))
  }

  useEffect(() => {
    loadJobs(); loadClients(); loadEmployees(); loadNextJobNum()
    const channel = supabase.channel('jobs-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, loadJobs)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const fmt = (n: number) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const sc = (s: string) => STATUS_COLORS[s?.toLowerCase()] || STATUS_COLORS.draft
  const statusLabel = (s: string) => s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())

  const now_f = new Date()
  const now30_f = new Date(); now30_f.setDate(now30_f.getDate() + 30)
  const filtered = jobs.filter(j => {
    const matchSearch = `${j.job_number} ${j.client_name} ${j.title}`.toLowerCase().includes(search.toLowerCase())
    let matchStatus = true
    if (statusFilter === 'All') matchStatus = true
    else if (statusFilter === 'late') matchStatus = !!j.scheduled_start && new Date(j.scheduled_start) < now_f && j.status !== 'completed' && j.status !== 'cancelled'
    else if (statusFilter === 'requires_invoicing') matchStatus = j.status === 'completed' && !j.invoiced
    else if (statusFilter === 'action_required') matchStatus = j.status === 'action_required'
    else if (statusFilter === 'unscheduled') matchStatus = !j.scheduled_start && j.status !== 'completed' && j.status !== 'cancelled'
    else if (statusFilter === 'ending_30') matchStatus = !!j.scheduled_end && new Date(j.scheduled_end) <= now30_f && new Date(j.scheduled_end) >= now_f && j.status !== 'completed' && j.status !== 'cancelled'
    else matchStatus = j.status === statusFilter.toLowerCase().replace(' ', '_')
    return matchSearch && matchStatus
  })

  const handleStatusChange = async (job: Job, newStatus: string) => {
    const updates: any = { status: newStatus, updated_at: new Date().toISOString() }
    if (newStatus === 'in_progress' && !job.actual_start) updates.actual_start = new Date().toISOString()
    if (newStatus === 'completed' && !job.actual_end) updates.actual_end = new Date().toISOString()
    await supabase.from('jobs').update(updates).eq('id', job.id)
    setSelectedJob({ ...job, ...updates })
    loadJobs()

    // ── AUTOBILLING: fire when job marked completed ──
    if (newStatus === 'completed') {
      try {
        const { data: settings } = await supabase.from('org_settings').select('*').limit(1).single()
        if (settings?.autobill_enabled) {
          const delayDays = settings.autobill_delay_days ?? 0
          const fireAt = delayDays === 0
            ? new Date().toISOString()
            : new Date(Date.now() + delayDays * 86400000).toISOString()

          // Get next invoice number
          const { data: lastInv } = await supabase.from('invoices').select('invoice_number').order('created_at', { ascending: false }).limit(1).single()
          const nextNum = lastInv?.invoice_number
            ? String(parseInt((lastInv.invoice_number as string).replace(/\D/g, '') || '1000') + 1)
            : '1001'

          const invData: any = {
            invoice_number: nextNum,
            client_name: job.client_name,
            client_id: job.client_id,
            title: job.title,
            status: 'draft',
            amount: job.total_amount ?? 0,
            due_date: fireAt,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            notes: `Auto-generated from Job #${job.job_number} on completion`,
          }
          const { data: newInv } = await supabase.from('invoices').insert(invData).select().single()

          // Auto-send email if configured
          if (settings.autobill_send_email && newInv) {
            const { data: clientRow } = await supabase.from('clients')
              .select('email,first_name').eq('id', job.client_id).single()
            if (clientRow?.email) {
              await supabase.functions.invoke('send-email', {
                body: {
                  to: clientRow.email,
                  subject: `Invoice #${nextNum} from PHL Land Care Inc.`,
                  html: `<div style="font-family:sans-serif;max-width:540px;margin:auto;padding:24px"><h2 style="color:#16a34a">PHL Land Care Inc.</h2><p>Hi ${clientRow.first_name || job.client_name},</p><p>Thank you for choosing PHL Land Care! Your invoice for <strong>${job.title}</strong> is ready.</p><p style="font-size:24px;font-weight:800;color:#111">$${(job.total_amount ?? 0).toFixed(2)}</p><p>Invoice #${nextNum} · Due: ${new Date(fireAt).toLocaleDateString()}</p><p>Thank you for your business!<br><strong>PHL Land Care Team</strong><br>📞 772-466-3617</p></div>`,
                }
              })
              await supabase.from('invoices').update({ status: 'sent' }).eq('id', newInv.id)
            }
          }
          setJobToastFn?.(`✅ Invoice #${nextNum} auto-created${settings.autobill_send_email ? ' & emailed to client' : ''}`)
        }
      } catch (e) {
        // Autobilling failed silently — don't block status change
      }
    }
  }

  const openCreate = () => {
    setEditingJob(null)
    setForm(EMPTY_FORM)
    setLineItems([{ name:'', description:'', qty:1, unit_price:0 }])
    setJobType('one-off')
    setActiveTab('schedule')
    setCustomFields([])
    setShowModal(true)
  }

  const openEdit = (job: Job) => {
    setEditingJob(job)
    setForm({
      ...EMPTY_FORM,
      title: job.title,
      description: job.description ?? '',
      client_id: job.client_id ?? '',
      client_name: job.client_name ?? '',
      status: job.status,
      job_type: job.job_type ?? '',
      priority: job.priority ?? 'normal',
      scheduled_start: job.scheduled_start ? job.scheduled_start.slice(0, 16) : '',
      scheduled_end: job.scheduled_end ? job.scheduled_end.slice(0, 16) : '',
      assigned_to: job.assigned_to ?? '',
      assigned_name: job.assigned_name ?? '',
      service_address: job.service_address ?? '',
      city: job.city ?? '',
      state: job.state ?? '',
      zip: job.zip ?? '',
      instructions: job.instructions ?? '',
      customer_notes: job.customer_notes ?? '',
      total_amount: job.total_amount ? String(job.total_amount) : '',
      irrigation: (job as any).irrigation ?? 'No',
      pest_control: (job as any).pest_control ?? 'No',
      landscape: (job as any).landscape ?? 'Landscape',
      division: (job as any).division ?? '',
      salesperson_id: (job as any).salesperson_id ?? '',
      salesperson_name: (job as any).salesperson_name ?? '',
      auto_invoice: (job as any).auto_invoice ?? true,
      split_invoices: (job as any).split_invoices ?? false,
      internal_notes: (job as any).internal_notes ?? '',
      line_items: (job as any).line_items ?? [],
    })
    setShowModal(true)
  }

  const calcSubtotal = () => lineItems.reduce((s, i) => s + (i.qty * i.unit_price), 0)
  const calcDiscount = (sub: number) => form.discount_type === 'percent' ? sub * ((form.discount || 0) / 100) : (form.discount || 0)
  const calcTax = (sub: number, disc: number) => (sub - disc) * ((form.tax || 0) / 100)
  const calcTotal = () => {
    const sub = calcSubtotal()
    const disc = calcDiscount(sub)
    const tax = calcTax(sub, disc)
    return sub - disc + tax
  }

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const lineTotal = calcTotal()
    const payload: any = {
      title: form.title.trim(),
      description: form.description?.trim() || null,
      client_id: form.client_id || null,
      client_name: form.client_name?.trim() || null,
      status: form.status,
      job_type: form.job_type || null,
      priority: form.priority,
      scheduled_start: form.scheduled_start ? new Date(form.scheduled_start).toISOString() : null,
      scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : null,
      assigned_to: form.assigned_to || null,
      assigned_name: form.assigned_name?.trim() || null,
      service_address: form.service_address?.trim() || null,
      city: form.city?.trim() || null,
      state: form.state?.trim() || null,
      zip: form.zip?.trim() || null,
      instructions: form.instructions?.trim() || null,
      customer_notes: form.customer_notes?.trim() || null,
      total_amount: lineTotal > 0 ? lineTotal : (parseFloat(form.total_amount) || 0),
      division: form.division || null,
      job_number: nextJobNum,
      job_recurrence: jobType === 'recurring' ? form.job_recurrence : null,
      irrigation: form.irrigation || 'No',
      pest_control: form.pest_control || 'No',
      landscape: form.landscape?.trim() || null,
      salesperson_id: form.salesperson_id || null,
      salesperson_name: form.salesperson_name?.trim() || null,
      auto_invoice: !!form.auto_invoice,
      split_invoices: !!form.split_invoices,
      internal_notes: form.internal_notes?.trim() || null,
      line_items: form.line_items?.length ? form.line_items : null,
      updated_at: new Date().toISOString(),
    }
    if (editingJob) {
      const { job_number: _jn, ...editPayload } = payload
      await supabase.from('jobs').update(editPayload).eq('id', editingJob.id)
    } else {
      await supabase.from('jobs').insert(payload)
    }
    setSaving(false)
    setShowModal(false)
    loadJobs()
    loadNextJobNum()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('jobs').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setDeleteConfirm(null)
    setSelectedJob(null)
    loadJobs()
  }

  const addLineItem = () => setLineItems([...lineItems, { name:'', description:'', qty:1, unit_price:0 }])
  const removeLineItem = (i: number) => setLineItems(lineItems.filter((_,idx)=>idx!==i))
  const updateLineItem = (i: number, field: keyof JobLineItem, value: any) => {
    const updated = [...lineItems]; updated[i] = { ...updated[i], [field]: value }; setLineItems(updated)
  }
  const addServiceFromPicker = (svc: typeof PHL_SERVICES[0]) => {
    setLineItems([...lineItems.filter(i=>i.name), { name:svc.name, description:svc.description, qty:1, unit_price:svc.unit_price }])
    setShowServicePicker(false); setServiceSearch('')
  }

  const filteredServices = PHL_SERVICES.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()))

  const now30 = new Date(); now30.setDate(now30.getDate() + 30)
  const past30 = new Date(); past30.setDate(past30.getDate() - 30)

  const stats = {
    total: jobs.length,
    scheduled: jobs.filter(j => j.status === 'scheduled').length,
    inProgress: jobs.filter(j => j.status === 'in_progress').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    // Jobber overview counts
    endingIn30: jobs.filter(j => j.scheduled_end && new Date(j.scheduled_end) <= now30 && new Date(j.scheduled_end) >= new Date() && j.status !== 'completed' && j.status !== 'cancelled').length,
    late: jobs.filter(j => j.scheduled_start && new Date(j.scheduled_start) < new Date() && j.status !== 'completed' && j.status !== 'cancelled').length,
    requiresInvoicing: jobs.filter(j => j.status === 'completed' && !j.invoiced).length,
    actionRequired: jobs.filter(j => j.status === 'action_required').length,
    unscheduled: jobs.filter(j => !j.scheduled_start && j.status !== 'completed' && j.status !== 'cancelled').length,
    // Visit stats
    recentVisits: jobs.filter(j => j.actual_end && new Date(j.actual_end) >= past30).length,
    recentRevenue: jobs.filter(j => j.actual_end && new Date(j.actual_end) >= past30).reduce((s,j) => s + (j.total_amount||0), 0),
    upcomingVisits: jobs.filter(j => j.scheduled_start && new Date(j.scheduled_start) <= now30 && new Date(j.scheduled_start) >= new Date()).length,
    upcomingRevenue: jobs.filter(j => j.scheduled_start && new Date(j.scheduled_start) <= now30 && new Date(j.scheduled_start) >= new Date()).reduce((s,j) => s + (j.total_amount||0), 0),
  }

  const inp: React.CSSProperties = { width:'100%',padding:'9px 11px',border:'1px solid #1c2a35',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#16202a',color:'#f1f5f9',boxSizing:'border-box' }
  const lbl: React.CSSProperties = { fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,display:'block' }

  // ── JOB DETAIL VIEW ──
  if (selectedJob) {
    // derive display values
    const isLate = !!selectedJob.scheduled_start && new Date(selectedJob.scheduled_start) < new Date() && selectedJob.status !== 'completed' && selectedJob.status !== 'cancelled'
    const svcAddress = [selectedJob.service_address, selectedJob.city, selectedJob.state, selectedJob.zip].filter(Boolean).join(', ')
    const jobInvoices = [] as any[] // loaded below via detailInvoices state
    return (
      <JobDetailView
        job={selectedJob}
        isLate={isLate}
        svcAddress={svcAddress}
        sc={sc}
        statusLabel={statusLabel}
        fmtDate={fmtDate}
        fmt={fmt}
        JOB_TYPES={JOB_TYPES}
        ALL_STATUSES={ALL_STATUSES}
        onBack={() => setSelectedJob(null)}
        onEdit={() => openEdit(selectedJob)}
        onDelete={() => setDeleteConfirm(selectedJob.id)}
        onStatusChange={(s: string) => handleStatusChange(selectedJob, s)}
        onSmsClient={async () => {
          const {data:cl}=await supabase.from('clients').select('phone,first_name').eq('id',selectedJob.client_id).single()
          const phone=cl?.phone
          if(!phone){setJobToastFn('⚠️ No phone number for this client');return}
          const msg=`Hi ${cl?.first_name||selectedJob.client_name}, this is PHL Land Care. Your job "${selectedJob.title}" has been scheduled. Questions? Call 772-466-3617.`
          try{await supabase.functions.invoke('send-sms',{body:{to:phone,message:msg}});setJobToastFn(`✅ SMS sent to ${phone}`)}
          catch{setJobToastFn('⚠️ SMS failed — check SignalWire settings')}
        }}
        onCreateInvoice={async () => {
          const jobLineItems = selectedJob.line_items?.length
            ? selectedJob.line_items.map((li: any) => ({ name: li.name || selectedJob.title, description: li.description || '', qty: li.qty || 1, unit_price: li.unit_price || 0 }))
            : [{ name: selectedJob.title || 'Services Rendered', description: selectedJob.description || '', qty: 1, unit_price: selectedJob.total_amount || 0 }]
          await supabase.from('jobs').update({ invoiced: true, updated_at: new Date().toISOString() }).eq('id', selectedJob.id)
          navigate('/invoices', { state:{
            openCreate: true,
            clientName: selectedJob.client_name,
            clientId: String(selectedJob.client_id || ''),
            jobTitle: selectedJob.title,
            amount: selectedJob.total_amount,
            lineItems: jobLineItems,
            sourceId: selectedJob.id,
            sourceType: 'job',
          }})
        }}
        setToast={setJobToastFn}
      />
    )
  }

  // ── JOBS LIST VIEW ──
  return (
    <div style={{ padding:'2rem',background:'#0a0f1a',minHeight:'100vh' }}>
      {jobToast && (
        <div style={{ position:'fixed',top:'1rem',right:'1rem',background:'#052e16',border:'1px solid #16a34a',borderRadius:10,padding:'12px 20px',fontSize:13,color:'#4ade80',fontWeight:600,zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,0.4)',maxWidth:380 }}>
          {jobToast}
        </div>
      )}
      <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12 }}>
        <div>
          <h1 style={{ fontSize:28,fontWeight:800,color:'#f1f5f9',margin:'0 0 2px' }}>{access.isFieldWorker ? 'My Jobs' : 'Jobs'}</h1>
          <p style={{ fontSize:13,color:'#64748b',margin:0 }}>{jobs.length} {access.isFieldWorker ? 'assigned to you' : 'total jobs'}</p>
        </div>
        <button onClick={openCreate} style={{ background:'#16a34a',color:'#fff',border:'none',borderRadius:9,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>+ New Job</button>
      </div>

      {/* Jobber-style Overview + Visit Stats */}
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:16,marginBottom:24 }}>
        {/* Overview card */}
        <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem' }}>
          <p style={{ margin:'0 0 12px',fontSize:13,fontWeight:700,color:'#f1f5f9' }}>Overview</p>
          {[
            { dot:'#f87171', label:'Ending within 30 days', count:stats.endingIn30, filter:'ending_30' },
            { dot:'#f87171', label:'Late', count:stats.late, filter:'late' },
            { dot:'#fbbf24', label:'Requires Invoicing', count:stats.requiresInvoicing, filter:'requires_invoicing' },
            { dot:'#fbbf24', label:'Action Required', count:stats.actionRequired, filter:'action_required' },
            { dot:'#fbbf24', label:'Unscheduled', count:stats.unscheduled, filter:'unscheduled' },
          ].map(item => (
            <div key={item.label} onClick={() => setStatusFilter(item.filter)}
              style={{ display:'flex',alignItems:'center',gap:8,padding:'4px 6px',borderRadius:6,cursor:'pointer',marginBottom:2, background: statusFilter===item.filter?'rgba(96,165,250,0.08)':'transparent' }}>
              <span style={{ width:8,height:8,borderRadius:'50%',background:item.dot,flexShrink:0,display:'inline-block' }}/>
              <span style={{ fontSize:13,color:'#94a3b8',flex:1 }}>{item.label}</span>
              <span style={{ fontSize:13,fontWeight:700,color:'#f1f5f9' }}>({item.count})</span>
            </div>
          ))}
        </div>

        {/* Recent Visits */}
        <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem' }}>
          <p style={{ margin:'0 0 4px',fontSize:13,fontWeight:700,color:'#f1f5f9' }}>Recent visits</p>
          <p style={{ margin:'0 0 12px',fontSize:11,color:'#64748b' }}>Past 30 days</p>
          <div style={{ fontSize:36,fontWeight:800,color:'#f1f5f9',marginBottom:4 }}>{stats.recentVisits}</div>
          <div style={{ fontSize:13,color:'#64748b' }}>${stats.recentRevenue.toLocaleString()}</div>
        </div>

        {/* Visits Scheduled */}
        <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem' }}>
          <p style={{ margin:'0 0 4px',fontSize:13,fontWeight:700,color:'#f1f5f9' }}>Visits scheduled</p>
          <p style={{ margin:'0 0 12px',fontSize:11,color:'#64748b' }}>Next 30 days</p>
          <div style={{ fontSize:36,fontWeight:800,color:'#f1f5f9',marginBottom:4 }}>{stats.upcomingVisits}</div>
          <div style={{ fontSize:13,color:'#64748b' }}>${stats.upcomingRevenue.toLocaleString()}</div>
        </div>

        {/* Win More Work placeholder */}
        <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem' }}>
          <p style={{ margin:'0 0 8px',fontSize:13,fontWeight:700,color:'#f1f5f9' }}>All jobs</p>
          {[
            { label:'Total', value:stats.total, color:'#60a5fa', filter:'All' },
            { label:'Scheduled', value:stats.scheduled, color:'#a855f7', filter:'Scheduled' },
            { label:'In Progress', value:stats.inProgress, color:'#fbbf24', filter:'In Progress' },
            { label:'Completed', value:stats.completed, color:'#4ade80', filter:'Completed' },
          ].map(s => (
            <div key={s.label} onClick={() => setStatusFilter(s.filter)}
              style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'3px 6px',borderRadius:6,cursor:'pointer',marginBottom:2,background:statusFilter===s.filter?'rgba(96,165,250,0.08)':'transparent' }}>
              <span style={{ fontSize:13,color:'#94a3b8' }}>{s.label}</span>
              <span style={{ fontSize:13,fontWeight:700,color:s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center' }}>
        <div style={{ position:'relative',flex:1,minWidth:200 }}>
          <input placeholder="Search jobs..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp,paddingLeft:32,height:38 }} />
          <span style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#475569' }}>🔍</span>
        </div>
        {['All','Draft','Scheduled','In Progress','Completed','Cancelled','On Hold'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            padding:'7px 14px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
            background:statusFilter===s?'rgba(74,222,128,0.15)':'#0f172a',
            color:statusFilter===s?'#4ade80':'#64748b',
            border:statusFilter===s?'1px solid rgba(74,222,128,0.3)':'1px solid #1e293b',
          }}>{s}</button>
        ))}
        <p style={{ margin:0,fontSize:12,color:'#475569' }}>{filtered.length} results</p>
      </div>

      {loading ? (
        <div style={{ textAlign:'center',padding:'3rem',color:'#475569' }}>Loading...</div>
      ) : (
        <div style={{ background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',overflow:'hidden' }}>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e293b',background:'#0d1526' }}>
                {[
                  {h:'Job #',w:'8%'},{h:'Title',w:'26%'},{h:'Client',w:'16%'},
                  {h:'Type',w:'10%'},{h:'Scheduled',w:'12%'},{h:'Assigned',w:'12%'},
                  {h:'Amount',w:'8%'},{h:'Status',w:'10%'},{h:'',w:'4%'}
                ].map(col => (
                  <th key={col.h} style={{ padding:'11px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',width:col.w }}>{col.h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ padding:'3rem',textAlign:'center',color:'#475569',fontSize:13 }}>
                  <div style={{ fontSize:36,marginBottom:12 }}>🔧</div>
                  <p style={{ margin:'0 0 4px',fontWeight:600,color:'#64748b' }}>No jobs found</p>
                  <p style={{ margin:'0 0 16px',fontSize:12 }}>Try adjusting filters or create a new job</p>
                  <button onClick={openCreate} style={{ padding:'9px 20px',background:'#16a34a',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>+ New Job</button>
                </td></tr>
              ) : filtered.map(j => (
                <tr key={j.id} onClick={() => setSelectedJob(j)}
                  style={{ borderBottom:'1px solid #0d1526',cursor:'pointer' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.03)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <td style={{ padding:'14px 14px',fontSize:12,color:'#475569',fontFamily:'monospace',fontWeight:700 }}>{j.job_number||'—'}</td>
                  <td style={{ padding:'14px 14px',maxWidth:220 }}>
                    <p style={{ margin:0,fontSize:13,fontWeight:700,color:'#f1f5f9',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{j.title}</p>
                    {(j as any).division && <p style={{ margin:'2px 0 0',fontSize:11,color:'#475569' }}>{(j as any).division}</p>}
                  </td>
                  <td style={{ padding:'14px 14px',fontSize:13,color:'#cbd5e1' }}>{j.client_name||'—'}</td>
                  <td style={{ padding:'14px 14px' }}>
                    {j.job_type
                      ? <span style={{ background:'rgba(96,165,250,0.1)',color:'#60a5fa',padding:'3px 8px',borderRadius:6,fontSize:11,fontWeight:600 }}>{JOB_TYPES.find(t=>t.value===j.job_type)?.label||j.job_type}</span>
                      : <span style={{ color:'#334155',fontSize:12 }}>—</span>}
                  </td>
                  <td style={{ padding:'14px 14px',fontSize:12,color:'#64748b' }}>{fmtDate(j.scheduled_start)}</td>
                  <td style={{ padding:'14px 14px',fontSize:12,color:'#64748b' }}>{j.assigned_name||'—'}</td>
                  <td style={{ padding:'14px 14px',fontSize:13,fontWeight:700,color:j.total_amount>0?'#4ade80':'#334155' }}>{j.total_amount>0?fmt(j.total_amount):'—'}</td>
                  <td style={{ padding:'14px 14px' }}>
                    <span style={{ background:sc(j.status).bg,color:sc(j.status).color,padding:'4px 10px',borderRadius:99,fontSize:11,fontWeight:700,whiteSpace:'nowrap',display:'inline-flex',alignItems:'center',gap:5 }}>
                      <span style={{ width:6,height:6,borderRadius:'50%',background:sc(j.status).color,flexShrink:0,display:'inline-block' }}/>
                      {statusLabel(j.status)}
                    </span>
                  </td>
                  <td style={{ padding:'14px 10px',textAlign:'right' }}>
                    <button onClick={e=>{e.stopPropagation();openEdit(j)}}
                      style={{ background:'rgba(74,222,128,0.08)',color:'#4ade80',border:'1px solid rgba(74,222,128,0.15)',borderRadius:6,padding:'5px 12px',fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:600 }}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── NEW / EDIT JOB MODAL ── */}
      {showModal && (
        <div style={{ position:'fixed',inset:0,zIndex:500 }}>
          <div style={{ position:'absolute',inset:0,width:'100%',height:'100vh',overflowY:'auto',background:'#2d3b46',borderTop:'4px solid #9ccc3f',display:'flex',flexDirection:'column' }}>

            {/* Header */}
            <div style={{ position:'sticky',top:0,zIndex:10,background:'#2d3b46',borderBottom:'1px solid #1c2a35',padding:'14px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <span>🔧</span>
                <h2 style={{ margin:0,fontSize:16,fontWeight:700,color:'#f1f5f9' }}>{editingJob ? `Edit Job` : 'New Job'}</h2>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button onClick={() => setShowModal(false)} style={{ padding:'8px 16px',border:'1px solid #4a5a68',borderRadius:8,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={{ padding:'8px 18px',border:'none',borderRadius:8,background:'#9ccc3f',color:'#1a2e0a',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit',opacity:saving?0.6:1 }}>
                  {saving ? 'Saving...' : 'Save Job ▾'}
                </button>
              </div>
            </div>

            <div style={{ padding:'20px 24px',flex:1 }}>

              {/* Title */}
              <input
                style={{ ...inp,fontSize:16,fontWeight:600,padding:'13px 14px',marginBottom:20 }}
                placeholder="Title"
                value={form.title||''}
                onChange={e => setForm({...form,title:e.target.value})}
              />

              {/* ── Two-column: client LEFT | fields RIGHT (flat, Jobber-style) ── */}
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:32,marginBottom:24,alignItems:'start' }}>

                {/* LEFT: client search / selected card */}
                <div>
                  {form.client_name && !clientSearch ? (
                    <div style={{ padding:'13px 14px',background:'#16202a',border:'1px solid #1c2a35',borderRadius:8 }}>
                      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
                        <div>
                          <p style={{ margin:'0 0 2px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>
                            {form.client_name}
                          </p>
                          {(() => {
                            const c = clients.find((c:any) => c.id == form.client_id)
                            return c ? (
                              <div>
                                {(c.service_address||c.address) && <p style={{ margin:'2px 0',fontSize:12,color:'#94a3b8' }}>{c.service_address||c.address}</p>}
                                {c.city && <p style={{ margin:'2px 0',fontSize:12,color:'#94a3b8' }}>{c.city}{c.state?`, ${c.state}`:''} {c.zip||''}</p>}
                                {(c.phone||c.mobile) && <p style={{ margin:'4px 0 0',fontSize:12,color:'#64748b' }}>{c.phone||c.mobile}</p>}
                              </div>
                            ) : null
                          })()}
                        </div>
                        <button onClick={() => { setForm({...form,client_id:'',client_name:''}); setClientSearch('') }}
                          style={{ background:'none',border:'none',color:'#475569',cursor:'pointer',fontSize:18,padding:'0 2px',flexShrink:0 }}>×</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ position:'relative' }}>
                      <input
                        style={inp}
                        placeholder="Select a client"
                        value={clientSearch}
                        onChange={e => setClientSearch(e.target.value)}
                        onFocus={() => setClientDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setClientDropdownOpen(false), 150)}
                      />
                      {clientDropdownOpen && (
                        <div style={{ position:'absolute',top:'calc(100% + 4px)',left:0,right:0,maxHeight:200,overflowY:'auto',background:'#16202a',border:'1px solid #1c2a35',borderRadius:8,zIndex:20,boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
                          {clients.filter((c:any) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(clientSearch.trim().toLowerCase())).length === 0
                            ? <p style={{ margin:0,padding:'10px 12px',fontSize:12,color:'#475569' }}>No clients found</p>
                            : clients.filter((c:any) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(clientSearch.trim().toLowerCase())).slice(0,8).map((c:any) => (
                              <div key={c.id}
                                onClick={() => { setForm({...form,client_id:c.id,client_name:`${c.first_name} ${c.last_name}`}); setClientSearch(''); setClientDropdownOpen(false) }}
                                style={{ padding:'9px 12px',cursor:'pointer',fontSize:13,color:'#f1f5f9',borderBottom:'1px solid #16202a' }}
                                onMouseEnter={e=>(e.currentTarget.style.background='#1c2a35')}
                                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                                {c.first_name} {c.last_name}
                              </div>
                            ))
                          }
                        </div>
                      )}
                      {clients.length === 0 && (
                        <p style={{ margin:'8px 0 0',fontSize:11,color:'#f87171' }}>⚠️ Loading clients...</p>
                      )}
                    </div>
                  )}
                </div>

                {/* RIGHT: job fields */}
                <div>
                  {[
                    { label:'Job #', el: <input style={{ ...inp,margin:0 }} value={nextJobNum} onChange={e => setNextJobNum(e.target.value)} /> },
                    { label:'Salesperson', el: (
                      <div style={{ position:'relative' }}>
                        {form.salesperson_id ? (
                          <div style={{ display:'inline-flex',alignItems:'center',gap:8,padding:'7px 14px',background:'#e2e8ed',border:'none',borderRadius:20,fontSize:13,fontWeight:700,color:'#1c2a35' }}>
                            {form.salesperson_name}
                            <button onClick={() => setForm({...form,salesperson_id:'',salesperson_name:''})} style={{ background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:14,padding:0,lineHeight:1 }}>×</button>
                          </div>
                        ) : (
                          <button onClick={() => setShowSalesDropdown(v=>!v)} style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'7px 16px',background:'#e2e8ed',border:'none',borderRadius:20,fontSize:13,fontWeight:700,color:'#1c2a35',cursor:'pointer',fontFamily:'inherit' }}>
                            Assign <span style={{ fontWeight:800 }}>+</span>
                          </button>
                        )}
                        {showSalesDropdown && (
                          <div style={{ position:'absolute',top:'calc(100% + 4px)',left:0,width:220,maxHeight:220,overflowY:'auto',background:'#1c2a35',border:'1px solid #4a5a68',borderRadius:8,zIndex:30,boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>
                            <div style={{ padding:8,position:'sticky',top:0,background:'#1c2a35' }}>
                              <input autoFocus style={{ ...inp,margin:0,background:'#16202a' }} placeholder="Search" value={salesSearch} onChange={e=>setSalesSearch(e.target.value)} onBlur={() => setTimeout(() => setShowSalesDropdown(false), 150)} />
                            </div>
                            {employees.filter((e:any)=>e.name.toLowerCase().includes(salesSearch.toLowerCase())).map((e:any) => (
                              <div key={e.id}
                                onClick={() => { setForm({...form,salesperson_id:e.id,salesperson_name:e.name}); setShowSalesDropdown(false); setSalesSearch('') }}
                                style={{ padding:'9px 14px',cursor:'pointer',fontSize:13,fontWeight:600,color:'#f1f5f9' }}
                                onMouseEnter={ev=>(ev.currentTarget.style.background='#16202a')}
                                onMouseLeave={ev=>(ev.currentTarget.style.background='transparent')}>
                                {e.name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )},
                    { label:'Irrigation', el: <select style={{ ...inp,margin:0 }} value={form.irrigation||'No'} onChange={e => setForm({...form,irrigation:e.target.value})}><option>No</option><option>Yes</option></select> },
                    { label:'Pest Control', el: <select style={{ ...inp,margin:0 }} value={form.pest_control||'No'} onChange={e => setForm({...form,pest_control:e.target.value})}><option>No</option><option>Yes</option></select> },
                    { label:'Landscape', el: <input style={{ ...inp,margin:0 }} value={form.landscape||''} onChange={e => setForm({...form,landscape:e.target.value})} placeholder="Landscape" /> },
                    { label:'Division', el: <select style={{ ...inp,margin:0 }} value={form.division||''} onChange={e => setForm({...form,division:e.target.value})}><option value="">— Select division —</option>{['Lawn & Tree','Irrigation','Extermination','Nursery','Farm','Hardscape'].map(d=><option key={d}>{d}</option>)}</select> },
                    { label:'Status', el: <select style={{ ...inp,margin:0 }} value={form.status||'draft'} onChange={e => setForm({...form,status:e.target.value})}>{ALL_STATUSES.map((s:string)=><option key={s} value={s}>{statusLabel(s)}</option>)}</select> },
                    { label:'Customize', el: <button onClick={() => setShowCustomField(true)} style={{ padding:'6px 14px',background:'none',border:'1px solid #9ccc3f',borderRadius:8,color:'#9ccc3f',cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:700 }}>Add Field</button> },
                  ].map(row => (
                    <div key={row.label} style={{ display:'grid',gridTemplateColumns:'120px 1fr',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #1c2a35' }}>
                      <span style={{ fontSize:12,color:'#94a3b8',fontWeight:500 }}>{row.label}</span>
                      <div>{row.el}</div>
                    </div>
                  ))}
                  {customFields.map((cf:any,i:number) => (
                    <div key={i} style={{ display:'grid',gridTemplateColumns:'120px 1fr auto',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #1c2a35' }}>
                      <span style={{ fontSize:12,color:'#94a3b8',fontWeight:500 }}>{cf.name}</span>
                      <input style={{ ...inp,margin:0 }} value={cf.value} onChange={e => { const u=[...customFields]; u[i].value=e.target.value; setCustomFields(u) }} />
                      <button onClick={() => setCustomFields(customFields.filter((_:any,idx:number)=>idx!==i))} style={{ background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:18,padding:'0 4px' }}>×</button>
                    </div>
                  ))}
                </div>
              </div>


              {/* ── Job type card ── */}
              <div style={{ background:'#16202a',border:'1px solid #1c2a35',borderRadius:14,padding:'1.25rem',marginBottom:20 }}>
                <h3 style={{ margin:'0 0 14px',fontSize:15,fontWeight:700,color:'#f1f5f9',display:'flex',alignItems:'center',gap:8 }}>
                  Job type
                  <span title="One-off jobs happen once. Recurring jobs repeat on a schedule." style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:16,height:16,borderRadius:'50%',border:'1px solid #475569',color:'#64748b',fontSize:10,fontWeight:700,cursor:'help' }}>?</span>
                </h3>
                <div style={{ display:'flex',gap:8,marginBottom:18 }}>
                  {(['one-off','recurring'] as const).map(t => (
                    <button key={t} onClick={() => setJobType(t)} style={{
                      padding:'8px 20px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                      background:jobType===t?'rgba(74,222,128,0.15)':'transparent',
                      color:jobType===t?'#9ccc3f':'#64748b',
                      border:jobType===t?'1px solid rgba(74,222,128,0.5)':'1px solid #1c2a35',
                    }}>{t==='one-off'?'One-off':'Recurring'}</button>
                  ))}
                </div>

                <div style={{ display:'flex',borderBottom:'1px solid #1c2a35',marginBottom:16 }}>
                  {[{id:'schedule',label:'Schedule'},{id:'billing',label:'Billing & Automatic Payments'},{id:'services',label:'Product / Service'}].map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id as any)} style={{
                      padding:'8px 14px',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,
                      color:activeTab===t.id?'#f1f5f9':'#64748b',borderBottom:activeTab===t.id?'2px solid #9ccc3f':'2px solid transparent',whiteSpace:'nowrap' as const,
                    }}>{t.label}</button>
                  ))}
                </div>

                {/* SCHEDULE */}
                {activeTab==='schedule' && (
                  <div>
                    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
                      <p style={{ margin:0,fontSize:13,fontWeight:600,color:'#f1f5f9' }}>
                        Total visits {jobType==='recurring'?'∞':'1'} | On {form.scheduled_start ? new Date(form.scheduled_start).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                      </p>
                      <button onClick={() => setShowCalendar((v:boolean)=>!v)} style={{ padding:'5px 11px',background:'none',border:'1px solid #9ccc3f',borderRadius:8,color:'#9ccc3f',cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit' }}>
                        📅 {showCalendar?'Hide':'Show'} Calendar
                      </button>
                    </div>
                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1.4fr',gap:8,marginBottom:12 }}>
                      <div><label style={lbl}>Start date</label><input style={inp} type="date" value={form.scheduled_start?.split('T')[0]||''} onChange={e => setForm({...form,scheduled_start:e.target.value})} /></div>
                      <div><label style={lbl}>Start time</label><input style={inp} type="time" value={form.scheduled_time||''} onChange={e => setForm({...form,scheduled_time:e.target.value})} /></div>
                      <div><label style={lbl}>End time</label><input style={inp} type="time" value={form.scheduled_end_time||''} onChange={e => setForm({...form,scheduled_end_time:e.target.value})} /></div>
                      <div><label style={lbl}>Assign</label>
                        <div style={{ position:'relative' }}>
                          <button onClick={() => setShowAssignDropdown(v=>!v)} style={{ ...inp,textAlign:'left' as const,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                            <span style={{ color:form.assigned_name?'#f1f5f9':'#64748b' }}>{form.assigned_name || '— Unassigned —'}</span>
                            <span style={{ fontSize:10,color:'#64748b' }}>▾</span>
                          </button>
                          {showAssignDropdown && (
                            <div style={{ position:'absolute',top:'calc(100% + 4px)',left:0,right:0,maxHeight:220,overflowY:'auto',background:'#1c2a35',border:'1px solid #4a5a68',borderRadius:8,zIndex:30,boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>
                              <div style={{ padding:8,position:'sticky',top:0,background:'#1c2a35' }}>
                                <input autoFocus style={{ ...inp,margin:0,background:'#16202a' }} placeholder="Search" value={assignSearch} onChange={e=>setAssignSearch(e.target.value)} onBlur={() => setTimeout(() => setShowAssignDropdown(false), 150)} />
                              </div>
                              <div onClick={() => { setForm({...form,assigned_to:'',assigned_name:''}); setShowAssignDropdown(false); setAssignSearch('') }}
                                style={{ padding:'9px 14px',cursor:'pointer',fontSize:13,fontWeight:600,color:'#64748b' }}
                                onMouseEnter={ev=>(ev.currentTarget.style.background='#16202a')} onMouseLeave={ev=>(ev.currentTarget.style.background='transparent')}>
                                — Unassigned —
                              </div>
                              {employees.filter((e:any)=>e.name.toLowerCase().includes(assignSearch.toLowerCase())).map((e:any) => (
                                <div key={e.id}
                                  onClick={() => { setForm({...form,assigned_to:e.id,assigned_name:e.name}); setShowAssignDropdown(false); setAssignSearch('') }}
                                  style={{ padding:'9px 14px',cursor:'pointer',fontSize:13,fontWeight:600,color:'#f1f5f9' }}
                                  onMouseEnter={ev=>(ev.currentTarget.style.background='#16202a')} onMouseLeave={ev=>(ev.currentTarget.style.background='transparent')}>
                                  {e.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display:'grid',gridTemplateColumns:'1fr 280px',gap:20 }}>
                      {/* LEFT */}
                      <div>
                        <div style={{ display:'flex',gap:16,marginBottom:14 }}>
                          <label style={{ display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#94a3b8',cursor:'pointer' }}><input type="checkbox" style={{ accentColor:'#9ccc3f' }} checked={form.schedule_later||false} onChange={e=>setForm({...form,schedule_later:e.target.checked})} /> Schedule later</label>
                          <label style={{ display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#94a3b8',cursor:'pointer' }}><input type="checkbox" style={{ accentColor:'#9ccc3f' }} checked={form.anytime||false} onChange={e=>setForm({...form,anytime:e.target.checked})} /> Anytime</label>
                        </div>
                        <div style={{ marginBottom:14 }}>
                          <label style={lbl}>Repeats</label>
                          <select style={inp} value={form.job_recurrence||'Does not repeat'} onChange={e=>{ setForm({...form,job_recurrence:e.target.value}); setJobType(e.target.value && e.target.value!=='Does not repeat' ? 'recurring' : 'one-off') }}>
                            <option value="Does not repeat">Does not repeat</option>
                            {['Weekly','Bi-weekly','Monthly','Quarterly','Annually'].map(r=><option key={r}>{r}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Visit instructions</label>
                          <textarea style={{ ...inp,minHeight:90,resize:'vertical' as const }} value={form.instructions||''} onChange={e=>setForm({...form,instructions:e.target.value})} placeholder="Visit instructions" />
                        </div>
                      </div>
                      {/* RIGHT: checklist promo card */}
                      <div style={{ display:'flex',gap:10,padding:'14px',background:'#1c2a35',borderRadius:10,alignSelf:'start' }}>
                        <div style={{ width:32,height:32,borderRadius:'50%',background:'#4a5a68',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:15 }}>📋</div>
                        <div>
                          <p style={{ margin:'0 0 4px',fontSize:11,fontWeight:800,color:'#f1f5f9',letterSpacing:'0.04em',textTransform:'uppercase' as const }}>Capture on-site details</p>
                          <p style={{ margin:'0 0 8px',fontSize:12,color:'#94a3b8',lineHeight:1.4 }}>Attach custom-built checklists so that nothing gets missed</p>
                          <button onClick={() => setJobToastFn('📋 Checklists coming soon!')} style={{ background:'none',border:'none',color:'#9ccc3f',cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit',padding:0,textDecoration:'underline' }}>Create a Checklist</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* BILLING */}
                {activeTab==='billing' && (
                  <div>
                    <label style={{ display:'flex',alignItems:'center',gap:10,fontSize:13,color:'#f1f5f9',cursor:'pointer',marginBottom:18 }}>
                      <input type="checkbox" style={{ width:16,height:16,accentColor:'#9ccc3f' }} checked={form.auto_invoice!==false} onChange={e=>setForm({...form,auto_invoice:e.target.checked})} />
                      Remind me to invoice when I close the job
                    </label>
                    <div style={{ borderTop:'1px solid #1c2a35',paddingTop:18 }}>
                      <label style={{ display:'flex',alignItems:'center',gap:10,fontSize:13,color:'#f1f5f9',cursor:'pointer' }}>
                        <input type="checkbox" style={{ width:16,height:16,accentColor:'#9ccc3f' }} checked={form.split_invoices||false} onChange={e=>setForm({...form,split_invoices:e.target.checked})} />
                        Split into multiple invoices with a payment schedule
                      </label>
                    </div>
                  </div>
                )}

                {/* PRODUCT / SERVICE */}
                {activeTab==='services' && (
                  <div>
                    {(form.line_items||[]).length > 0 && (
                      <div style={{ display:'grid',gridTemplateColumns:'20px 2fr 70px 90px 90px 80px 24px',gap:8,padding:'4px 0',marginBottom:4 }}>
                        {['','Name','Qty','Unit cost','Unit price','Total',''].map(h=><span key={h} style={{ fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase' as const }}>{h}</span>)}
                      </div>
                    )}
                    {(form.line_items||[]).map((li:any,i:number) => (
                      <div key={i} style={{ marginBottom:10,paddingBottom:10,borderBottom:'1px solid #1c2a35' }}>
                        <div style={{ display:'grid',gridTemplateColumns:'20px 2fr 70px 90px 90px 80px 24px',gap:8,alignItems:'center',marginBottom:8 }}>
                          <span style={{ color:'#475569',cursor:'grab',fontSize:13,textAlign:'center' as const }}>⠿</span>
                          <input style={{ ...inp,margin:0,fontWeight:600 }} value={li.name} onChange={e=>{const u=[...form.line_items];u[i].name=e.target.value;setForm({...form,line_items:u})}} placeholder="Name" />
                          <input type="number" style={{ ...inp,margin:0,textAlign:'center' as const }} value={li.qty||1} onChange={e=>{const u=[...form.line_items];u[i].qty=Number(e.target.value);u[i].total=(u[i].unit_price||0)*Number(e.target.value);setForm({...form,line_items:u,total_amount:u.reduce((a:number,l:any)=>a+(l.total||0),0)})}} />
                          <input type="number" style={{ ...inp,margin:0 }} value={li.unit_cost||0} onChange={e=>{const u=[...form.line_items];u[i].unit_cost=Number(e.target.value);setForm({...form,line_items:u})}} placeholder="$0.00" />
                          <input type="number" style={{ ...inp,margin:0 }} value={li.unit_price||0} onChange={e=>{const u=[...form.line_items];u[i].unit_price=Number(e.target.value);u[i].total=(u[i].qty||1)*Number(e.target.value);setForm({...form,line_items:u,total_amount:u.reduce((a:number,l:any)=>a+(l.total||0),0)})}} placeholder="$0.00" />
                          <span style={{ fontSize:13,fontWeight:700,color:'#9ccc3f' }}>${((li.qty||1)*(li.unit_price||0)).toFixed(2)}</span>
                          <button onClick={()=>{const u=form.line_items.filter((_:any,idx:number)=>idx!==i);setForm({...form,line_items:u,total_amount:u.reduce((a:number,l:any)=>a+(l.total||0),0)})}} title="Remove" style={{ background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:16,padding:0 }}>⋯</button>
                        </div>
                        <textarea style={{ ...inp,minHeight:50,resize:'vertical' as const,fontSize:12 }} value={li.description||''} onChange={e=>{const u=[...form.line_items];u[i].description=e.target.value;setForm({...form,line_items:u})}} placeholder="Description" />
                      </div>
                    ))}
                    <div style={{ display:'flex',gap:8,marginTop:12 }}>
                      <button onClick={()=>setForm({...form,line_items:[...(form.line_items||[]),{name:'',description:'',qty:1,unit_cost:0,unit_price:0,total:0}]})} style={{ padding:'9px 18px',background:'#9ccc3f',border:'none',borderRadius:8,color:'#16202a',cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit' }}>Add Line Item</button>
                      <button onClick={()=>setShowServicePicker(true)} style={{ padding:'9px 18px',background:'none',border:'1px solid #4a5a68',borderRadius:8,color:'#94a3b8',cursor:'pointer',fontSize:12,fontFamily:'inherit' }}>From Products & Services</button>
                    </div>
                    {(form.line_items||[]).length > 0 && (
                      <div style={{ marginTop:16,paddingTop:12,borderTop:'1px solid #4a5a68' }}>
                        <div style={{ display:'flex',justifyContent:'space-between',padding:'4px 0',fontSize:13,color:'#94a3b8' }}>
                          <span>Total cost</span>
                          <span>${(form.line_items||[]).reduce((a:number,l:any)=>a+((l.qty||1)*(l.unit_cost||0)),0).toFixed(2)}</span>
                        </div>
                        <div style={{ display:'flex',justifyContent:'space-between',padding:'4px 0',fontSize:13,fontWeight:700,color:'#f1f5f9' }}>
                          <span>Total price</span>
                          <span>${(form.total_amount||0).toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {/* NOTES */}
                    <h3 style={{ margin:'24px 0 10px',fontSize:15,fontWeight:700,color:'#f1f5f9' }}>Notes</h3>
                    {showInternalNoteInput || form.internal_notes ? (
                      <textarea
                        autoFocus={!form.internal_notes}
                        style={{ ...inp,minHeight:80,resize:'vertical' as const }}
                        value={form.internal_notes||''}
                        onChange={e=>setForm({...form,internal_notes:e.target.value})}
                        onBlur={() => { if (!form.internal_notes) setShowInternalNoteInput(false) }}
                        placeholder="Leave an internal note for yourself or a team member"
                      />
                    ) : (
                      <div onClick={() => setShowInternalNoteInput(true)} style={{ border:'1px dashed #4a5a68',borderRadius:10,padding:'28px 16px',textAlign:'center' as const,cursor:'pointer' }}>
                        <div style={{ width:36,height:36,borderRadius:'50%',background:'#1c2a35',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px',fontSize:16,color:'#94a3b8' }}>📝</div>
                        <p style={{ margin:0,fontSize:13,color:'#94a3b8' }}>Leave an internal note for yourself or a team member</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SERVICE PICKER ── */}
      {showServicePicker && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.3)',zIndex:620 }} onClick={() => setShowServicePicker(false)} />
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:440,maxHeight:'70vh',overflowY:'auto',background:'#2d3b46',border:'1px solid #1c2a35',borderRadius:16,zIndex:621 }}>
            <div style={{ padding:'14px 16px',borderBottom:'1px solid #1c2a35',position:'sticky',top:0,background:'#2d3b46' }}>
              <input style={{ ...inp,fontSize:13 }} placeholder="Search services..." value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} autoFocus />
            </div>
            <div style={{ padding:'8px 0' }}>
              <p style={{ margin:'0 0 4px',padding:'4px 16px',fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.06em' }}>Services</p>
              {filteredServices.map((s,i) => (
                <button key={i} onClick={() => addServiceFromPicker(s)}
                  style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',width:'100%',padding:'10px 16px',background:'none',border:'none',color:'#f1f5f9',cursor:'pointer',fontFamily:'inherit',textAlign:'left' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='#1c2a35')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                  <div>
                    <p style={{ margin:'0 0 2px',fontSize:13,fontWeight:700 }}>{s.name}</p>
                    {s.description && <p style={{ margin:0,fontSize:11,color:'#64748b' }}>{s.description.slice(0,70)}...</p>}
                  </div>
                  <span style={{ fontSize:12,color:'#9ccc3f',fontWeight:700,whiteSpace:'nowrap',marginLeft:12 }}>{fmt(s.unit_price)}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── CUSTOM FIELD MODAL ── */}
      {showCustomField && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:620 }} onClick={() => setShowCustomField(false)} />
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:360,background:'#2d3b46',border:'1px solid #1c2a35',borderRadius:16,zIndex:621,padding:24 }}>
            <h3 style={{ margin:'0 0 16px',fontSize:16,fontWeight:700,color:'#f1f5f9' }}>Add Custom Field</h3>
            <label style={lbl}>Field Name</label>
            <input style={{ ...inp,marginBottom:12 }} placeholder="e.g. Contract #" value={customFieldForm.name} onChange={e => setCustomFieldForm({...customFieldForm,name:e.target.value})} />
            <label style={lbl}>Value</label>
            <input style={{ ...inp,marginBottom:20 }} placeholder="Field value" value={customFieldForm.value} onChange={e => setCustomFieldForm({...customFieldForm,value:e.target.value})} />
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
              <button onClick={() => setShowCustomField(false)} style={{ padding:'9px 18px',border:'1px solid #1c2a35',borderRadius:8,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
              <button onClick={() => {
                if (customFieldForm.name) { setCustomFields([...customFields,{name:customFieldForm.name,value:customFieldForm.value}]); setCustomFieldForm({name:'',value:''}); setShowCustomField(false) }
              }} style={{ padding:'9px 18px',border:'none',borderRadius:8,background:'#9ccc3f',color:'#1a2e0a',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Add Field</button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:500 }} onClick={() => setDeleteConfirm(null)} />
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:360,background:'#2d3b46',border:'1px solid #1c2a35',borderRadius:16,zIndex:501,padding:24,textAlign:'center' }}>
            <p style={{ fontSize:32,margin:'0 0 12px' }}>🗑️</p>
            <h3 style={{ margin:'0 0 8px',fontSize:16,fontWeight:700,color:'#f1f5f9' }}>Delete this job?</h3>
            <p style={{ margin:'0 0 20px',fontSize:13,color:'#64748b' }}>This cannot be undone.</p>
            <div style={{ display:'flex',gap:8 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex:1,padding:'10px',border:'1px solid #1c2a35',borderRadius:9,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ flex:1,padding:'10px',border:'none',borderRadius:9,background:'#dc2626',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Delete</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
