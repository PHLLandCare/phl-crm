import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
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
  created_at: string
  updated_at: string
  deleted_at: string | null
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

const EMPTY_FORM = {
  title: '', description: '', client_id: '', client_name: '', status: 'draft',
  job_type: '', priority: 'normal', scheduled_start: '', scheduled_end: '',
  assigned_to: '', assigned_name: '', service_address: '', city: '', state: '', zip: '',
  instructions: '', customer_notes: '', total_amount: '',
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const location = useLocation()

  useEffect(() => {
    const f = (location.state as any)?.filter
    if (f) setStatusFilter(f === 'in_progress' ? 'In Progress' : f === 'action_required' ? 'Action Required' : f)
  }, [location.state])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

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
    loadJobs()
    loadClients()
    loadEmployees()
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
  }

  const openCreate = () => {
    setEditingJob(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEdit = (job: Job) => {
    setEditingJob(job)
    setForm({
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

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const payload: any = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      client_id: form.client_id || null,
      client_name: form.client_name.trim() || null,
      status: form.status,
      job_type: form.job_type || null,
      priority: form.priority,
      scheduled_start: form.scheduled_start ? new Date(form.scheduled_start).toISOString() : null,
      scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : null,
      assigned_to: form.assigned_to || null,
      assigned_name: form.assigned_name || null,
      service_address: form.service_address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      zip: form.zip.trim() || null,
      instructions: form.instructions.trim() || null,
      customer_notes: form.customer_notes.trim() || null,
      total_amount: parseFloat(form.total_amount) || 0,
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
  }

  const handleDelete = async (id: string) => {
    await supabase.from('jobs').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setDeleteConfirm(null)
    setSelectedJob(null)
    loadJobs()
  }

  const stats = {
    total: jobs.length,
    scheduled: jobs.filter(j => j.status === 'scheduled').length,
    inProgress: jobs.filter(j => j.status === 'in_progress').length,
    completed: jobs.filter(j => j.status === 'completed').length,
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #1e293b', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#0f172a', color: '#f1f5f9', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }

  // ── JOB DETAIL VIEW ──
  if (selectedJob) {
    return (
      <div style={{ padding: '2rem', background: '#0a0f1a', minHeight: '100vh' }}>
        <button onClick={() => setSelectedJob(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16 }}>
          ← Back to Jobs
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ background: sc(selectedJob.status).bg, color: sc(selectedJob.status).color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{statusLabel(selectedJob.status)}</span>
              <span style={{ fontSize: 13, color: '#475569' }}>{selectedJob.job_number}</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#f1f5f9' }}>{selectedJob.title}</h1>
            {selectedJob.client_name && <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>{selectedJob.client_name}</p>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => openEdit(selectedJob)} style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Edit Job</button>
            <button onClick={() => setDeleteConfirm(selectedJob.id)} style={{ padding: '8px 16px', background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
          </div>
        </div>

        {/* Status buttons */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: 16 }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Status Change</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ALL_STATUSES.map(s => (
              <button key={s} onClick={() => handleStatusChange(selectedJob, s)} style={{
                padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                background: selectedJob.status === s ? sc(s).bg : 'transparent',
                color: selectedJob.status === s ? sc(s).color : '#64748b',
                border: selectedJob.status === s ? `1px solid ${sc(s).color}` : '1px solid #1e293b',
              }}>{statusLabel(s)}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Details */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Job Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 32px' }}>
              {[
                { label: 'Client', value: selectedJob.client_name || '—' },
                { label: 'Job #', value: selectedJob.job_number },
                { label: 'Type', value: JOB_TYPES.find(t => t.value === selectedJob.job_type)?.label || '—' },
                { label: 'Priority', value: selectedJob.priority || '—' },
                { label: 'Scheduled Start', value: fmtDate(selectedJob.scheduled_start) },
                { label: 'Scheduled End', value: fmtDate(selectedJob.scheduled_end) },
                { label: 'Actual Start', value: fmtDate(selectedJob.actual_start) },
                { label: 'Actual End', value: fmtDate(selectedJob.actual_end) },
                { label: 'Assigned To', value: selectedJob.assigned_name || '—' },
                { label: 'Amount', value: fmt(selectedJob.total_amount || 0) },
              ].map(row => (
                <div key={row.label} style={{ borderBottom: '1px solid #1e293b', paddingBottom: 10 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 11, color: '#475569', fontWeight: 600 }}>{row.label}</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#f1f5f9' }}>{row.value}</p>
                </div>
              ))}
            </div>
            {(selectedJob.service_address || selectedJob.city) && (
              <div style={{ marginTop: 12 }}>
                <p style={{ margin: '0 0 2px', fontSize: 11, color: '#475569', fontWeight: 600 }}>Service Address</p>
                <p style={{ margin: 0, fontSize: 13, color: '#f1f5f9' }}>
                  {[selectedJob.service_address, selectedJob.city, selectedJob.state, selectedJob.zip].filter(Boolean).join(', ')}
                </p>
              </div>
            )}
          </div>

          {selectedJob.description && (
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</p>
              <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1' }}>{selectedJob.description}</p>
            </div>
          )}

          {selectedJob.instructions && (
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: '#fbbf24', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Crew Instructions (Internal)</p>
              <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1' }}>{selectedJob.instructions}</p>
            </div>
          )}

          {selectedJob.customer_notes && (
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer Notes</p>
              <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1' }}>{selectedJob.customer_notes}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── JOBS LIST VIEW ──
  return (
    <div style={{ padding: '2rem', background: '#0a0f1a', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', margin: '0 0 2px' }}>Jobs</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{jobs.length} total jobs</p>
        </div>
        <button onClick={openCreate} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ New Job</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Jobs',  value: stats.total,      sub: 'all time' },
          { label: 'Scheduled',   value: stats.scheduled,  sub: 'upcoming' },
          { label: 'In Progress', value: stats.inProgress, sub: 'active now' },
          { label: 'Completed',   value: stats.completed,  sub: 'done' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1rem 1.25rem' }}>
            <p style={{ margin: '0 0 2px', fontSize: 12, color: '#64748b', fontWeight: 600 }}>{s.label}</p>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: '#475569' }}>{s.sub}</p>
            <span style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <input placeholder="Search jobs..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, paddingLeft: 32, height: 38 }} />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }}>🔍</span>
        </div>
        {['All', 'Draft', 'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            background: statusFilter === s ? 'rgba(74,222,128,0.15)' : '#0f172a',
            color: statusFilter === s ? '#4ade80' : '#64748b',
            border: statusFilter === s ? '1px solid rgba(74,222,128,0.3)' : '1px solid #1e293b',
          }}>{s}</button>
        ))}
        <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>{filtered.length} results</p>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>Loading...</div>
      ) : (
        <div style={{ background: '#0f172a', borderRadius: 14, border: '1px solid #1e293b', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', background: '#0d1526' }}>
                {['Job #', 'Title', 'Client', 'Type', 'Scheduled', 'Assigned', 'Amount', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: '#475569', fontSize: 13 }}>No jobs found</td></tr>
              ) : filtered.map(j => (
                <tr key={j.id} onClick={() => setSelectedJob(j)}
                  style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{j.job_number}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{j.title}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#cbd5e1' }}>{j.client_name || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>{JOB_TYPES.find(t => t.value === j.job_type)?.label || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>{fmtDate(j.scheduled_start)}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>{j.assigned_name || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#4ade80', fontWeight: 700 }}>{j.total_amount > 0 ? fmt(j.total_amount) : '—'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ background: sc(j.status).bg, color: sc(j.status).color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{statusLabel(j.status)}</span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <button onClick={e => { e.stopPropagation(); openEdit(j) }} style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New / Edit Modal */}
      {showModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500 }} onClick={() => setShowModal(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 640, maxHeight: '90vh', overflowY: 'auto', background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 501, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>{editingJob ? `Edit Job — ${editingJob.job_number}` : 'New Job'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            <label style={lbl}>Job Title *</label>
            <input style={{ ...inp, marginBottom: 12 }} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Spring Lawn Cleanup" />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lbl}>Client</label>
                <select style={inp} value={form.client_id} onChange={e => {
                  const c = clients.find(c => c.id == e.target.value)
                  setForm({ ...form, client_id: e.target.value, client_name: c ? `${c.first_name} ${c.last_name}` : '' })
                }}>
                  <option value="">— Select client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select style={inp} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lbl}>Job Type</label>
                <select style={inp} value={form.job_type} onChange={e => setForm({ ...form, job_type: e.target.value })}>
                  <option value="">— Select type —</option>
                  {JOB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Priority</label>
                <select style={inp} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                  {['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lbl}>Scheduled Start</label>
                <input style={inp} type="datetime-local" value={form.scheduled_start} onChange={e => setForm({ ...form, scheduled_start: e.target.value })} />
              </div>
              <div>
                <label style={lbl}>Scheduled End</label>
                <input style={inp} type="datetime-local" value={form.scheduled_end} onChange={e => setForm({ ...form, scheduled_end: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lbl}>Assigned To</label>
                <select style={inp} value={form.assigned_to} onChange={e => {
                  const emp = employees.find(emp => emp.id == e.target.value)
                  setForm({ ...form, assigned_to: e.target.value, assigned_name: emp?.name || '' })
                }}>
                  <option value="">— Unassigned —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Total Amount ($)</label>
                <input style={inp} type="number" min="0" step="0.01" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} placeholder="0.00" />
              </div>
            </div>

            <label style={lbl}>Service Address</label>
            <input style={{ ...inp, marginBottom: 8 }} value={form.service_address} onChange={e => setForm({ ...form, service_address: e.target.value })} placeholder="Street address" />
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              <input style={inp} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="City" />
              <input style={inp} value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="State" />
              <input style={inp} value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} placeholder="ZIP" />
            </div>

            <label style={lbl}>Description</label>
            <textarea style={{ ...inp, height: 70, resize: 'vertical', marginBottom: 12 } as React.CSSProperties} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What needs to be done..." />

            <label style={lbl}>Crew Instructions <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(internal only)</span></label>
            <textarea style={{ ...inp, height: 60, resize: 'vertical', marginBottom: 12 } as React.CSSProperties} value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} placeholder="Gate code, access notes..." />

            <label style={lbl}>Customer Notes <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(visible to client)</span></label>
            <textarea style={{ ...inp, height: 60, resize: 'vertical', marginBottom: 20 } as React.CSSProperties} value={form.customer_notes} onChange={e => setForm({ ...form, customer_notes: e.target.value })} placeholder="Notes to share with customer..." />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 20px', border: '1px solid #1e293b', borderRadius: 9, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '10px 20px', border: 'none', borderRadius: 9, background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : editingJob ? 'Save Changes' : 'Create Job'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500 }} onClick={() => setDeleteConfirm(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 360, background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 501, padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 32, margin: '0 0 12px' }}>🗑️</p>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Delete this job?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '10px', border: '1px solid #1e293b', borderRadius: 9, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 9, background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
