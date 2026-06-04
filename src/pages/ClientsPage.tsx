import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface Client {
  id: string
  first_name: string
  last_name: string
  company: string
  phone: string
  email: string
  status: string
  divisions: string
  address: string
  city: string
  state: string
  zip: string
  tags: string
  notes: string
  lead_source: string
  lawn_size: string
  locked_gate: boolean
  has_dog: boolean
  irrigation: string
  pest_control: string
  created_at: string
  updated_at: string
}

interface ClientFile {
  id: number
  client_id: number
  name: string
  size: number
  type: string
  url: string
  created_at: string
}

interface WorkItem {
  id: number
  type: 'quote' | 'job' | 'invoice' | 'request'
  number: string
  title: string
  status: string
  amount: number
  created_at: string
}

interface ScheduleItem {
  id: number
  type: string
  title: string
  description: string
  scheduled_at: string
  status: string
  assigned_name: string
}

const DIVISIONS = [
  { label: 'Lawn & Tree', icon: '🌿' },
  { label: 'Irrigation', icon: '💧' },
  { label: 'Extermination', icon: '🐛' },
  { label: 'Nursery', icon: '🌱' },
  { label: 'Farm', icon: '🚜' },
]

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active:   { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' },
  lead:     { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24' },
  overdue:  { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  inactive: { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
}

const SCHEDULE_TYPES = ['All','Assessment','Task','Events','Visits','Invoice Reminder','Quote Reminder']
const SCHEDULE_STATUSES = ['All','Completed','Incomplete']

export default function ClientsPage() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Leads and Active')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [activeTab, setActiveTab] = useState('info')
  const [showNewClient, setShowNewClient] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [files, setFiles] = useState<ClientFile[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [newNote, setNewNote] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Work overview state
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [workFilter, setWorkFilter] = useState<'All'|'Requests'|'Quotes'|'Jobs'|'Invoices'>('All')
  const [workStatus, setWorkStatus] = useState('Active')
  const [showWorkCreate, setShowWorkCreate] = useState(false)

  // Client schedule state
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([])
  const [schedTypeFilter, setSchedTypeFilter] = useState('All')
  const [schedStatusFilter, setSchedStatusFilter] = useState('All')
  const [showSchedTypeMenu, setShowSchedTypeMenu] = useState(false)
  const [showSchedStatusMenu, setShowSchedStatusMenu] = useState(false)
  const [showAddSchedule, setShowAddSchedule] = useState(false)
  const [schedForm, setSchedForm] = useState({ type: 'Task', title: '', description: '', scheduled_at: '', assigned_name: '' })

  // Billing state
  const [showBillingMenu, setShowBillingMenu] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [_showDepositModal, setShowDepositModal] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Square', note: '' })

  // Header action menus
  const [showDotsMenu, setShowDotsMenu] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showAddProperty, setShowAddProperty] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '', role: '' })

  const [form, setForm] = useState({
    first_name: '', last_name: '', company: '', phone: '', email: '',
    address: '', city: '', state: 'FL', zip: '',
    status: 'lead', divisions: 'Lawn & Tree', tags: '',
    notes: '', lead_source: '', lawn_size: 'Small',
    locked_gate: false, has_dog: false, irrigation: 'No', pest_control: 'No'
  })

  const loadClients = async () => {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').is('deleted_at', null).order('updated_at', { ascending: false })
    setClients(data ?? [])
    setLoading(false)
  }

  const loadFiles = async (clientId: string) => {
    const { data } = await supabase.from('client_files').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
    setFiles(data ?? [])
  }

  const loadWorkItems = async (client: Client) => {
    const name = `${client.first_name} ${client.last_name}`
    const [q, j, i] = await Promise.all([
      supabase.from('quotes').select('id,quote_number,title,status,amount,created_at').eq('client_name', name).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('jobs').select('id,job_number,title,status,total_amount,created_at').eq('client_name', name).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('invoices').select('id,invoice_number,title,status,amount,created_at').eq('client_name', name).is('deleted_at', null).order('created_at', { ascending: false }).limit(20),
    ])
    const items: WorkItem[] = [
      ...(q.data ?? []).map((r: any) => ({ id: r.id, type: 'quote' as const, number: r.quote_number || `Q-${r.id}`, title: r.title || 'Quote', status: r.status, amount: r.amount || 0, created_at: r.created_at })),
      ...(j.data ?? []).map((r: any) => ({ id: r.id, type: 'job' as const, number: r.job_number || `J-${r.id}`, title: r.title || 'Job', status: r.status, amount: r.total_amount || 0, created_at: r.created_at })),
      ...(i.data ?? []).map((r: any) => ({ id: r.id, type: 'invoice' as const, number: r.invoice_number || `INV-${r.id}`, title: r.title || 'Invoice', status: r.status, amount: r.amount || 0, created_at: r.created_at })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setWorkItems(items)
  }

  const loadScheduleItems = async (client: Client) => {
    // Mock schedule items linked to this client's quotes/reminders
    const name = `${client.first_name} ${client.last_name}`
    const { data: quotes } = await supabase.from('quotes').select('id,quote_number,status,created_at,updated_at').eq('client_name', name).is('deleted_at', null)
    const items: ScheduleItem[] = (quotes ?? [])
      .filter((q: any) => q.status === 'sent')
      .map((q: any) => ({
        id: q.id,
        type: 'Quote Reminder',
        title: `Reminder for Quote #${q.quote_number || q.id}`,
        description: `Quote was sent on ${new Date(q.updated_at || q.created_at).toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'})} but no job has been generated yet`,
        scheduled_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'Incomplete',
        assigned_name: 'Jesenia Fagarass',
      }))
    setScheduleItems(items)
  }

  useEffect(() => {
    loadClients()
    const channel = supabase.channel('clients-main')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, loadClients)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (selectedClient) {
      loadFiles(selectedClient.id)
      loadWorkItems(selectedClient)
      loadScheduleItems(selectedClient)
    }
  }, [selectedClient])

  // Close menus on outside click
  useEffect(() => {
    const handler = () => {
      setShowDotsMenu(false)
      setShowCreateMenu(false)
      setShowWorkCreate(false)
      setShowBillingMenu(false)
      setShowSchedTypeMenu(false)
      setShowSchedStatusMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openClient = (c: Client) => {
    setSelectedClient(c)
    setEditMode(false)
    setActiveTab('info')
    setForm({
      first_name: c.first_name || '', last_name: c.last_name || '',
      company: c.company || '', phone: c.phone || '', email: c.email || '',
      address: c.address || '', city: c.city || '', state: c.state || 'FL', zip: c.zip || '',
      status: c.status || 'lead', divisions: c.divisions || 'Lawn & Tree',
      tags: c.tags || '', notes: c.notes || '', lead_source: c.lead_source || '',
      lawn_size: c.lawn_size || 'Small', locked_gate: c.locked_gate || false,
      has_dog: c.has_dog || false, irrigation: c.irrigation || 'No', pest_control: c.pest_control || 'No'
    })
  }

  const openNewClient = () => {
    setForm({
      first_name: '', last_name: '', company: '', phone: '', email: '',
      address: '', city: '', state: 'FL', zip: '',
      status: 'lead', divisions: 'Lawn & Tree', tags: '',
      notes: '', lead_source: '', lawn_size: 'Small',
      locked_gate: false, has_dog: false, irrigation: 'No', pest_control: 'No'
    })
    setShowNewClient(true)
  }

  const handleSaveNew = async () => {
    if (!form.first_name || !form.last_name) return
    await supabase.from('clients').insert({ ...form, updated_at: new Date().toISOString() })
    setShowNewClient(false)
    loadClients()
  }

  const handleSaveEdit = async () => {
    if (!selectedClient) return
    const { data } = await supabase.from('clients').update({ ...form, updated_at: new Date().toISOString() }).eq('id', selectedClient.id).select().single()
    if (data) setSelectedClient(data)
    setEditMode(false)
    loadClients()
  }

  const handleSaveNote = async () => {
    if (!selectedClient || !newNote.trim()) return
    const existing = selectedClient.notes || ''
    const updated = existing ? existing + '\n\n' + new Date().toLocaleString() + '\n' + newNote : new Date().toLocaleString() + '\n' + newNote
    await supabase.from('clients').update({ notes: updated }).eq('id', selectedClient.id)
    setSelectedClient({ ...selectedClient, notes: updated })
    setNewNote('')
  }

  const handleArchive = async (id: string) => {
    if (!confirm('Archive this client?')) return
    await supabase.from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setSelectedClient(null)
    loadClients()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedClient || !e.target.files?.length) return
    setUploadingFile(true)
    const file = e.target.files[0]
    const path = `${selectedClient.id}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('client-files').upload(path, file)
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('client-files').getPublicUrl(path)
      await supabase.from('client_files').insert({
        client_id: selectedClient.id, name: file.name,
        size: file.size, type: file.type, url: publicUrl
      })
      loadFiles(selectedClient.id)
    }
    setUploadingFile(false)
  }

  const handleDeleteFile = async (fileId: number, url: string) => {
    if (!confirm('Delete this file?')) return
    await supabase.from('client_files').delete().eq('id', fileId)
    const path = url.split('/client-files/')[1]
    if (path) await supabase.storage.from('client-files').remove([path])
    loadFiles(selectedClient!.id)
  }

  const handleAddScheduleItem = async () => {
    if (!schedForm.title || !schedForm.scheduled_at) return
    const newItem: ScheduleItem = {
      id: Date.now(),
      type: schedForm.type,
      title: schedForm.title,
      description: schedForm.description,
      scheduled_at: new Date(schedForm.scheduled_at).toISOString(),
      status: 'Incomplete',
      assigned_name: schedForm.assigned_name || 'Unassigned',
    }
    setScheduleItems([...scheduleItems, newItem])
    setShowAddSchedule(false)
    setSchedForm({ type: 'Task', title: '', description: '', scheduled_at: '', assigned_name: '' })
  }

  const handleMarkScheduleDone = (id: number) => {
    setScheduleItems(scheduleItems.map(s => s.id === id ? { ...s, status: s.status === 'Completed' ? 'Incomplete' : 'Completed' } : s))
  }

  const fmtSize = (bytes: number) => bytes < 1024 ? bytes + ' B' : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  const fmtTime = (d: string) => {
    if (!d) return '—'
    const date = new Date(d)
    const today = new Date()
    if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const diff = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 1) return 'Yesterday'
    if (diff < 7) return diff + 'd ago'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const fmt = (n: number) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const filtered = clients.filter(c => {
    const matchSearch = `${c.first_name} ${c.last_name} ${c.company} ${c.email} ${c.phone} ${c.address} ${c.tags}`.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' ? true
      : statusFilter === 'Leads and Active' ? (c.status?.toLowerCase() === 'lead' || c.status?.toLowerCase() === 'active')
      : c.status?.toLowerCase() === statusFilter.toLowerCase()
    return matchSearch && matchStatus
  })

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const newLeads = clients.filter(c => c.status === 'lead' && new Date(c.created_at) > thirtyDaysAgo).length
  const newClients = clients.filter(c => c.status === 'active' && new Date(c.created_at) > thirtyDaysAgo).length
  const activeCount = clients.filter(c => c.status === 'active').length
  const leadCount = clients.filter(c => c.status === 'lead').length

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #1e293b', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#0f172a', color: '#f1f5f9', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }
  const sc = (s: string) => STATUS_COLORS[s] || STATUS_COLORS.inactive

  const workStatusColors: Record<string, {bg:string;color:string}> = {
    draft:             { bg:'rgba(100,116,139,0.15)', color:'#94a3b8' },
    sent:              { bg:'rgba(251,191,36,0.15)',  color:'#fbbf24' },
    approved:          { bg:'rgba(74,222,128,0.15)',  color:'#4ade80' },
    'awaiting response':{ bg:'rgba(251,191,36,0.15)', color:'#fbbf24' },
    scheduled:         { bg:'rgba(96,165,250,0.15)',  color:'#60a5fa' },
    in_progress:       { bg:'rgba(251,191,36,0.15)',  color:'#fbbf24' },
    completed:         { bg:'rgba(74,222,128,0.15)',  color:'#4ade80' },
    paid:              { bg:'rgba(74,222,128,0.15)',  color:'#4ade80' },
    overdue:           { bg:'rgba(248,113,113,0.15)', color:'#f87171' },
  }
  const workSC = (s: string) => workStatusColors[s?.toLowerCase()] || { bg:'rgba(100,116,139,0.15)', color:'#94a3b8' }

  const workTypeIcon: Record<string, string> = {
    quote: '📋', job: '🔧', invoice: '💰', request: '📬'
  }
  const workTypeColor: Record<string, string> = {
    quote: '#a855f7', job: '#4ade80', invoice: '#3b82f6', request: '#f59e0b'
  }

  const filteredWork = workItems.filter(w => {
    const typeOk = workFilter === 'All' || w.type === workFilter.slice(0,-1).toLowerCase()
    return typeOk
  })

  const filteredSched = scheduleItems.filter(s => {
    const typeOk = schedTypeFilter === 'All' || s.type === schedTypeFilter
    const statOk = schedStatusFilter === 'All' || s.status === schedStatusFilter
    return typeOk && statOk
  })

  // ── CLIENT DETAIL VIEW ──
  if (selectedClient) {
    const tagList = (editMode ? form.tags : selectedClient.tags || '').split(',').map(t => t.trim()).filter(Boolean)
    const noteLines = (selectedClient.notes || '').split('\n\n').filter(Boolean)
    const addr = [selectedClient.address, selectedClient.city, selectedClient.state, selectedClient.zip].filter(Boolean).join(', ')

    return (
      <div style={{ padding: '2rem', background: '#0a0f1a', minHeight: '100vh', position: 'relative' }} onClick={() => {
        setShowDotsMenu(false); setShowCreateMenu(false); setShowWorkCreate(false)
        setShowBillingMenu(false); setShowSchedTypeMenu(false); setShowSchedStatusMenu(false)
      }}>
        {/* Back */}
        <button onClick={() => { setSelectedClient(null); navigate('/clients') }}
          style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Back to Clients
        </button>

        {/* ── JOBBER-STYLE HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#64748b' }}>👤</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ background: sc(selectedClient.status).bg, color: sc(selectedClient.status).color, padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>{selectedClient.status}</span>
              </div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#f1f5f9' }}>{selectedClient.first_name} {selectedClient.last_name}</h1>
            </div>
          </div>
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
            {/* Email button */}
            <button onClick={() => { if (selectedClient.email) window.open(`mailto:${selectedClient.email}`) }}
              style={{ padding: '8px 14px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, color: '#f1f5f9', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
              ✉️
            </button>
            {/* ... dots menu */}
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button onClick={() => { setShowDotsMenu(v => !v); setShowCreateMenu(false) }}
                style={{ padding: '8px 12px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, color: '#f1f5f9', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                ···
              </button>
              {showDotsMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#0d1526', border: '1px solid #1e293b', borderRadius: 10, zIndex: 200, minWidth: 180, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                  {[
                    { icon: '✉️', label: 'Send Login Email', action: () => {} },
                    { icon: '👤', label: 'Log in as Client', action: () => {} },
                    { icon: '📦', label: 'Archive', action: () => { setShowDotsMenu(false); handleArchive(selectedClient.id) } },
                    { icon: '🗑️', label: 'Delete Client', action: () => { setShowDotsMenu(false); handleArchive(selectedClient.id) }, red: true },
                    { icon: '⚙️', label: 'Customize view', action: () => {} },
                  ].map((item: any) => (
                    <button key={item.label} onClick={item.action}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 16px', background: 'none', border: 'none', color: item.red ? '#f87171' : '#f1f5f9', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#1e293b')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      <span>{item.icon}</span>{item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* + Create dropdown */}
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button onClick={() => { setShowCreateMenu(v => !v); setShowDotsMenu(false) }}
                style={{ padding: '8px 16px', background: '#16a34a', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                + Create
              </button>
              {showCreateMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#0d1526', border: '1px solid #1e293b', borderRadius: 10, zIndex: 200, minWidth: 160, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                  {[
                    { icon: '📬', label: 'Request',  color: '#f59e0b', nav: '/requests' },
                    { icon: '📋', label: 'Quote',    color: '#a855f7', nav: '/quotes' },
                    { icon: '🔧', label: 'Job',      color: '#4ade80', nav: '/jobs' },
                    { icon: '💰', label: 'Invoice',  color: '#3b82f6', nav: '/invoices' },
                  ].map(item => (
                    <button key={item.label} onClick={() => { setShowCreateMenu(false); navigate(item.nav, { state: { openCreate: true, clientId: selectedClient.id, clientName: `${selectedClient.first_name} ${selectedClient.last_name}` } }) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 16px', background: 'none', border: 'none', color: '#f1f5f9', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#1e293b')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      <span style={{ color: item.color }}>{item.icon}</span>{item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Edit pencil */}
            <button onClick={() => { setEditMode(true); setTimeout(() => document.getElementById('client-edit-form')?.scrollIntoView({behavior:'smooth',block:'start'}), 100) }} style={{ padding: '8px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', cursor: 'pointer', fontSize: 15, display:'flex', alignItems:'center', gap: 6 }}>✏️ <span style={{fontSize:12,fontWeight:600}}>Edit</span></button>
          </div>
        </div>

        {/* Contact quick-info row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16, marginBottom: 16, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1rem 1.5rem' }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 11, color: '#475569', fontWeight: 600 }}>Main phone</p>
            {selectedClient.phone ? <a href={`tel:${selectedClient.phone}`} style={{ color: '#4ade80', fontSize: 13, textDecoration: 'none' }}>{selectedClient.phone}</a> : <span style={{ color: '#475569', fontSize: 13 }}>—</span>}
          </div>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 11, color: '#475569', fontWeight: 600 }}>Main email</p>
            {selectedClient.email ? <a href={`mailto:${selectedClient.email}`} style={{ color: '#4ade80', fontSize: 13, textDecoration: 'none' }}>{selectedClient.email}</a> : <span style={{ color: '#475569', fontSize: 13 }}>—</span>}
          </div>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 11, color: '#475569', fontWeight: 600 }}>Payment terms</p>
            <p style={{ margin: 0, fontSize: 13, color: '#f1f5f9' }}>Residential default (Net 7)</p>
          </div>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 11, color: '#475569', fontWeight: 600 }}>Lead source</p>
            <p style={{ margin: 0, fontSize: 13, color: '#f1f5f9' }}>{selectedClient.lead_source || '—'}</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', marginBottom: 24, gap: 0 }}>
          {[{ id:'info', label:'Client information' }, { id:'files', label:'Files and media' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: activeTab === tab.id ? '2px solid #4ade80' : '2px solid transparent', color: activeTab === tab.id ? '#f1f5f9' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── PROPERTIES ── */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Properties</h3>
                <button onClick={() => setShowAddProperty(true)} style={{ width: 36, height: 36, borderRadius: 8, background: '#1e293b', border: '1px solid #4ade80', color: '#4ade80', cursor: 'pointer', fontSize: 20, fontWeight: 700, display:'flex',alignItems:'center',justifyContent:'center' }}>+</button>
              </div>
              {addr && (
                <div style={{ border: '1px solid #1e293b', borderRadius: 10, padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{addr}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={{ background:'none',border:'none',color:'#4ade80',cursor:'pointer',fontSize:16 }}>📍</button>
                      <button onClick={() => setEditMode(true)} style={{ background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:15 }}>✏️</button>
                    </div>
                  </div>
                  {editMode ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div><label style={lbl}>Lawn Size</label><select style={inp} value={form.lawn_size} onChange={e => setForm({...form, lawn_size: e.target.value})}>{['Small','Medium','Large','Extra Large'].map(s=><option key={s}>{s}</option>)}</select></div>
                      <div><label style={lbl}>Locked Gate</label><select style={inp} value={form.locked_gate ? 'Yes' : 'No'} onChange={e => setForm({...form, locked_gate: e.target.value==='Yes'})}><option>No</option><option>Yes</option></select></div>
                      <div><label style={lbl}>Dog</label><select style={inp} value={form.has_dog ? 'Yes' : 'No'} onChange={e => setForm({...form, has_dog: e.target.value==='Yes'})}><option>No</option><option>Yes</option></select></div>
                      <div><label style={lbl}>Irrigation</label><select style={inp} value={form.irrigation} onChange={e => setForm({...form, irrigation: e.target.value})}><option>No</option><option>Yes</option></select></div>
                      <div><label style={lbl}>Pest Control</label><select style={inp} value={form.pest_control} onChange={e => setForm({...form, pest_control: e.target.value})}><option>No</option><option>Yes</option></select></div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 32px' }}>
                      {[
                        { label: 'Lawn Size', value: selectedClient.lawn_size },
                        { label: 'Locked Gate', value: selectedClient.locked_gate ? 'Yes' : 'No' },
                        { label: 'Dog', value: selectedClient.has_dog ? 'Yes' : 'No' },
                        { label: 'Irrigation', value: selectedClient.irrigation },
                        { label: 'Pest Control', value: selectedClient.pest_control },
                      ].map(row => (
                        <div key={row.label} style={{ borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
                          <p style={{ margin: '0 0 2px', fontSize: 11, color: '#475569', fontWeight: 600 }}>{row.label}</p>
                          <p style={{ margin: 0, fontSize: 13, color: '#f1f5f9' }}>{row.value || 'No'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── CONTACTS ── */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>👥</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Contacts</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}> — Add contacts to keep track of everyone you communicate with</span>
                </div>
                <button onClick={() => setShowAddContact(true)} style={{ color: '#4ade80', fontSize: 13, fontWeight: 600, background: 'none', border: '1px solid #4ade80', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>Add Contact</button>
              </div>
            </div>

            {/* ── WORK OVERVIEW ── */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Work overview</h3>
                {/* + button with dropdown */}
                <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setShowWorkCreate(v => !v)}
                    style={{ width: 36, height: 36, borderRadius: 8, background: '#1e293b', border: '1px solid #4ade80', color: '#4ade80', cursor: 'pointer', fontSize: 20, fontWeight: 700, display:'flex',alignItems:'center',justifyContent:'center' }}>+</button>
                  {showWorkCreate && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#0d1526', border: '1px solid #1e293b', borderRadius: 10, zIndex: 200, minWidth: 140, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                      {[
                        { icon: '📬', label: 'Request', nav: '/requests' },
                        { icon: '📋', label: 'Quote',   nav: '/quotes' },
                        { icon: '🔧', label: 'Job',     nav: '/jobs' },
                        { icon: '💰', label: 'Invoice', nav: '/invoices' },
                      ].map(item => (
                        <button key={item.label} onClick={() => { setShowWorkCreate(false); navigate(item.nav, { state: { openCreate: true, clientId: selectedClient.id, clientName: `${selectedClient.first_name} ${selectedClient.last_name}` } }) }}
                          style={{ display:'flex',alignItems:'center',gap:8,width:'100%',padding:'10px 14px',background:'none',border:'none',color:'#f1f5f9',fontSize:13,cursor:'pointer',fontFamily:'inherit',textAlign:'left' }}
                          onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                          {item.icon} {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Filter tabs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {/* Status | Active pill */}
                <button onClick={() => setWorkStatus(workStatus === 'Active' ? 'All' : 'Active')}
                  style={{ padding: '5px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 99, fontSize: 12, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Status | {workStatus}
                </button>
                {(['All','Requests','Quotes','Jobs','Invoices'] as const).map(f => (
                  <button key={f} onClick={() => setWorkFilter(f)}
                    style={{ padding: '5px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: workFilter === f ? 700 : 400,
                      background: workFilter === f ? 'rgba(74,222,128,0.15)' : 'transparent',
                      border: workFilter === f ? '1px solid rgba(74,222,128,0.3)' : '1px solid transparent',
                      color: workFilter === f ? '#4ade80' : '#64748b' }}>
                    {f === 'All' ? '' : { Requests:'📬 ', Quotes:'📋 ', Jobs:'🔧 ', Invoices:'💰 ' }[f]}{f}
                  </button>
                ))}
              </div>

              {/* Work items table */}
              {filteredWork.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#475569', fontSize: 13 }}>No work items found</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      {['Item','Date','Status','Amount'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWork.map(w => (
                      <tr key={`${w.type}-${w.id}`} style={{ borderBottom: '1px solid #0f172a', cursor: 'pointer' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.02)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                        onClick={() => navigate(`/${w.type}s`, { state: { openItem: w.id } })}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: workTypeColor[w.type], fontSize: 14 }}>{workTypeIcon[w.type]}</span>
                            <div>
                              <p style={{ margin: '0 0 1px', fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{w.type === 'quote' ? 'Quote' : w.type === 'job' ? 'Job' : 'Invoice'} #{w.number}</p>
                              <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{w.title}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>
                          <p style={{ margin: 0, fontSize: 10, color: '#475569' }}>Created at</p>
                          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>{fmtDate(w.created_at)}</p>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: workSC(w.status).bg, color: workSC(w.status).color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
                            {w.status === 'sent' ? 'Awaiting response' : w.status?.replace('_',' ')}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 13, color: '#f1f5f9', fontWeight: 700, textAlign: 'right' }}>{fmt(w.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── BILLING ── */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>💳</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Billing</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}> — Bill this client to see billing history</span>
                </div>
                <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setShowBillingMenu(v => !v)}
                    style={{ color: '#4ade80', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Add Billing Information
                  </button>
                  {showBillingMenu && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#0d1526', border: '1px solid #1e293b', borderRadius: 10, zIndex: 200, minWidth: 180, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                      {['Collect payment', 'Record deposit', 'Invoice', 'Set initial balance'].map(opt => (
                        <button key={opt} onClick={() => {
                          setShowBillingMenu(false)
                          if (opt === 'Collect payment') setShowPaymentModal(true)
                          else if (opt === 'Record deposit') setShowDepositModal(true)
                          else if (opt === 'Invoice') navigate('/invoices', { state: { openCreate: true, clientId: selectedClient.id, clientName: `${selectedClient.first_name} ${selectedClient.last_name}` } })
                        }}
                          style={{ display:'block',width:'100%',padding:'11px 16px',background:'none',border:'none',color:'#f1f5f9',fontSize:13,cursor:'pointer',fontFamily:'inherit',textAlign:'left' }}
                          onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── PAYMENT METHODS (Square) ── */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>💳</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Payment methods</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}> — Saved payment methods will appear here once Square is connected</span>
                </div>
                <a href="https://squareup.com" target="_blank" rel="noreferrer"
                  style={{ color: '#4ade80', fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ display:'inline-block', background:'#fff', borderRadius:4, padding:'2px 6px', fontSize:11, fontWeight:800, color:'#000' }}>■ Square</span> Set up Square Payments
                </a>
              </div>
            </div>

            {/* ── CLIENT SCHEDULE ── */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Client schedule</h3>
                <button onClick={() => setShowAddSchedule(true)}
                  style={{ width: 36, height: 36, borderRadius: 8, background: '#1e293b', border: '1px solid #4ade80', color: '#4ade80', cursor: 'pointer', fontSize: 20, fontWeight: 700, display:'flex',alignItems:'center',justifyContent:'center' }}>+</button>
              </div>

              {/* Type + Status filters */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                {/* Type filter */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => { setShowSchedTypeMenu(v => !v); setShowSchedStatusMenu(false) }}
                    style={{ padding: '5px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 99, fontSize: 12, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Type | {schedTypeFilter}
                  </button>
                  {showSchedTypeMenu && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#0d1526', border: '1px solid #1e293b', borderRadius: 10, zIndex: 200, minWidth: 180, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b' }}>
                        <input placeholder="Search" style={{ ...inp, padding: '6px 10px', fontSize: 12 }} />
                      </div>
                      {SCHEDULE_TYPES.map(t => (
                        <button key={t} onClick={() => { setSchedTypeFilter(t); setShowSchedTypeMenu(false) }}
                          style={{ display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'10px 14px',background:'none',border:'none',color: schedTypeFilter === t ? '#4ade80' : '#f1f5f9',fontSize:13,cursor:'pointer',fontFamily:'inherit',textAlign:'left' }}
                          onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                          {t} {schedTypeFilter === t && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status filter */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => { setShowSchedStatusMenu(v => !v); setShowSchedTypeMenu(false) }}
                    style={{ padding: '5px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 99, fontSize: 12, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Status | {schedStatusFilter}
                  </button>
                  {showSchedStatusMenu && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#0d1526', border: '1px solid #1e293b', borderRadius: 10, zIndex: 200, minWidth: 160, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                      {SCHEDULE_STATUSES.map(s => (
                        <button key={s} onClick={() => { setSchedStatusFilter(s); setShowSchedStatusMenu(false) }}
                          style={{ display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'10px 14px',background:'none',border:'none',color: schedStatusFilter === s ? '#4ade80' : '#f1f5f9',fontSize:13,cursor:'pointer',fontFamily:'inherit',textAlign:'left' }}
                          onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                          {s} {schedStatusFilter === s && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Schedule table */}
              {filteredSched.length === 0 ? (
                <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>No schedule items</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      {['Schedule','Title','Assigned'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSched.map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.02)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                        onClick={() => navigate('/schedule')}>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#f87171', fontSize: 16 }}>🔔</span>
                            <div>
                              <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f87171' }}>{new Date(s.scheduled_at).toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'})}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <p style={{ margin: '0 0 2px', fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{s.title}</p>
                          <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{s.description}</p>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#60a5fa' }}>
                              {s.assigned_name.split(' ').map(n=>n[0]).slice(0,2).join('')}
                            </div>
                            <span style={{ fontSize: 13, color: '#94a3b8' }}>{s.assigned_name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <button onClick={e => { e.stopPropagation(); handleMarkScheduleDone(s.id) }}
                            style={{ width: 28, height: 28, borderRadius: 6, background: s.status === 'Completed' ? 'rgba(74,222,128,0.2)' : '#1e293b', border: '1px solid #334155', color: s.status === 'Completed' ? '#4ade80' : '#64748b', cursor: 'pointer', fontSize: 14, display:'flex',alignItems:'center',justifyContent:'center' }}>
                            ✓
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── CONTACT INFO (edit) ── */}
            {editMode && (
              <div id="client-edit-form" style={{ background: '#0f172a', border: '2px solid #4ade80', borderRadius: 14, padding: '1.25rem' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Edit Contact Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={lbl}>First Name</label><input style={inp} value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} /></div>
                  <div><label style={lbl}>Last Name</label><input style={inp} value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} /></div>
                  <div><label style={lbl}>Company</label><input style={inp} value={form.company} onChange={e => setForm({...form, company: e.target.value})} /></div>
                  <div><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                  <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Email</label><input style={inp} value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
                  <div><label style={lbl}>Status</label><select style={inp} value={form.status} onChange={e => setForm({...form, status: e.target.value})}>{['lead','active','inactive','overdue'].map(s=><option key={s}>{s}</option>)}</select></div>
                  <div><label style={lbl}>Division</label><select style={inp} value={form.divisions} onChange={e => setForm({...form, divisions: e.target.value})}>{DIVISIONS.map(d=><option key={d.label}>{d.label}</option>)}</select></div>
                  <div><label style={lbl}>Lead Source</label><input style={inp} value={form.lead_source} onChange={e => setForm({...form, lead_source: e.target.value})} /></div>
                  <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Street Address</label><input style={inp} value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
                  <div><label style={lbl}>City</label><input style={inp} value={form.city} onChange={e => setForm({...form, city: e.target.value})} /></div>
                  <div><label style={lbl}>ZIP</label><input style={inp} value={form.zip} onChange={e => setForm({...form, zip: e.target.value})} /></div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button onClick={() => setEditMode(false)} style={{ padding:'8px 16px',border:'1px solid #1e293b',borderRadius:8,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
                  <button onClick={handleSaveEdit} style={{ padding:'8px 16px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Save Changes</button>
                </div>
              </div>
            )}

            {/* ── TAGS ── */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Tags</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tagList.length === 0 ? <span style={{ color: '#475569', fontSize: 13 }}>No tags yet</span>
                  : tagList.map((t, i) => (
                    <span key={i} style={{ background: 'rgba(100,116,139,0.15)', color: '#94a3b8', padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>{t}</span>
                  ))}
              </div>
            </div>

            {/* ── NOTES ── */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Notes</h3>
              {noteLines.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {noteLines.map((note, i) => (
                    <div key={i} style={{ background: '#1e293b', borderRadius: 8, padding: '10px 12px', marginBottom: 8, fontSize: 13, color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>{note}</div>
                  ))}
                </div>
              )}
              <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Leave an internal note..." style={{ ...inp, height: 80, resize: 'vertical' } as React.CSSProperties} />
              <button onClick={handleSaveNote} style={{ marginTop: 8, padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Save Note</button>
            </div>

          </div>
        )}

        {activeTab === 'files' && (
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Files & Documents</h3>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile} style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {uploadingFile ? 'Uploading...' : '+ Upload File'}
              </button>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
            </div>
            {files.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                <p style={{ margin: 0, fontSize: 13 }}>No files uploaded yet</p>
              </div>
            ) : (
              files.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #1e293b' }}>
                  <div style={{ fontSize: 24 }}>{f.type.startsWith('image') ? '🖼️' : f.type === 'application/pdf' ? '📄' : '📎'}</div>
                  <div style={{ flex: 1 }}>
                    <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#4ade80', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>{f.name}</a>
                    <p style={{ margin: 0, fontSize: 11, color: '#475569' }}>{fmtSize(f.size)} · {fmtTime(f.created_at)}</p>
                  </div>
                  <button onClick={() => handleDeleteFile(f.id, f.url)} style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                </div>
              ))
            )}
          </div>
        )}


        {/* ── ADD PROPERTY MODAL ── */}
        {showAddProperty && (
          <>
            <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:500 }} onClick={() => setShowAddProperty(false)} />
            <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:520,maxHeight:'90vh',overflowY:'auto',background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:501,padding:24 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
                <h2 style={{ margin:0,fontSize:17,fontWeight:700,color:'#f1f5f9' }}>Edit Property Details</h2>
                <button onClick={() => setShowAddProperty(false)} style={{ background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer' }}>×</button>
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,display:'block' }}>Street Address</label>
                  <input style={{ width:'100%',padding:'9px 11px',border:'1px solid #1e293b',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#0f172a',color:'#f1f5f9',boxSizing:'border-box' as const }} value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="123 Main St" />
                </div>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,display:'block' }}>City</label>
                  <input style={{ width:'100%',padding:'9px 11px',border:'1px solid #1e293b',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#0f172a',color:'#f1f5f9',boxSizing:'border-box' as const }} value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
                </div>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,display:'block' }}>ZIP</label>
                  <input style={{ width:'100%',padding:'9px 11px',border:'1px solid #1e293b',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#0f172a',color:'#f1f5f9',boxSizing:'border-box' as const }} value={form.zip} onChange={e => setForm({...form, zip: e.target.value})} />
                </div>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,display:'block' }}>Lawn Size</label>
                  <select style={{ width:'100%',padding:'9px 11px',border:'1px solid #1e293b',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#0f172a',color:'#f1f5f9',boxSizing:'border-box' as const }} value={form.lawn_size} onChange={e => setForm({...form, lawn_size: e.target.value})}>
                    {['Small','Medium','Large','Extra Large'].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,display:'block' }}>Irrigation</label>
                  <select style={{ width:'100%',padding:'9px 11px',border:'1px solid #1e293b',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#0f172a',color:'#f1f5f9',boxSizing:'border-box' as const }} value={form.irrigation} onChange={e => setForm({...form, irrigation: e.target.value})}>
                    <option>No</option><option>Yes</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,display:'block' }}>Pest Control</label>
                  <select style={{ width:'100%',padding:'9px 11px',border:'1px solid #1e293b',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#0f172a',color:'#f1f5f9',boxSizing:'border-box' as const }} value={form.pest_control} onChange={e => setForm({...form, pest_control: e.target.value})}>
                    <option>No</option><option>Yes</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,display:'block' }}>Locked Gate</label>
                  <select style={{ width:'100%',padding:'9px 11px',border:'1px solid #1e293b',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#0f172a',color:'#f1f5f9',boxSizing:'border-box' as const }} value={form.locked_gate ? 'Yes' : 'No'} onChange={e => setForm({...form, locked_gate: e.target.value==='Yes'})}>
                    <option>No</option><option>Yes</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,display:'block' }}>Dog on Property</label>
                  <select style={{ width:'100%',padding:'9px 11px',border:'1px solid #1e293b',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#0f172a',color:'#f1f5f9',boxSizing:'border-box' as const }} value={form.has_dog ? 'Yes' : 'No'} onChange={e => setForm({...form, has_dog: e.target.value==='Yes'})}>
                    <option>No</option><option>Yes</option>
                  </select>
                </div>
              </div>
              <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
                <button onClick={() => setShowAddProperty(false)} style={{ padding:'10px 20px',border:'1px solid #1e293b',borderRadius:9,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
                <button onClick={() => { handleSaveEdit(); setShowAddProperty(false) }} style={{ padding:'10px 20px',border:'none',borderRadius:9,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Save Property</button>
              </div>
            </div>
          </>
        )}

        {/* ── ADD CONTACT MODAL ── */}
        {showAddContact && (
          <>
            <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:500 }} onClick={() => setShowAddContact(false)} />
            <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:440,background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:501,padding:24 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
                <h2 style={{ margin:0,fontSize:17,fontWeight:700,color:'#f1f5f9' }}>Add Contact</h2>
                <button onClick={() => setShowAddContact(false)} style={{ background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer' }}>×</button>
              </div>
              <p style={{ margin:'0 0 16px',fontSize:13,color:'#64748b' }}>Add contacts to keep track of everyone you communicate with for this client.</p>
              <div style={{ display:'flex',flexDirection:'column',gap:12,marginBottom:20 }}>
                {[
                  { label:'Full Name *', key:'name' as const, placeholder:'John Smith' },
                  { label:'Phone', key:'phone' as const, placeholder:'(561) 000-0000' },
                  { label:'Email', key:'email' as const, placeholder:'email@example.com' },
                  { label:'Role / Title', key:'role' as const, placeholder:'Property Manager, Spouse, etc.' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase' as const,letterSpacing:'0.05em',marginBottom:4,display:'block' }}>{f.label}</label>
                    <input style={{ width:'100%',padding:'9px 11px',border:'1px solid #1e293b',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#0f172a',color:'#f1f5f9',boxSizing:'border-box' as const }}
                      placeholder={f.placeholder} value={contactForm[f.key]} onChange={e => setContactForm({...contactForm, [f.key]: e.target.value})} />
                  </div>
                ))}
              </div>
              <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
                <button onClick={() => { setShowAddContact(false); setContactForm({ name:'', phone:'', email:'', role:'' }) }}
                  style={{ padding:'10px 20px',border:'1px solid #1e293b',borderRadius:9,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
                <button onClick={() => {
                  if (contactForm.name) {
                    alert(`Contact "${contactForm.name}" added successfully!`)
                    setShowAddContact(false)
                    setContactForm({ name:'', phone:'', email:'', role:'' })
                  }
                }} style={{ padding:'10px 20px',border:'none',borderRadius:9,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Add Contact</button>
              </div>
            </div>
          </>
        )}

        {/* ── COLLECT PAYMENT MODAL ── */}
        {showPaymentModal && (
          <>
            <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:500 }} onClick={() => setShowPaymentModal(false)} />
            <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:420,background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:501,padding:24 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
                <h2 style={{ margin:0,fontSize:17,fontWeight:700,color:'#f1f5f9' }}>Collect Payment</h2>
                <button onClick={() => setShowPaymentModal(false)} style={{ background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer' }}>×</button>
              </div>
              <label style={lbl}>Amount</label>
              <input style={{ ...inp, marginBottom: 12 }} type="number" placeholder="$0.00" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} />
              <label style={lbl}>Payment Method</label>
              <select style={{ ...inp, marginBottom: 12 }} value={paymentForm.method} onChange={e => setPaymentForm({...paymentForm, method: e.target.value})}>
                <option>Square</option><option>Cash</option><option>Check</option><option>Zelle</option><option>Other</option>
              </select>
              <label style={lbl}>Note (optional)</label>
              <input style={{ ...inp, marginBottom: 20 }} placeholder="Payment note..." value={paymentForm.note} onChange={e => setPaymentForm({...paymentForm, note: e.target.value})} />
              <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
                <button onClick={() => setShowPaymentModal(false)} style={{ padding:'10px 20px',border:'1px solid #1e293b',borderRadius:9,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
                <button onClick={() => { alert(`Payment of $${paymentForm.amount} recorded via ${paymentForm.method}`); setShowPaymentModal(false) }} style={{ padding:'10px 20px',border:'none',borderRadius:9,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Record Payment</button>
              </div>
            </div>
          </>
        )}

        {/* ── ADD SCHEDULE ITEM MODAL ── */}
        {showAddSchedule && (
          <>
            <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:500 }} onClick={() => setShowAddSchedule(false)} />
            <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:480,background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:501,padding:24 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
                <h2 style={{ margin:0,fontSize:17,fontWeight:700,color:'#f1f5f9' }}>Add Schedule Item</h2>
                <button onClick={() => setShowAddSchedule(false)} style={{ background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer' }}>×</button>
              </div>
              <label style={lbl}>Type</label>
              <select style={{ ...inp, marginBottom: 12 }} value={schedForm.type} onChange={e => setSchedForm({...schedForm, type: e.target.value})}>
                {['Assessment','Task','Events','Visits','Invoice Reminder','Quote Reminder'].map(t=><option key={t}>{t}</option>)}
              </select>
              <label style={lbl}>Title *</label>
              <input style={{ ...inp, marginBottom: 12 }} placeholder="e.g. Follow-up call" value={schedForm.title} onChange={e => setSchedForm({...schedForm, title: e.target.value})} />
              <label style={lbl}>Description</label>
              <textarea style={{ ...inp, height: 60, resize: 'vertical', marginBottom: 12 } as React.CSSProperties} placeholder="Notes about this item..." value={schedForm.description} onChange={e => setSchedForm({...schedForm, description: e.target.value})} />
              <label style={lbl}>Date & Time *</label>
              <input type="datetime-local" style={{ ...inp, marginBottom: 12 }} value={schedForm.scheduled_at} onChange={e => setSchedForm({...schedForm, scheduled_at: e.target.value})} />
              <label style={lbl}>Assign To</label>
              <input style={{ ...inp, marginBottom: 20 }} placeholder="Employee name..." value={schedForm.assigned_name} onChange={e => setSchedForm({...schedForm, assigned_name: e.target.value})} />
              <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
                <button onClick={() => setShowAddSchedule(false)} style={{ padding:'10px 20px',border:'1px solid #1e293b',borderRadius:9,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
                <button onClick={handleAddScheduleItem} style={{ padding:'10px 20px',border:'none',borderRadius:9,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Save</button>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── CLIENT LIST VIEW ──
  return (
    <div style={{ padding: '2rem', background: '#0a0f1a', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', margin: '0 0 2px' }}>Clients</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{clients.length} total clients</p>
        </div>
        <button onClick={openNewClient} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ New Client</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: '1.5rem' }}>
        {[
          { label: 'New leads', sub: 'Past 30 days', val: newLeads },
          { label: 'New clients', sub: 'Past 30 days', val: newClients },
          { label: 'Total active clients', sub: 'Year to date', val: activeCount },
          { label: 'Total leads', sub: 'All time', val: leadCount },
        ].map((s, i) => (
          <div key={i} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1rem 1.25rem' }}>
            <p style={{ margin: '0 0 2px', fontSize: 12, color: '#64748b', fontWeight: 600 }}>{s.label}</p>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: '#475569' }}>{s.sub}</p>
            <span style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9' }}>{s.val}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <input placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inp, paddingLeft: 32, height: 38 }} />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: 14 }}>🔍</span>
        </div>
        {['Leads and Active', 'Active', 'Lead', 'Inactive', 'All'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            background: statusFilter === s ? 'rgba(74,222,128,0.15)' : '#0f172a',
            color: statusFilter === s ? '#4ade80' : '#64748b',
            border: statusFilter === s ? '1px solid rgba(74,222,128,0.3)' : '1px solid #1e293b',
          }}>{s}</button>
        ))}
        <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>{filtered.length} results</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>Loading...</div>
      ) : (
        <div style={{ background: '#0f172a', borderRadius: 14, border: '1px solid #1e293b', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', background: '#0d1526' }}>
                {['Name', 'Address', 'Division', 'Tags', 'Status', 'Last Activity', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#475569', fontSize: 13 }}>No clients found</td></tr>
              ) : filtered.map(c => {
                const scc = sc(c.status)
                const addr = [c.address, c.city, c.state].filter(Boolean).join(', ')
                const tagList = c.tags ? c.tags.split(',').map(t => t.trim()).filter(Boolean) : []
                const div = DIVISIONS.find(d => d.label === c.divisions)
                return (
                  <tr key={c.id} onClick={() => openClient(c)}
                    style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#f1f5f9' }}>{c.first_name} {c.last_name}</div>
                      {c.company && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{c.company}</div>}
                      {c.phone && <div style={{ fontSize: 11, color: '#64748b' }}>{c.phone}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b', maxWidth: 220 }}>{addr || '—'}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>{div ? `${div.icon} ${div.label}` : c.divisions || '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {tagList.length === 0 ? <span style={{ color: '#475569', fontSize: 12 }}>—</span>
                          : tagList.slice(0, 3).map((t, i) => (
                            <span key={i} style={{ background: 'rgba(100,116,139,0.15)', color: '#94a3b8', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600 }}>{t}</span>
                          ))}
                        {tagList.length > 3 && <span style={{ color: '#475569', fontSize: 10 }}>+{tagList.length - 3}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: scc.bg, color: scc.color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>{c.status}</span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>{fmtTime(c.updated_at || c.created_at)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <button onClick={e => { e.stopPropagation(); handleArchive(c.id) }} style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Archive</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New Client Modal */}
      {showNewClient && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500 }} onClick={() => setShowNewClient(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 560, maxHeight: '90vh', overflowY: 'auto', background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 501, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>New Client</h2>
              <button onClick={() => setShowNewClient(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>Primary Contact</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div><label style={lbl}>First Name *</label><input style={inp} value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} placeholder="First name" /></div>
              <div><label style={lbl}>Last Name *</label><input style={inp} value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} placeholder="Last name" /></div>
              <div><label style={lbl}>Company</label><input style={inp} value={form.company} onChange={e => setForm({...form, company: e.target.value})} placeholder="Company name" /></div>
              <div><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="(561) 000-0000" /></div>
              <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Email</label><input style={inp} value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="email@example.com" /></div>
              <div><label style={lbl}>Lead Source</label><input style={inp} value={form.lead_source} onChange={e => setForm({...form, lead_source: e.target.value})} placeholder="Referral, Google..." /></div>
            </div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>Property Address</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Street Address</label><input style={inp} value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="123 Main St" /></div>
              <div><label style={lbl}>City</label><input style={inp} value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="Port St. Lucie" /></div>
              <div><label style={lbl}>ZIP</label><input style={inp} value={form.zip} onChange={e => setForm({...form, zip: e.target.value})} placeholder="34986" /></div>
            </div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>Details</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div><label style={lbl}>Division</label><select style={inp} value={form.divisions} onChange={e => setForm({...form, divisions: e.target.value})}>{DIVISIONS.map(d=><option key={d.label}>{d.icon} {d.label}</option>)}</select></div>
              <div><label style={lbl}>Status</label><select style={inp} value={form.status} onChange={e => setForm({...form, status: e.target.value})}>{['lead','active','inactive','overdue'].map(s=><option key={s}>{s}</option>)}</select></div>
              <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Tags (comma separated)</label><input style={inp} value={form.tags} onChange={e => setForm({...form, tags: e.target.value})} placeholder="HOA, Monthly bill, PGA POA" /></div>
            </div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>Property Details</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <div><label style={lbl}>Lawn Size</label><select style={inp} value={form.lawn_size} onChange={e => setForm({...form, lawn_size: e.target.value})}>{['Small','Medium','Large','Extra Large'].map(s=><option key={s}>{s}</option>)}</select></div>
              <div><label style={lbl}>Irrigation</label><select style={inp} value={form.irrigation} onChange={e => setForm({...form, irrigation: e.target.value})}><option>No</option><option>Yes</option></select></div>
              <div><label style={lbl}>Pest Control</label><select style={inp} value={form.pest_control} onChange={e => setForm({...form, pest_control: e.target.value})}><option>No</option><option>Yes</option></select></div>
              <div style={{ display:'flex', gap:16, alignItems:'center', paddingTop:20 }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#94a3b8', cursor:'pointer' }}>
                  <input type="checkbox" checked={form.has_dog} onChange={e => setForm({...form, has_dog: e.target.checked})} /> Dog
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#94a3b8', cursor:'pointer' }}>
                  <input type="checkbox" checked={form.locked_gate} onChange={e => setForm({...form, locked_gate: e.target.checked})} /> Locked Gate
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewClient(false)} style={{ padding:'10px 20px',border:'1px solid #1e293b',borderRadius:9,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
              <button onClick={handleSaveNew} style={{ padding:'10px 20px',border:'none',borderRadius:9,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Save Client</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
