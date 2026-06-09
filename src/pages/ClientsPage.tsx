import { useEffect, useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
  { label: 'Hardscape', icon: '🪨' },
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
  const location = useLocation()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Leads and Active')
  const [tagFilter, setTagFilter] = useState('')
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

  const [clientToast, setClientToast] = useState('')
  const showClientToast = (msg: string) => { setClientToast(msg); setTimeout(() => setClientToast(''), 3000) }

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
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailForm, setEmailForm] = useState({ subject: '', body: '', to: '' })
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

  // Auto-open a specific client when navigated from dashboard
  useEffect(() => {
    const clientId = (location.state as any)?.openClient
    if (clientId && clients.length > 0) {
      const c = clients.find(x => x.id === clientId)
      if (c) setSelectedClient(c)
    }
  }, [location.state, clients])

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
    const matchTag = !tagFilter || (c.tags||'').split(',').map((t:string)=>t.trim()).includes(tagFilter)
    const matchStatus = statusFilter === 'All' ? true
      : statusFilter === 'Leads and Active' ? (c.status?.toLowerCase() === 'lead' || c.status?.toLowerCase() === 'active')
      : c.status?.toLowerCase() === statusFilter.toLowerCase()
    return matchSearch && matchStatus && matchTag
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
      <div style={{ padding: '2rem', background: '#0a0f1a', minHeight: '100vh', position: 'relative' }} onClick={(e) => {
        const t = e.target as HTMLElement
        if (t.closest('button') || t.closest('a') || t.closest('input') || t.closest('select') || t.closest('textarea') || t.closest('label')) return
        if (showEmailModal) return
        setShowDotsMenu(false); setShowCreateMenu(false); setShowWorkCreate(false)
        setShowBillingMenu(false); setShowSchedTypeMenu(false); setShowSchedStatusMenu(false)
      }}>
        {/* Toast */}
        {clientToast && (
          <div style={{ position:'fixed',top:'1rem',right:'1rem',background:'#052e16',border:'1px solid #16a34a',borderRadius:10,padding:'12px 20px',fontSize:13,color:'#4ade80',fontWeight:600,zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,0.4)',maxWidth:380,pointerEvents:'none' }}>
            {clientToast}
          </div>
        )}
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
            {/* Email button - opens template picker */}
            <button onClick={(e) => {
              e.stopPropagation()
              if (!selectedClient.email) { showClientToast('⚠️ No email on file for this client'); return }
              setEmailForm({ to: selectedClient.email, subject: '', body: '' })
              setShowEmailModal(true)
            }}
              style={{ padding: '8px 16px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, color: '#f1f5f9', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>✉️</span>
              <span style={{ fontWeight: 600 }}>Email</span>
            </button>
            {/* SMS button */}
            <button onClick={async (e) => {
              e.stopPropagation()
              if (!selectedClient.phone) { showClientToast('⚠️ No phone number on file for this client'); return }
              const firstName = selectedClient.first_name || selectedClient.first_name + ' ' + selectedClient.last_name
              const msg = `Hi ${firstName}, this is PHL Land Care reaching out. How can we help you today? Reply to this message or call us at 772-466-3617.`
              try {
                await supabase.functions.invoke('send-sms', { body: { to: selectedClient.phone, message: msg } })
                showClientToast(`✅ SMS sent to ${selectedClient.phone}`)
              } catch {
                // Fallback: open sms: link
                window.open(`sms:${selectedClient.phone}&body=${encodeURIComponent(msg)}`)
              }
            }}
              style={{ padding: '8px 16px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, color: '#f1f5f9', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, opacity: selectedClient.phone ? 1 : 0.4 }}>
              <span style={{ fontSize: 20 }}>💬</span>
              <span style={{ fontWeight: 600 }}>SMS</span>
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
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* ── LEFT COLUMN — main content ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 0 }}>

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
                      <button onClick={() => { if(addr) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, '_blank') }}
                        style={{ background:'none',border:'none',color:'#4ade80',cursor:'pointer',fontSize:16 }} title="Open in Google Maps">📍</button>
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
                    style={{ padding: '6px 14px', borderRadius: 99, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: workFilter === f ? 700 : 500,
                      background: workFilter === f ? 'rgba(74,222,128,0.15)' : 'transparent',
                      border: workFilter === f ? '1px solid rgba(74,222,128,0.3)' : '1px solid transparent',
                      color: workFilter === f ? '#4ade80' : '#94a3b8',
                      display: 'flex', alignItems: 'center', gap: 6 }}>
                    {f !== 'All' && <span style={{ fontSize: 22 }}>{{ Requests:'📬', Quotes:'📋', Jobs:'🔧', Invoices:'💰' }[f]}</span>}
                    {f}
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
                            <span style={{ color: workTypeColor[w.type], fontSize: 20 }}>{workTypeIcon[w.type]}</span>
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
              <TagsEditor
                tags={(selectedClient.tags || '').split(',').map(t => t.trim()).filter(Boolean)}
                onSave={async (newTags) => {
                  const tagStr = newTags.join(', ')
                  await supabase.from('clients').update({ tags: tagStr }).eq('id', selectedClient.id)
                  setSelectedClient({ ...selectedClient, tags: tagStr })
                  showClientToast('✅ Tags updated!')
                }}
              />
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

            </div>{/* end left column */}

            {/* ── RIGHT SIDEBAR (Jobber-style) ── */}
            <ClientSidebar client={selectedClient} workItems={workItems} fmt={fmt} fmtDate={fmtDate}
              onTagsSaved={(newTags) => setSelectedClient({ ...selectedClient, tags: newTags })}
              onNoteSaved={(updatedNotes) => setSelectedClient({ ...selectedClient, notes: updatedNotes })} />

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
                <button onClick={async () => {
                  if (contactForm.name) {
                    // Save contact to client notes
                    const contactEntry = `CONTACT: ${contactForm.name}${contactForm.role ? ` (${contactForm.role})` : ''} | ${contactForm.phone || ''} | ${contactForm.email || ''}`
                    const existing = selectedClient.notes || ''
                    const updated = existing ? existing + '\n\n' + contactEntry : contactEntry
                    await supabase.from('clients').update({ notes: updated }).eq('id', selectedClient.id)
                    setSelectedClient({ ...selectedClient, notes: updated })
                    showClientToast(`✅ Contact "${contactForm.name}" added!`)
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
                <button onClick={async () => { const note = `PAYMENT: $${paymentForm.amount} via ${paymentForm.method}${paymentForm.note ? ' — ' + paymentForm.note : ''} on ${new Date().toLocaleDateString()}`; const existing = selectedClient?.notes || ''; const updated = existing ? existing + '\n\n' + note : note; if(selectedClient) { await supabase.from('clients').update({ notes: updated }).eq('id', selectedClient.id); setSelectedClient({ ...selectedClient, notes: updated }); } showClientToast(`✅ Payment of $${paymentForm.amount} recorded!`); setShowPaymentModal(false) }} style={{ padding:'10px 20px',border:'none',borderRadius:9,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Record Payment</button>
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
          { label: 'New leads',           sub: 'Past 30 days',  val: newLeads,    color: '#fbbf24' },
          { label: 'New clients',         sub: 'Past 30 days',  val: newClients,  color: '#4ade80' },
          { label: 'Total active clients',sub: 'Year to date',  val: activeCount, color: '#60a5fa' },
          { label: 'Total leads',         sub: 'All time',      val: leadCount,   color: '#a855f7' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#0f172a', border: '1px solid #1e293b', borderTop: `3px solid ${s.color}`, borderRadius: 14, padding: '1rem 1.25rem' }}>
            <p style={{ margin: '0 0 2px', fontSize: 11, color: s.color, fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</p>
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
        {/* Filter by tag — Jobber style */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setTagFilter(f => f ? '' : '__open__')} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            background: tagFilter && tagFilter!=='__open__' ? 'rgba(96,165,250,0.15)' : '#0f172a',
            color: tagFilter && tagFilter!=='__open__' ? '#60a5fa' : '#64748b',
            border: tagFilter && tagFilter!=='__open__' ? '1px solid rgba(96,165,250,0.3)' : '1px solid #1e293b',
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            🏷 Filter by tag {tagFilter && tagFilter!=='__open__' ? `· ${tagFilter}` : '+'} 
          </button>
          {tagFilter === '__open__' && (
            <div style={{ position: 'absolute', top: '110%', left: 0, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 8, zIndex: 50, minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: '#475569', padding: '0 4px' }}>SELECT A TAG</p>
              {Array.from(new Set(
                clients.flatMap(c => (c.tags||'').split(',').map((t:string)=>t.trim()).filter(Boolean))
              )).sort().map((tag:string) => (
                <button key={tag} onClick={() => setTagFilter(tag)} style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
                  background: 'transparent', border: 'none', borderRadius: 6, color: '#cbd5e1',
                  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit'
                }} onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  {tag}
                </button>
              ))}
              {clients.flatMap(c=>(c.tags||'').split(',').map((t:string)=>t.trim()).filter(Boolean)).length===0 && (
                <p style={{ fontSize: 12, color: '#475569', padding: '4px 10px' }}>No tags found</p>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 3 }}>
          {['Leads and Active', 'Active', 'Lead', 'Inactive', 'All'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              background: statusFilter === s ? '#1e293b' : 'transparent',
              color: statusFilter === s ? '#f1f5f9' : '#475569',
              border: 'none',
            }}>{s}</button>
          ))}
        </div>
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
                const addr = [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')
                const tagList = c.tags ? c.tags.split(',').map((t:string) => t.trim()).filter(Boolean) : []
                const div = DIVISIONS.find(d => d.label === c.divisions)
                return (
                  <tr key={c.id} onClick={() => openClient(c)}
                    style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget.querySelector('.row-actions') as HTMLElement|null)?.style&&((e.currentTarget.querySelector('.row-actions') as HTMLElement).style.opacity='1') }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; (e.currentTarget.querySelector('.row-actions') as HTMLElement|null)?.style&&((e.currentTarget.querySelector('.row-actions') as HTMLElement).style.opacity='0') }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>{c.first_name} {c.last_name}</div>
                      {c.company && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{c.company}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b', maxWidth: 220 }}>
                      {addr ? (
                        <span onClick={e => { e.stopPropagation(); window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, '_blank') }}
                          style={{ cursor: 'pointer', color: '#60a5fa', textDecoration: 'underline dotted' }} title="Open in Google Maps">
                          {addr}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>{div ? `${div.icon} ${div.label}` : c.divisions || '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {tagList.length === 0 ? <span style={{ color: '#475569', fontSize: 12 }}>—</span>
                          : tagList.slice(0, 3).map((t:string, i:number) => (
                            <span key={i} onClick={e => { e.stopPropagation(); setTagFilter(t) }}
                              style={{ background: 'rgba(100,116,139,0.15)', color: '#94a3b8', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                              onMouseEnter={e=>(e.currentTarget.style.background='rgba(96,165,250,0.15)')}
                              onMouseLeave={e=>(e.currentTarget.style.background='rgba(100,116,139,0.15)')}>{t}</span>
                          ))}
                        {tagList.length > 3 && <span style={{ color: '#475569', fontSize: 10 }}>+{tagList.length - 3}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: scc.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: scc.color, fontWeight: 600, textTransform: 'capitalize' }}>{c.status}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>{fmtTime(c.updated_at || c.created_at)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      {/* Jobber-style hover action icons */}
                      <div className="row-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0, transition: 'opacity 0.15s' }}>
                        <button title="Tag" onClick={e => { e.stopPropagation(); openClient(c) }}
                          style={{ background: 'none', border: '1px solid #1e293b', borderRadius: 6, color: '#64748b', cursor: 'pointer', padding: '4px 8px', fontSize: 13 }}>🏷</button>
                        <button title="Email" onClick={e => { e.stopPropagation(); if(c.email) window.open(`mailto:${c.email}`) }}
                          style={{ background: 'none', border: '1px solid #1e293b', borderRadius: 6, color: '#64748b', cursor: 'pointer', padding: '4px 8px', fontSize: 13 }}>✉️</button>
                        <div style={{ position: 'relative' }}>
                          <button title="More actions" onClick={e => { e.stopPropagation(); setShowDotsMenu(showDotsMenu===c.id?null:c.id as any) }}
                            style={{ background: 'none', border: '1px solid #1e293b', borderRadius: 6, color: '#64748b', cursor: 'pointer', padding: '4px 10px', fontSize: 13 }}>···</button>
                          {showDotsMenu === (c.id as any) && (
                            <div onClick={e=>e.stopPropagation()} style={{ position: 'absolute', right: 0, top: '110%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, zIndex: 100, minWidth: 160, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                              <button onClick={() => { setShowDotsMenu(null); handleArchive(c.id) }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', color: '#cbd5e1', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                                onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>Archive</button>
                              <button onClick={() => { setShowDotsMenu(null); handleArchive(c.id) }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', color: '#f87171', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                                onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>Delete</button>
                              <button onClick={() => { setShowDotsMenu(null); window.open(`${window.location.origin}${window.location.pathname}#/clients?id=${c.id}`, '_blank') }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', color: '#cbd5e1', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                                Open in New Tab <span style={{ fontSize: 11 }}>↗</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── EMAIL TEMPLATE MODAL ── */}
      {showEmailModal && selectedClient && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', inset: 0, zIndex: 699 }}>
        <EmailTemplateModal
          client={selectedClient}
          initialForm={emailForm}
          onClose={() => setShowEmailModal(false)}
          onSent={(subject, body) => {
            const sentAt = new Date().toISOString()
            const commEntry = `COMM|type:email_general|sent_at:${sentAt}|to:${selectedClient.email}|subject:${subject}|body:${body}`
            const updatedNotes = (selectedClient.notes || '') + (selectedClient.notes ? '\n\n' : '') + commEntry
            supabase.from('clients').update({ notes: updatedNotes }).eq('id', selectedClient.id)
            setSelectedClient({ ...selectedClient, notes: updatedNotes })
            showClientToast('✅ Email sent!')
          }}
        />
        </div>
      )}

      {/* New / Edit Client Modal — Jobber layout */}
      {showNewClient && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500 }} onClick={() => setShowNewClient(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 540, maxHeight: '92vh', overflowY: 'auto', background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 501, padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>New Client</h2>
              <button onClick={() => setShowNewClient(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            {/* Primary contact details */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Primary contact details</h3>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>Provide the main point of contact to ensure smooth communication and reliable client records</p>
              <div style={{ border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', borderBottom: '1px solid #1e293b' }}>
                  <div style={{ borderRight: '1px solid #1e293b' }}>
                    <select style={{ ...inp, border: 'none', borderRadius: 0, background: 'transparent', height: 44 }} value={form.title||'No title'} onChange={e => setForm({...form, title: e.target.value})}>
                      {['No title','Mr.','Mrs.','Ms.','Dr.','Prof.'].map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ borderRight: '1px solid #1e293b' }}>
                    <input style={{ ...inp, border: 'none', borderRadius: 0, background: 'transparent', height: 44 }} value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} placeholder="First name" />
                  </div>
                  <div>
                    <input style={{ ...inp, border: 'none', borderRadius: 0, background: 'transparent', height: 44 }} value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} placeholder="Last name" />
                  </div>
                </div>
                <div style={{ borderBottom: '1px solid #1e293b' }}>
                  <input style={{ ...inp, border: 'none', borderRadius: 0, background: 'transparent' }} value={form.company} onChange={e => setForm({...form, company: e.target.value})} placeholder="Company name" />
                </div>
                <div>
                  <input style={{ ...inp, border: 'none', borderRadius: 0, background: 'transparent' }} value={form.role||''} onChange={e => setForm({...form, role: e.target.value})} placeholder="Role" />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#94a3b8', cursor: 'pointer', marginBottom: 16 }}>
                <input type="checkbox" checked={form.billing_contact||false} onChange={e => setForm({...form, billing_contact: e.target.checked})} /> Set as billing contact
              </label>

              {/* Communication */}
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Communication</p>
              <div style={{ border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #1e293b' }}>
                  <input style={{ ...inp, border: 'none', borderRadius: 0, background: 'transparent', flex: 1 }} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="Phone number" />
                  <div style={{ borderLeft: '1px solid #1e293b', padding: '10px 14px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>Main ▾</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <input style={{ ...inp, border: 'none', borderRadius: 0, background: 'transparent', flex: 1 }} type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="Email" />
                  <div style={{ borderLeft: '1px solid #1e293b', padding: '10px 14px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>Main ▾</div>
                </div>
              </div>
            </div>

            {/* Property Address */}
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Property Address</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Street Address</label><input style={inp} value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="123 Main St" /></div>
                <div><label style={lbl}>City</label><input style={inp} value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="Port St. Lucie" /></div>
                <div><label style={lbl}>State / ZIP</label><div style={{ display: 'flex', gap: 6 }}><input style={{ ...inp, width: 60 }} value={form.state||''} onChange={e => setForm({...form, state: e.target.value})} placeholder="FL" maxLength={2} /><input style={{ ...inp, flex: 1 }} value={form.zip} onChange={e => setForm({...form, zip: e.target.value})} placeholder="34986" /></div></div>
              </div>
            </div>

            {/* Payment terms */}
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Payment terms</h3>
              <select style={inp} value={form.payment_terms||'Net 7'} onChange={e => setForm({...form, payment_terms: e.target.value})}>
                {['Upon receipt','Net 7','Net 15','Net 30','Net 45','Net 60','Residential default (Net 7)','Commercial default (Net 30)'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>

            {/* Lead information */}
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Lead information</h3>
              <input style={inp} value={form.lead_source} onChange={e => setForm({...form, lead_source: e.target.value})} placeholder="Lead source (Referral, Google, etc.)" />
            </div>

            {/* Additional client details */}
            <details style={{ marginBottom: 20 }}>
              <summary style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', cursor: 'pointer', padding: '10px 0', borderTop: '1px solid #1e293b', userSelect: 'none' }}>Additional client details ▾</summary>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 12 }}>
                <div><label style={lbl}>Division</label><select style={inp} value={form.divisions} onChange={e => setForm({...form, divisions: e.target.value})}>{DIVISIONS.map(d=><option key={d.label}>{d.label}</option>)}</select></div>
                <div><label style={lbl}>Status</label><select style={inp} value={form.status} onChange={e => setForm({...form, status: e.target.value})}>{['lead','active','inactive'].map(s=><option key={s}>{s}</option>)}</select></div>
                <div style={{ gridColumn:'1/-1' }}><label style={lbl}>Tags (comma separated)</label><input style={inp} value={form.tags} onChange={e => setForm({...form, tags: e.target.value})} placeholder="HOA, Monthly bill, PGA POA" /></div>
                <div><label style={lbl}>Lawn Size</label><select style={inp} value={form.lawn_size} onChange={e => setForm({...form, lawn_size: e.target.value})}>{['Small','Medium','Large','Extra Large'].map(s=><option key={s}>{s}</option>)}</select></div>
                <div style={{ display:'flex', gap:16, alignItems:'center', paddingTop:20 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#94a3b8', cursor:'pointer' }}>
                    <input type="checkbox" checked={form.has_dog} onChange={e => setForm({...form, has_dog: e.target.checked})} /> Dog
                  </label>
                  <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#94a3b8', cursor:'pointer' }}>
                    <input type="checkbox" checked={form.locked_gate} onChange={e => setForm({...form, locked_gate: e.target.checked})} /> Locked Gate
                  </label>
                </div>
              </div>
            </details>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewClient(false)} style={{ padding:'10px 24px',border:'1px solid #1e293b',borderRadius:9,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
              <button onClick={handleSaveNew} style={{ padding:'10px 28px',border:'none',borderRadius:9,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Save Client</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Email Templates ───────────────────────────────────────────────────────────
const EMAIL_TEMPLATES = [
  {
    label: 'Following Up',
    subject: 'Following Up — PHL Land Care',
    body: (name: string) => `Hi ${name},\n\nI wanted to follow up and see if you had any questions or if there's anything we can help you with.\n\nPlease don't hesitate to reach out — we're always happy to help!\n\nBest regards,\nPHL Land Care Team\n📞 772-466-3617`,
  },
  {
    label: 'Appointment Reminder',
    subject: 'Upcoming Service Reminder — PHL Land Care',
    body: (name: string) => `Hi ${name},\n\nThis is a friendly reminder that your scheduled service is coming up soon.\n\nIf you need to reschedule or have any special instructions for our crew, please let us know as soon as possible.\n\nThank you for choosing PHL Land Care!\n\nBest regards,\nPHL Land Care Team\n📞 772-466-3617`,
  },
  {
    label: 'Thank You',
    subject: 'Thank You — PHL Land Care',
    body: (name: string) => `Hi ${name},\n\nThank you so much for choosing PHL Land Care! It was a pleasure working with you.\n\nWe hope you're happy with the results. If you have any feedback or questions, please don't hesitate to reach out.\n\nWe look forward to serving you again!\n\nBest regards,\nPHL Land Care Team\n📞 772-466-3617`,
  },
  {
    label: 'Quote Ready',
    subject: 'Your Quote is Ready — PHL Land Care',
    body: (name: string) => `Hi ${name},\n\nYour quote is ready for review! Please let us know if you have any questions or if you'd like to make any adjustments.\n\nWe look forward to the opportunity to work with you.\n\nBest regards,\nPHL Land Care Team\n📞 772-466-3617`,
  },
  {
    label: 'Payment Reminder',
    subject: 'Invoice Payment Reminder — PHL Land Care',
    body: (name: string) => `Hi ${name},\n\nThis is a friendly reminder that you have an outstanding invoice with PHL Land Care.\n\nPlease contact us if you have any questions about your balance or if you'd like to discuss payment options.\n\nThank you,\nPHL Land Care Team\n📞 772-466-3617`,
  },
  {
    label: 'Seasonal Promotion',
    subject: 'Special Offer — PHL Land Care',
    body: (name: string) => `Hi ${name},\n\nWe wanted to reach out with some exciting news about our seasonal services!\n\nWe're currently offering special rates on [SERVICE]. As a valued client, we wanted to make sure you heard about this first.\n\nGive us a call or reply to this email to take advantage of this offer.\n\nBest regards,\nPHL Land Care Team\n📞 772-466-3617`,
  },
]

function EmailTemplateModal({ client, initialForm, onClose, onSent }: {
  client: any
  initialForm: { to: string; subject: string; body: string }
  onClose: () => void
  onSent: (subject: string, body: string) => void
}) {
  const firstName = client.first_name || client.first_name + ' ' + client.last_name
  const [subject, setSubject] = useState(initialForm.subject)
  const [body, setBody] = useState(initialForm.body)
  const [sending, setSending] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const applyTemplate = (t: typeof EMAIL_TEMPLATES[0]) => {
    setSubject(t.subject)
    setBody(t.body(firstName))
    setActiveTemplate(t.label)
  }

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return
    setSending(true)
    try {
      const html = `<div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;color:#111">
        <div style="border-bottom:3px solid #16a34a;padding-bottom:12px;margin-bottom:20px">
          <strong style="font-size:18px;color:#16a34a">PHL Land Care Inc.</strong>
        </div>
        ${body.split('\n').map(line => line ? `<p style="margin:0 0 12px">${line}</p>` : '<br>').join('')}
        <div style="border-top:1px solid #e2e8f0;margin-top:24px;padding-top:16px;font-size:12px;color:#64748b">
          PHL Land Care Inc. · 772-466-3617 · admin@phllandcare.com
        </div>
      </div>`
      await supabase.functions.invoke('send-email', {
        body: { to: client.email, subject, html }
      })
      onSent(subject, body)
      onClose()
    } catch {
      // Fallback to mailto if edge function not configured
      const mailto = `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      window.open(mailto)
      onSent(subject, body)
      onClose()
    }
    setSending(false)
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 700 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 680, maxHeight: '90vh', display: 'flex', background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 701, overflow: 'hidden' }}>

        {/* Left — templates */}
        <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid #1e293b', padding: '16px 0', overflowY: 'auto' }}>
          <p style={{ margin: '0 0 8px', padding: '0 16px', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Templates</p>
          {EMAIL_TEMPLATES.map(t => (
            <button key={t.label} onClick={() => applyTemplate(t)}
              style={{ display: 'block', width: '100%', padding: '10px 16px', background: activeTemplate === t.label ? 'rgba(74,222,128,0.1)' : 'none', border: 'none', borderLeft: activeTemplate === t.label ? '3px solid #4ade80' : '3px solid transparent', color: activeTemplate === t.label ? '#4ade80' : '#94a3b8', fontSize: 13, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
              onMouseEnter={e => { if (activeTemplate !== t.label) (e.currentTarget as HTMLElement).style.background = '#1e293b' }}
              onMouseLeave={e => { if (activeTemplate !== t.label) (e.currentTarget as HTMLElement).style.background = 'none' }}>
              {t.label}
            </button>
          ))}
          <div style={{ margin: '12px 16px 0', padding: '12px', background: '#1e293b', borderRadius: 8 }}>
            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Spell Check</p>
            <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>Browser spell check is active — misspelled words are underlined in red</p>
          </div>
        </div>

        {/* Right — compose */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>New Email</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>

          {/* Fields */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: '#64748b', minWidth: 50 }}>To:</span>
              <span style={{ fontSize: 13, color: '#f1f5f9', background: '#1e293b', padding: '4px 10px', borderRadius: 6 }}>{client.first_name} {client.last_name} &lt;{client.email}&gt;</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#64748b', minWidth: 50 }}>Subject:</span>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                spellCheck
                placeholder="Email subject..."
                style={{ flex: 1, background: 'none', border: 'none', borderBottom: '1px solid #334155', outline: 'none', color: '#f1f5f9', fontSize: 13, padding: '4px 0', fontFamily: 'inherit' }} />
            </div>
          </div>

          {/* Body */}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            spellCheck
            lang="en"
            placeholder="Write your message here..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#cbd5e1', fontSize: 13, lineHeight: 1.7, padding: '16px 20px', resize: 'none', fontFamily: 'inherit' }}
          />

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: 11, color: '#475569' }}>From: PHL Land Care Inc. &lt;admin@phllandcare.com&gt;</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid #334155', borderRadius: 8, color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()}
                style={{ padding: '8px 20px', background: '#16a34a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: sending ? 0.7 : 1 }}>
                {sending ? 'Sending...' : '✉️ Send Email'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── TagsEditor component ─────────────────────────────────────────────────────
const TAG_COLORS = [
  '#4ade80','#60a5fa','#f59e0b','#a78bfa','#f87171','#34d399','#fb923c','#e879f9'
]

function TagsEditor({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => void }) {
  const [editing, setEditing] = useState(false)
  const [localTags, setLocalTags] = useState<string[]>(tags)
  const [newTag, setNewTag] = useState('')

  useEffect(() => { setLocalTags(tags) }, [tags])

  const addTag = () => {
    const t = newTag.trim()
    if (!t || localTags.includes(t)) return
    const updated = [...localTags, t]
    setLocalTags(updated)
    setNewTag('')
  }

  const removeTag = (i: number) => {
    setLocalTags(localTags.filter((_, idx) => idx !== i))
  }

  const tagColor = (t: string) => TAG_COLORS[t.charCodeAt(0) % TAG_COLORS.length]

  if (!editing) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {localTags.length === 0
          ? <span style={{ color: '#475569', fontSize: 13 }}>No tags — </span>
          : localTags.map((t, i) => (
            <span key={i} style={{ background: `rgba(${hexRgb(tagColor(t))},0.15)`, color: tagColor(t), border: `1px solid rgba(${hexRgb(tagColor(t))},0.3)`, padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>{t}</span>
          ))}
        <button onClick={() => setEditing(true)}
          style={{ padding: '4px 12px', background: 'none', border: '1px dashed #334155', borderRadius: 99, fontSize: 12, color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
          {localTags.length === 0 ? 'Add tag' : '+ Edit'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {localTags.map((t, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, background: `rgba(${hexRgb(tagColor(t))},0.15)`, color: tagColor(t), border: `1px solid rgba(${hexRgb(tagColor(t))},0.3)`, padding: '4px 6px 4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
            {t}
            <button onClick={() => removeTag(i)} style={{ background: 'none', border: 'none', color: tagColor(t), cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addTag() }}
          placeholder="New tag..."
          style={{ flex: 1, padding: '7px 10px', border: '1px solid #334155', borderRadius: 8, fontSize: 12, background: '#0f172a', color: '#f1f5f9', outline: 'none', fontFamily: 'inherit' }}
        />
        <button onClick={addTag} style={{ padding: '7px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#4ade80', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>+</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button onClick={() => setEditing(false)} style={{ padding: '6px 14px', background: 'none', border: '1px solid #334155', borderRadius: 8, color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        <button onClick={() => { onSave(localTags); setEditing(false) }} style={{ padding: '6px 14px', background: '#16a34a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Save Tags</button>
      </div>
      {/* Common tag suggestions */}
      <div style={{ marginTop: 10 }}>
        <p style={{ fontSize: 10, color: '#475569', margin: '0 0 6px', fontWeight: 600, textTransform: 'uppercase' }}>Suggestions</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {['HOA','Monthly','Weekly','Bi-weekly','VIP','Residential','Commercial','PGA POA','Seasonal','Irrigation Contract','Pest Contract'].filter(s => !localTags.includes(s)).map(s => (
            <button key={s} onClick={() => setLocalTags(prev => prev.includes(s) ? prev : [...prev, s])}
              style={{ padding: '3px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: 99, fontSize: 11, color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>
              + {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function hexRgb(hex: string): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return `${r},${g},${b}`
}

// ── ClientSidebar (Jobber-style right panel) ─────────────────────────────────
function ClientSidebar({ client, workItems, fmt, fmtDate, onTagsSaved, onNoteSaved }: {
  client: any; workItems: any[]; fmt: (n:number)=>string; fmtDate: (d:string)=>string
  onTagsSaved?: (newTags: string) => void
  onNoteSaved?: (updatedNotes: string) => void
}) {
  const [showCommModal, setShowCommModal] = useState(false)
  const [selectedComm, setSelectedComm] = useState<any>(null)
  const [editingTags, setEditingTags] = useState(false)
  const [localTags, setLocalTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')
  const [tagSaving, setTagSaving] = useState(false)

  // Derive lifetime value from invoices paid
  const lifetimeValue = workItems.filter(w => w.type === 'invoice' && w.status === 'paid').reduce((a: number, w: any) => a + (w.amount || 0), 0)
  const currentBalance = workItems.filter(w => w.type === 'invoice' && w.status !== 'paid' && w.status !== 'draft').reduce((a: number, w: any) => a + (w.amount || 0), 0)

  // Parse notes — find COMM entries and plain notes
  const noteLines = (client.notes || '').split('\n\n').filter(Boolean)
  // Find last COMM entry (most recent communication)
  const commEntries = noteLines.filter(n => n.startsWith('COMM|'))
  const lastComm = commEntries.length > 0 ? commEntries[commEntries.length - 1] : null

  // Parse a COMM entry into structured fields
  const parseComm = (raw: string) => {
    const fields: Record<string, string> = {}
    raw.replace(/^COMM\|/, '').split('|').forEach(pair => {
      const idx = pair.indexOf(':')
      if (idx > 0) fields[pair.slice(0, idx)] = pair.slice(idx + 1)
    })
    return fields
  }

  const lastCommParsed = lastComm ? parseComm(lastComm) : null

  const TAG_COLORS = ['#4ade80','#60a5fa','#f59e0b','#a78bfa','#f87171','#34d399','#fb923c','#e879f9']
  const tagColor = (t: string) => TAG_COLORS[(t.charCodeAt(0) + t.length) % TAG_COLORS.length]
  const tagList = (client.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean)

  const startEditTags = () => { setLocalTags(tagList); setEditingTags(true) }
  const addTag = () => {
    const t = newTagInput.trim()
    if (t && !localTags.includes(t)) setLocalTags(prev => [...prev, t])
    setNewTagInput('')
  }
  const saveTags = async () => {
    setTagSaving(true)
    const tagStr = localTags.join(', ')
    await supabase.from('clients').update({ tags: tagStr }).eq('id', client.id)
    onTagsSaved?.(tagStr)
    setTagSaving(false)
    setEditingTags(false)
  }

  const fmtCommDate = (iso: string) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const TAG_SUGGESTIONS = ['HOA','Monthly','Weekly','Bi-weekly','VIP','Residential','Commercial','PGA POA','Seasonal','Irrigation Contract','Pest Contract','Bedford Park','Tradition POA']

  return (
    <>
      <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── OVERVIEW ── */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Overview</h3>
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>{fmt(lifetimeValue)}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Lifetime value</p>
          </div>
          <div style={{ marginBottom: 4 }}>
            <p style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: currentBalance > 0 ? '#f87171' : '#f1f5f9' }}>{fmt(currentBalance)}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Current balance</p>
          </div>
        </div>

        {/* ── TAGS ── */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Tags</h3>
            {!editingTags && (
              <button onClick={startEditTags} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#64748b', fontSize: 16, lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color='#4ade80'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color='#64748b'}>
                ✏️
              </button>
            )}
          </div>

          {!editingTags ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tagList.length === 0
                ? <span style={{ fontSize: 12, color: '#475569' }}>No tags yet</span>
                : tagList.map((t: string, i: number) => (
                  <span key={i} style={{ background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>{t}</span>
                ))
              }
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {localTags.map((t, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: `rgba(${hexRgb(tagColor(t))},0.15)`, color: tagColor(t), border: `1px solid rgba(${hexRgb(tagColor(t))},0.3)`, padding: '3px 6px 3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                    {t}
                    <button onClick={() => setLocalTags(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, opacity: 0.7 }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
                <input value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  placeholder="Add tag..." style={{ flex: 1, padding: '6px 9px', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, fontSize: 12, color: '#f1f5f9', outline: 'none', fontFamily: 'inherit' }} />
                <button onClick={addTag} style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, color: '#4ade80', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' }}>+</button>
              </div>
              {/* Suggestions */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {TAG_SUGGESTIONS.filter(s => !localTags.includes(s)).slice(0, 8).map(s => (
                  <button key={s} onClick={() => { if (!localTags.includes(s)) setLocalTags(p => [...p, s]) }}
                    style={{ padding: '2px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: 99, fontSize: 10, color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
                    + {s}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEditingTags(false)} style={{ flex: 1, padding: '7px', background: 'none', border: '1px solid #334155', borderRadius: 7, color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={saveTags} style={{ flex: 1, padding: '7px', background: '#16a34a', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {tagSaving ? 'Saving...' : 'Save Tags'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── LAST COMMUNICATION ── */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Last communication</h3>
            {commEntries.length > 0 && (
              <button onClick={() => { setSelectedComm(commEntries); setShowCommModal(true) }}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, padding: 4 }}>›</button>
            )}
          </div>

          {!lastCommParsed ? (
            <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>No communications yet</p>
          ) : (
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 11, color: '#475569' }}>
                {fmtCommDate(lastCommParsed.sent_at)}
              </p>
              <p style={{ margin: '0 0 6px', fontSize: 13, color: '#cbd5e1', lineHeight: 1.4 }}>
                {lastCommParsed.subject || 'Email sent'}
              </p>
              <button onClick={() => { setSelectedComm(commEntries); setShowCommModal(true) }}
                style={{ background: 'none', border: 'none', color: '#4ade80', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                Read more...
              </button>
            </div>
          )}
        </div>

        {/* ── NOTES ── */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Notes</h3>
          {/* Existing plain notes */}
          {noteLines.filter(n => !n.startsWith('COMM|') && !n.startsWith('PAYMENT:') && !n.startsWith('CONTACT:')).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {noteLines.filter(n => !n.startsWith('COMM|') && !n.startsWith('PAYMENT:') && !n.startsWith('CONTACT:')).map((note, i) => (
                <div key={i} style={{ background: '#1e293b', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#94a3b8', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{note}</div>
              ))}
            </div>
          )}
          {/* Input area */}
          <SidebarNoteInput
            clientId={client.id}
            currentNotes={client.notes || ''}
            onSaved={(updatedNotes) => onNoteSaved?.(updatedNotes)}
          />
        </div>

      </div>

      {/* ── COMMUNICATION DETAIL MODAL (Jobber-style) ── */}
      {showCommModal && selectedComm && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 600 }} onClick={() => setShowCommModal(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 560, maxHeight: '82vh', overflowY: 'auto', background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 601, padding: 0 }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e293b' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Email Communication</h2>
              <button onClick={() => setShowCommModal(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {/* Show the most recent comm by default, list others */}
            {(() => {
              const entries = (selectedComm as string[]).map(parseComm)
              const latest = entries[entries.length - 1]
              return (
                <div style={{ padding: '20px' }}>
                  {/* Meta row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20, padding: '14px 16px', background: '#1e293b', borderRadius: 10 }}>
                    <div>
                      <p style={{ margin: '0 0 3px', fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>Sent on</p>
                      <p style={{ margin: 0, fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{fmtCommDate(latest.sent_at)}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 3px', fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>Opened on</p>
                      <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>—</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 3px', fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>Type</p>
                      <p style={{ margin: 0, fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>Quote sent</p>
                    </div>
                  </div>

                  {/* Email fields */}
                  {[
                    { label: 'To:', value: latest.to || '—' },
                    { label: 'Cc:', value: '— None —' },
                    { label: 'BCc:', value: '— None —' },
                    { label: 'Subject:', value: latest.subject || '—' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #1e293b' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', minWidth: 60 }}>{row.label}</span>
                      <span style={{ fontSize: 13, color: '#94a3b8' }}>{row.value}</span>
                    </div>
                  ))}

                  {/* Body */}
                  <div style={{ margin: '16px 0', fontSize: 13, color: '#cbd5e1', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {latest.body || '(No message body)'}
                  </div>

                  {/* Attachments */}
                  {latest.quote_num && (
                    <div>
                      <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#64748b' }}>Attachments</p>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px' }}>
                        <span style={{ fontSize: 18 }}>📄</span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>quote_{latest.quote_num}.pdf</span>
                      </div>
                    </div>
                  )}

                  {/* Older entries */}
                  {entries.length > 1 && (
                    <div style={{ marginTop: 20, borderTop: '1px solid #1e293b', paddingTop: 16 }}>
                      <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Earlier communications ({entries.length - 1})</p>
                      {entries.slice(0, -1).reverse().map((e, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#1e293b', borderRadius: 8, marginBottom: 6 }}>
                          <div>
                            <p style={{ margin: '0 0 2px', fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{e.subject}</p>
                            <p style={{ margin: 0, fontSize: 11, color: '#475569' }}>To: {e.to}</p>
                          </div>
                          <p style={{ margin: 0, fontSize: 11, color: '#475569', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtCommDate(e.sent_at)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </>
      )}
    </>
  )
}

// ── SidebarNoteInput ──────────────────────────────────────────────────────────
function SidebarNoteInput({ clientId, currentNotes, onSaved }: {
  clientId: string
  currentNotes: string
  onSaved: (updatedNotes: string) => void
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    const entry = timestamp + '\n' + trimmed
    const updated = currentNotes ? currentNotes + '\n\n' + entry : entry
    await supabase.from('clients').update({ notes: updated }).eq('id', clientId)
    onSaved(updated)
    setText('')
    setSaving(false)
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Leave an internal note for yourself or a team member"
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
        style={{
          width: '100%', padding: '10px 12px', background: '#1e293b', border: '1px solid #334155',
          borderRadius: 8, fontSize: 12, color: '#f1f5f9', outline: 'none', resize: 'vertical',
          minHeight: 72, fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box',
          placeholder: '#475569',
        } as React.CSSProperties}
      />
      <button
        onClick={save}
        disabled={saving || !text.trim()}
        style={{
          marginTop: 8, width: '100%', padding: '8px', background: text.trim() ? '#16a34a' : '#1e293b',
          border: 'none', borderRadius: 8, color: text.trim() ? '#fff' : '#475569',
          fontSize: 12, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'default',
          fontFamily: 'inherit', transition: 'all .15s',
        }}>
        {saving ? 'Saving...' : '+ Add Note'}
      </button>
    </div>
  )
}
