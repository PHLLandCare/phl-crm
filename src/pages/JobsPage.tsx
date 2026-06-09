import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
  invoice_frequency: 'When job is complete', auto_invoice: false,
  discount: 0, discount_type: 'percent', tax: 0,
  internal_notes: '',
}

export default function JobsPage() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>([])
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
  const [customFieldForm, setCustomFieldForm] = useState({ name: '', value: '' })
  const [customFields, setCustomFields] = useState<{name:string;value:string}[]>([])
  const [serviceSearch, setServiceSearch] = useState('')
  const [lineItems, setLineItems] = useState<JobLineItem[]>([{ name:'', description:'', qty:1, unit_price:0 }])
  const [showCalendar, setShowCalendar] = useState(false)
  const [nextJobNum, setNextJobNum]     = useState('Auto-assigned')

  const loadNextJobNum = async () => {
    const { data } = await supabase.from('jobs').select('job_number').order('created_at', { ascending: false }).limit(1)
    if (data?.[0]?.job_number) {
      const last = parseInt((data[0].job_number || '0').replace(/\D/g, '')) || 3547
      setNextJobNum(String(last + 1))
    } else setNextJobNum('3548')
  }

  const loadJobs = async () => {
    setLoading(true)
    const { data } = await supabase.from('jobs').select('*').is('deleted_at', null).order('created_at', { ascending: false })
    setJobs(data ?? [])
    setLoading(false)
  }

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('id,first_name,last_name').is('deleted_at', null).order('last_name')
    setClients(data ?? [])
  }

  const loadEmployees = async () => {
    const { data } = await supabase.from('employees').select('id,name').order('name')
    setEmployees(data ?? [])
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

  const filtered = jobs.filter(j => {
    const matchSearch = `${j.job_number} ${j.client_name} ${j.title}`.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' ? true : j.status === statusFilter.toLowerCase().replace(' ', '_')
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
      updated_at: new Date().toISOString(),
    }
    if (editingJob) {
      await supabase.from('jobs').update(payload).eq('id', editingJob.id)
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

  const stats = {
    total: jobs.length,
    scheduled: jobs.filter(j => j.status === 'scheduled').length,
    inProgress: jobs.filter(j => j.status === 'in_progress').length,
    completed: jobs.filter(j => j.status === 'completed').length,
  }

  const inp: React.CSSProperties = { width:'100%',padding:'9px 11px',border:'1px solid #1e293b',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#0f172a',color:'#f1f5f9',boxSizing:'border-box' }
  const lbl: React.CSSProperties = { fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,display:'block' }

  // ── JOB DETAIL VIEW ──
  if (selectedJob) {
    return (
      <div style={{ padding:'2rem',background:'#0a0f1a',minHeight:'100vh' }}>
        <button onClick={() => setSelectedJob(null)} style={{ background:'none',border:'none',color:'#64748b',fontSize:13,cursor:'pointer',fontFamily:'inherit',marginBottom:16 }}>
          ← Back to Jobs
        </button>
        <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12 }}>
          <div>
            <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:6 }}>
              <span style={{ background:sc(selectedJob.status).bg,color:sc(selectedJob.status).color,padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:700 }}>{statusLabel(selectedJob.status)}</span>
              <span style={{ fontSize:13,color:'#475569' }}>{selectedJob.job_number}</span>
            </div>
            <h1 style={{ margin:0,fontSize:26,fontWeight:800,color:'#f1f5f9' }}>{selectedJob.title}</h1>
            {selectedJob.client_name && <p style={{ margin:'4px 0 0',fontSize:14,color:'#64748b' }}>{selectedJob.client_name}</p>}
          </div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            <button onClick={() => openEdit(selectedJob)} style={{ padding:'8px 16px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>Edit Job</button>
            <button onClick={async()=>{
              const {data:cl}=await supabase.from('clients').select('phone,first_name').eq('id',selectedJob.client_id).single()
              const phone=cl?.phone
              if(!phone){setJobToastFn('⚠️ No phone number for this client');return}
              const msg=`Hi ${cl?.first_name||selectedJob.client_name}, this is PHL Land Care. Your job "${selectedJob.title}" has been scheduled. Questions? Call 772-466-3617.`
              try{await supabase.functions.invoke('send-sms',{body:{to:phone,message:msg}});setJobToastFn(`✅ SMS sent to ${phone}`)}
              catch{setJobToastFn('⚠️ SMS failed — check Twilio settings')}
            }} style={{ padding:'8px 16px',background:'rgba(167,139,250,0.1)',color:'#a78bfa',border:'1px solid rgba(167,139,250,0.3)',borderRadius:8,fontSize:13,cursor:'pointer',fontFamily:'inherit' }}>💬 SMS Client</button>
            <button onClick={() => navigate('/invoices', { state:{ openCreate:true, clientName:selectedJob.client_name, clientId:selectedJob.client_id, jobTitle:selectedJob.title, amount:selectedJob.total_amount } })}
              style={{ padding:'8px 16px',background:'rgba(96,165,250,0.15)',color:'#60a5fa',border:'1px solid rgba(96,165,250,0.3)',borderRadius:8,fontSize:13,cursor:'pointer',fontFamily:'inherit' }}>📄 Create Invoice</button>
            <button onClick={() => setDeleteConfirm(selectedJob.id)} style={{ padding:'8px 16px',background:'rgba(248,113,113,0.1)',color:'#f87171',border:'1px solid rgba(248,113,113,0.3)',borderRadius:8,fontSize:13,cursor:'pointer',fontFamily:'inherit' }}>Delete</button>
          </div>
        </div>

        {/* Status change */}
        <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1rem 1.25rem',marginBottom:16 }}>
          <p style={{ margin:'0 0 10px',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em' }}>Quick Status Change</p>
          <div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>
            {ALL_STATUSES.map(s => (
              <button key={s} onClick={() => handleStatusChange(selectedJob, s)} style={{
                padding:'6px 14px',borderRadius:99,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',
                background:selectedJob.status===s?sc(s).bg:'transparent',
                color:selectedJob.status===s?sc(s).color:'#64748b',
                border:selectedJob.status===s?`1px solid ${sc(s).color}`:'1px solid #1e293b',
              }}>{statusLabel(s)}</button>
            ))}
          </div>
        </div>

        <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
          <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem' }}>
            <h3 style={{ margin:'0 0 16px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>Job Details</h3>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 32px' }}>
              {[
                { label:'Client', value:selectedJob.client_name||'—' },
                { label:'Job #', value:selectedJob.job_number },
                { label:'Type', value:JOB_TYPES.find(t=>t.value===selectedJob.job_type)?.label||'—' },
                { label:'Priority', value:selectedJob.priority||'—' },
                { label:'Scheduled Start', value:fmtDate(selectedJob.scheduled_start) },
                { label:'Scheduled End', value:fmtDate(selectedJob.scheduled_end) },
                { label:'Assigned To', value:selectedJob.assigned_name||'—' },
                { label:'Amount', value:fmt(selectedJob.total_amount||0) },
              ].map(row => (
                <div key={row.label} style={{ borderBottom:'1px solid #1e293b',paddingBottom:10 }}>
                  <p style={{ margin:'0 0 2px',fontSize:11,color:'#475569',fontWeight:600 }}>{row.label}</p>
                  <p style={{ margin:0,fontSize:13,color:'#f1f5f9' }}>{row.value}</p>
                </div>
              ))}
            </div>
          </div>
          {selectedJob.description && (
            <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem' }}>
              <p style={{ margin:'0 0 6px',fontSize:11,color:'#475569',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em' }}>Description</p>
              <p style={{ margin:0,fontSize:13,color:'#cbd5e1' }}>{selectedJob.description}</p>
            </div>
          )}
          {selectedJob.instructions && (
            <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem' }}>
              <p style={{ margin:'0 0 6px',fontSize:11,color:'#fbbf24',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em' }}>Crew Instructions (Internal)</p>
              <p style={{ margin:0,fontSize:13,color:'#cbd5e1' }}>{selectedJob.instructions}</p>
            </div>
          )}
          {selectedJob.customer_notes && (
            <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem' }}>
              <p style={{ margin:'0 0 6px',fontSize:11,color:'#60a5fa',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em' }}>Customer Notes</p>
              <p style={{ margin:0,fontSize:13,color:'#cbd5e1' }}>{selectedJob.customer_notes}</p>
            </div>
          )}
        </div>
      </div>
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
          <h1 style={{ fontSize:28,fontWeight:800,color:'#f1f5f9',margin:'0 0 2px' }}>Jobs</h1>
          <p style={{ fontSize:13,color:'#64748b',margin:0 }}>{jobs.length} total jobs</p>
        </div>
        <button onClick={openCreate} style={{ background:'#16a34a',color:'#fff',border:'none',borderRadius:9,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>+ New Job</button>
      </div>

      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:'1.5rem' }}>
        {[
          { label:'Total Jobs',  value:stats.total,      sub:'all time',  color:'#60a5fa' },
          { label:'Scheduled',   value:stats.scheduled,  sub:'upcoming',  color:'#a855f7' },
          { label:'In Progress', value:stats.inProgress, sub:'active now',color:'#fbbf24' },
          { label:'Completed',   value:stats.completed,  sub:'done',      color:'#4ade80' },
        ].map((s,i) => (
          <div key={i} style={{ background:'#0f172a',border:'1px solid #1e293b',borderTop:`3px solid ${s.color}`,borderRadius:14,padding:'1rem 1.25rem' }}>
            <p style={{ margin:'0 0 2px',fontSize:11,color:s.color,fontWeight:700 }}>{s.label}</p>
            <p style={{ margin:'0 0 4px',fontSize:11,color:'#475569' }}>{s.sub}</p>
            <span style={{ fontSize:28,fontWeight:800,color:'#f1f5f9' }}>{s.value}</span>
          </div>
        ))}
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

      {/* ── NEW / EDIT JOB MODAL (Jobber-style side panel) ── */}
      {showModal && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:500 }} onClick={() => setShowModal(false)} />
          <div style={{ position:'fixed',top:0,right:0,width:'min(760px,100vw)',height:'100vh',overflowY:'auto',background:'#0d1526',borderLeft:'1px solid #1e293b',zIndex:501 }}>

            {/* Sticky header */}
            <div style={{ position:'sticky',top:0,zIndex:10,background:'#0d1526',borderBottom:'1px solid #1e293b',padding:'14px 24px',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <span style={{ fontSize:16 }}>🔧</span>
                <h2 style={{ margin:0,fontSize:16,fontWeight:700,color:'#f1f5f9' }}>{editingJob ? `Edit Job — ${editingJob.job_number}` : 'New Job'}</h2>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button onClick={() => setShowModal(false)} style={{ padding:'8px 16px',border:'1px solid #1e293b',borderRadius:8,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={{ padding:'8px 16px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit',opacity:saving?0.6:1 }}>
                  {saving?'Saving...':'Save Job'} ▾
                </button>
              </div>
            </div>

            <div style={{ padding:24 }}>
              {/* Title */}
              <input style={{ ...inp,fontSize:18,fontWeight:700,padding:'12px',marginBottom:16,border:'none',background:'transparent',borderBottom:'1px solid #1e293b',borderRadius:0 }}
                placeholder="Title" value={form.title} onChange={e => setForm({...form,title:e.target.value})} />

              {/* Client + fields row */}
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16 }}>
                <div>
                  <label style={lbl}>Select a client</label>
                  <select style={inp} value={form.client_id} onChange={e => {
                    const c = clients.find(c=>c.id==e.target.value)
                    setForm({...form,client_id:e.target.value,client_name:c?`${c.first_name} ${c.last_name}`:''})
                  }}>
                    <option value="">— Select client —</option>
                    {clients.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Job #</label>
                  <input style={inp} value={nextJobNum} onChange={e => setNextJobNum(e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Salesperson</label>
                  <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                    <button style={{ padding:'8px 12px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#94a3b8',cursor:'pointer',fontSize:12,fontFamily:'inherit',display:'flex',alignItems:'center',gap:6 }}>
                      Assign <span style={{ fontSize:14 }}>+</span>
                    </button>
                  </div>
                </div>
                <div>
                  <label style={lbl}>Irrigation</label>
                  <select style={inp} value={form.irrigation} onChange={e => setForm({...form,irrigation:e.target.value})}>
                    <option>No</option><option>Yes</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Pest Control</label>
                  <select style={inp} value={form.pest_control} onChange={e => setForm({...form,pest_control:e.target.value})}>
                    <option>No</option><option>Yes</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Landscape</label>
                  <input style={inp} value={form.landscape} onChange={e => setForm({...form,landscape:e.target.value})} placeholder="Landscape" />
                </div>
                <div>
                  <label style={lbl}>Division</label>
                  <select style={inp} value={form.division||''} onChange={e => setForm({...form,division:e.target.value})}>
                    <option value="">— Select division —</option>
                    {['Lawn & Tree','Irrigation','Extermination','Nursery','Farm','Hardscape'].map(d=><option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Job Type</label>
                  <select style={inp} value={form.job_type} onChange={e => setForm({...form,job_type:e.target.value})}>
                    <option value="">— Select type —</option>
                    {JOB_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Status</label>
                  <select style={inp} value={form.status} onChange={e => setForm({...form,status:e.target.value})}>
                    {ALL_STATUSES.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Customize</label>
                  <button onClick={() => setShowCustomField(true)} style={{ padding:'8px 14px',background:'none',border:'1px solid #4ade80',borderRadius:8,color:'#4ade80',cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:700 }}>Add Field</button>
                </div>
              </div>

              {/* Custom fields */}
              {customFields.map((cf,i) => (
                <div key={i} style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}>
                  <span style={{ fontSize:12,color:'#64748b',minWidth:120 }}>{cf.name}</span>
                  <input style={{ ...inp,flex:1 }} value={cf.value} onChange={e => { const u=[...customFields]; u[i].value=e.target.value; setCustomFields(u) }} />
                  <button onClick={() => setCustomFields(customFields.filter((_,idx)=>idx!==i))} style={{ background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:16 }}>×</button>
                </div>
              ))}

              {/* ── JOB TYPE ── */}
              <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem',marginBottom:16 }}>
                <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:16 }}>
                  <h3 style={{ margin:0,fontSize:15,fontWeight:700,color:'#f1f5f9' }}>Job type</h3>
                  <span style={{ fontSize:14,color:'#64748b',cursor:'pointer' }}>ℹ️</span>
                </div>
                <div style={{ display:'flex',gap:8,marginBottom:20 }}>
                  {(['one-off','recurring'] as const).map(t => (
                    <button key={t} onClick={() => setJobType(t)} style={{
                      padding:'8px 20px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                      background:jobType===t?'rgba(74,222,128,0.15)':'transparent',
                      color:jobType===t?'#4ade80':'#64748b',
                      border:jobType===t?'1px solid rgba(74,222,128,0.5)':'1px solid #1e293b',
                    }}>{t === 'one-off' ? 'One-off' : 'Recurring'}</button>
                  ))}
                </div>

                {/* Inner tabs: Schedule | Billing | Services */}
                <div style={{ display:'flex',gap:0,borderBottom:'1px solid #1e293b',marginBottom:16 }}>
                  {(['schedule','billing','services'] as const).map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} style={{
                      padding:'8px 16px',background:'none',border:'none',
                      borderBottom:activeTab===t?'2px solid #4ade80':'2px solid transparent',
                      color:activeTab===t?'#f1f5f9':'#64748b',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',textTransform:'capitalize'
                    }}>{t === 'schedule' ? 'Schedule' : t === 'billing' ? 'Billing & automatic payments' : 'Product / Service'}</button>
                  ))}
                </div>

                {/* SCHEDULE TAB */}
                {activeTab === 'schedule' && (
                  <div>
                    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
                      <div>
                        <p style={{ margin:'0 0 2px',fontSize:13,color:'#f1f5f9',fontWeight:600 }}>Total visits {jobType==='recurring'?'∞':'1'} | On {form.scheduled_start ? new Date(form.scheduled_start).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</p>
                      </div>
                      <button onClick={() => setShowCalendar(v=>!v)} style={{ padding:'6px 12px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#94a3b8',cursor:'pointer',fontSize:11,fontFamily:'inherit',display:'flex',alignItems:'center',gap:6 }}>
                        📅 {showCalendar ? 'Hide Calendar' : 'Show Calendar'}
                      </button>
                    </div>

                    {showCalendar && (
                      <div style={{ background:'#1e293b',borderRadius:10,padding:'1rem',marginBottom:16,textAlign:'center' }}>
                        <input type="month" style={{ ...inp,width:'auto',padding:'6px 12px' }} />
                        <p style={{ margin:'8px 0 0',fontSize:12,color:'#64748b' }}>Select a date on the calendar to set schedule</p>
                      </div>
                    )}

                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginBottom:12 }}>
                      <div style={{ gridColumn:'1/2' }}>
                        <label style={lbl}>Start date</label>
                        <input style={inp} type="date" value={form.scheduled_start?.split('T')[0]||''} onChange={e => setForm({...form,scheduled_start:e.target.value})} />
                      </div>
                      <div>
                        <label style={lbl}>Start time</label>
                        <input style={inp} type="time" value={''} onChange={() => {}} />
                      </div>
                      <div>
                        <label style={lbl}>End time</label>
                        <input style={inp} type="time" value={''} onChange={() => {}} />
                      </div>
                      <div>
                        <label style={lbl}>Assign</label>
                        <select style={inp} value={form.assigned_to} onChange={e => {
                          const emp = employees.find(emp=>emp.id==e.target.value)
                          setForm({...form,assigned_to:e.target.value,assigned_name:emp?.name||''})
                        }}>
                          <option value="">— Unassigned —</option>
                          {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div style={{ display:'flex',gap:16,marginBottom:12 }}>
                      <label style={{ display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#94a3b8',cursor:'pointer' }}>
                        <input type="checkbox" /> Schedule later
                      </label>
                      <label style={{ display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#94a3b8',cursor:'pointer' }}>
                        <input type="checkbox" /> Anytime
                      </label>
                    </div>

                    {jobType === 'recurring' && (
                      <div style={{ marginBottom:12 }}>
                        <label style={lbl}>Repeats</label>
                        <select style={inp} value={form.job_recurrence} onChange={e => setForm({...form,job_recurrence:e.target.value})}>
                          {REPEAT_OPTIONS.map(o=><option key={o}>{o}</option>)}
                        </select>
                      </div>
                    )}

                    <div style={{ marginBottom:12 }}>
                      <label style={lbl}>Visit instructions</label>
                      <textarea style={{ ...inp,height:80,resize:'vertical' } as React.CSSProperties}
                        value={form.instructions||''} onChange={e => setForm({...form,instructions:e.target.value})} placeholder="Gate code, parking notes, special instructions..." />
                    </div>
                  </div>
                )}

                {/* BILLING TAB */}
                {activeTab === 'billing' && (
                  <div>
                    <div style={{ background:'#1e293b',borderRadius:10,padding:'1rem',marginBottom:16 }}>
                      <p style={{ margin:'0 0 8px',fontSize:13,fontWeight:700,color:'#f1f5f9' }}>Invoice frequency</p>
                      <p style={{ margin:'0 0 12px',fontSize:12,color:'#64748b' }}>How often would you like to send an invoice to your client?</p>
                      <select style={inp} value={form.invoice_frequency} onChange={e => setForm({...form,invoice_frequency:e.target.value})}>
                        {INVOICE_FREQUENCIES.map(f=><option key={f}>{f}</option>)}
                      </select>
                    </div>

                    <div style={{ background:'#1e293b',borderRadius:10,padding:'1rem',marginBottom:16 }}>
                      <p style={{ margin:'0 0 8px',fontSize:13,fontWeight:700,color:'#f1f5f9' }}>Billing & automatic payments</p>
                      <p style={{ margin:'0 0 12px',fontSize:12,color:'#64748b' }}>Accept payment via Square to enable automatic payments</p>
                      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                        <span style={{ fontSize:13,color:'#94a3b8' }}>Auto-charge client after invoice is sent</span>
                        <button onClick={() => setForm({...form,auto_invoice:!form.auto_invoice})} style={{
                          width:44,height:24,borderRadius:99,border:'none',cursor:'pointer',position:'relative',
                          background:form.auto_invoice?'#16a34a':'#334155',transition:'background .15s'
                        }}>
                          <span style={{ position:'absolute',top:2,left:form.auto_invoice?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left .15s',display:'block' }} />
                        </button>
                      </div>
                    </div>

                    <div style={{ background:'#1e293b',borderRadius:10,padding:'1rem' }}>
                      <p style={{ margin:'0 0 8px',fontSize:13,fontWeight:700,color:'#f1f5f9' }}>Square Payments</p>
                      <p style={{ margin:'0 0 12px',fontSize:12,color:'#64748b' }}>Connect Square to collect CC payments from clients</p>
                      <a href="https://squareup.com" target="_blank" rel="noreferrer" style={{ display:'inline-flex',alignItems:'center',gap:8,padding:'8px 16px',background:'#fff',borderRadius:8,color:'#000',fontSize:13,fontWeight:700,textDecoration:'none' }}>
                        <span style={{ fontSize:16 }}>■</span> Connect Square
                      </a>
                    </div>
                  </div>
                )}

                {/* SERVICES TAB */}
                {activeTab === 'services' && (
                  <div>
                    {lineItems.map((item,i) => (
                      <div key={i} style={{ borderBottom:'1px solid #1e293b',paddingBottom:16,marginBottom:16 }}>
                        <div style={{ display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,marginBottom:8 }}>
                          <input style={inp} placeholder="Name" value={item.name} onChange={e => updateLineItem(i,'name',e.target.value)} />
                          <input style={inp} placeholder="Qty" type="number" min="1" value={item.qty} onChange={e => updateLineItem(i,'qty',parseFloat(e.target.value)||1)} />
                          <input style={inp} placeholder="Unit price" type="number" min="0" value={item.unit_price} onChange={e => updateLineItem(i,'unit_price',parseFloat(e.target.value)||0)} />
                          <div style={{ fontSize:13,color:'#4ade80',fontWeight:700,padding:'9px 4px',whiteSpace:'nowrap' }}>{fmt(item.qty*item.unit_price)}</div>
                        </div>
                        <div style={{ display:'grid',gridTemplateColumns:'1fr auto',gap:8 }}>
                          <textarea style={{ ...inp,height:60,resize:'vertical' } as React.CSSProperties} placeholder="Description" value={item.description} onChange={e => updateLineItem(i,'description',e.target.value)} />
                          <div style={{ width:80,height:60,border:'1px dashed #334155',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#475569',cursor:'pointer',fontSize:18 }}>🖼️</div>
                        </div>
                        {lineItems.length > 1 && (
                          <button onClick={() => removeLineItem(i)} style={{ marginTop:6,background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:12,fontFamily:'inherit' }}>Remove</button>
                        )}
                      </div>
                    ))}
                    <div style={{ display:'flex',gap:8,marginBottom:20 }}>
                      <button onClick={addLineItem} style={{ padding:'8px 16px',background:'#16a34a',border:'none',borderRadius:8,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>Add Line Item</button>
                      <button onClick={() => setShowServicePicker(true)} style={{ padding:'8px 16px',background:'none',border:'1px solid #334155',borderRadius:8,color:'#94a3b8',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>Pick from Services</button>
                    </div>

                    {/* Totals */}
                    <div style={{ borderTop:'1px solid #1e293b',paddingTop:16 }}>
                      <div style={{ display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end' }}>
                        <div style={{ display:'flex',justifyContent:'space-between',width:'100%',maxWidth:320 }}>
                          <span style={{ fontSize:13,color:'#64748b' }}>Subtotal</span>
                          <span style={{ fontSize:13,color:'#f1f5f9' }}>{fmt(calcSubtotal())}</span>
                        </div>
                        <div style={{ display:'flex',justifyContent:'space-between',width:'100%',maxWidth:320,alignItems:'center' }}>
                          <span style={{ fontSize:13,color:'#64748b' }}>Discount</span>
                          <div style={{ display:'flex',gap:6 }}>
                            <input type="number" style={{ ...inp,width:80,padding:'4px 8px' }} value={form.discount} onChange={e => setForm({...form,discount:parseFloat(e.target.value)||0})} />
                            <select style={{ ...inp,width:70,padding:'4px 8px' }} value={form.discount_type} onChange={e => setForm({...form,discount_type:e.target.value})}>
                              <option value="percent">%</option><option value="fixed">$</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display:'flex',justifyContent:'space-between',width:'100%',maxWidth:320,alignItems:'center' }}>
                          <span style={{ fontSize:13,color:'#64748b' }}>Tax</span>
                          <div style={{ display:'flex',gap:6,alignItems:'center' }}>
                            <input type="number" style={{ ...inp,width:80,padding:'4px 8px' }} value={form.tax} onChange={e => setForm({...form,tax:parseFloat(e.target.value)||0})} />
                            <span style={{ fontSize:12,color:'#64748b' }}>%</span>
                          </div>
                        </div>
                        <div style={{ display:'flex',justifyContent:'space-between',width:'100%',maxWidth:320,borderTop:'2px solid #1e293b',paddingTop:8,marginTop:4 }}>
                          <span style={{ fontSize:15,fontWeight:700,color:'#f1f5f9' }}>Total</span>
                          <span style={{ fontSize:18,fontWeight:800,color:'#4ade80' }}>{fmt(calcTotal())}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Description + Notes */}
              <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem',marginBottom:16 }}>
                <label style={{ ...lbl,marginBottom:8 }}>Description</label>
                <textarea style={{ ...inp,height:70,resize:'vertical',marginBottom:16 } as React.CSSProperties} value={form.description||''} onChange={e => setForm({...form,description:e.target.value})} placeholder="What needs to be done..." />
                <label style={{ ...lbl,marginBottom:8 }}>Customer Notes <span style={{ fontWeight:400,textTransform:'none',letterSpacing:0,color:'#475569' }}>(visible to client)</span></label>
                <textarea style={{ ...inp,height:60,resize:'vertical' } as React.CSSProperties} value={form.customer_notes||''} onChange={e => setForm({...form,customer_notes:e.target.value})} placeholder="Notes to share with customer..." />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── SERVICE PICKER ── */}
      {showServicePicker && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.3)',zIndex:620 }} onClick={() => setShowServicePicker(false)} />
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:440,maxHeight:'70vh',overflowY:'auto',background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:621 }}>
            <div style={{ padding:'14px 16px',borderBottom:'1px solid #1e293b',position:'sticky',top:0,background:'#0d1526' }}>
              <input style={{ ...inp,fontSize:13 }} placeholder="Search services..." value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} autoFocus />
            </div>
            <div style={{ padding:'8px 0' }}>
              <p style={{ margin:'0 0 4px',padding:'4px 16px',fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.06em' }}>Services</p>
              {filteredServices.map((s,i) => (
                <button key={i} onClick={() => addServiceFromPicker(s)}
                  style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',width:'100%',padding:'10px 16px',background:'none',border:'none',color:'#f1f5f9',cursor:'pointer',fontFamily:'inherit',textAlign:'left' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                  <div>
                    <p style={{ margin:'0 0 2px',fontSize:13,fontWeight:700 }}>{s.name}</p>
                    {s.description && <p style={{ margin:0,fontSize:11,color:'#64748b' }}>{s.description.slice(0,70)}...</p>}
                  </div>
                  <span style={{ fontSize:12,color:'#4ade80',fontWeight:700,whiteSpace:'nowrap',marginLeft:12 }}>{fmt(s.unit_price)}</span>
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
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:360,background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:621,padding:24 }}>
            <h3 style={{ margin:'0 0 16px',fontSize:16,fontWeight:700,color:'#f1f5f9' }}>Add Custom Field</h3>
            <label style={lbl}>Field Name</label>
            <input style={{ ...inp,marginBottom:12 }} placeholder="e.g. Contract #" value={customFieldForm.name} onChange={e => setCustomFieldForm({...customFieldForm,name:e.target.value})} />
            <label style={lbl}>Value</label>
            <input style={{ ...inp,marginBottom:20 }} placeholder="Field value" value={customFieldForm.value} onChange={e => setCustomFieldForm({...customFieldForm,value:e.target.value})} />
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
              <button onClick={() => setShowCustomField(false)} style={{ padding:'9px 18px',border:'1px solid #1e293b',borderRadius:8,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
              <button onClick={() => {
                if (customFieldForm.name) { setCustomFields([...customFields,{name:customFieldForm.name,value:customFieldForm.value}]); setCustomFieldForm({name:'',value:''}); setShowCustomField(false) }
              }} style={{ padding:'9px 18px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Add Field</button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:500 }} onClick={() => setDeleteConfirm(null)} />
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:360,background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:501,padding:24,textAlign:'center' }}>
            <p style={{ fontSize:32,margin:'0 0 12px' }}>🗑️</p>
            <h3 style={{ margin:'0 0 8px',fontSize:16,fontWeight:700,color:'#f1f5f9' }}>Delete this job?</h3>
            <p style={{ margin:'0 0 20px',fontSize:13,color:'#64748b' }}>This cannot be undone.</p>
            <div style={{ display:'flex',gap:8 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex:1,padding:'10px',border:'1px solid #1e293b',borderRadius:9,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ flex:1,padding:'10px',border:'none',borderRadius:9,background:'#dc2626',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Delete</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
