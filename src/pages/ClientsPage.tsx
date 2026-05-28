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

const DIVISIONS = [
  { label: 'Lawn & Tree', icon: '🌿' },
  { label: 'Irrigation', icon: '💧' },
  { label: 'Extermination', icon: '🐛' },
  { label: 'Nursery', icon: '🌱' },
  { label: 'Farm', icon: '🚜' },
]

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active: { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' },
  lead: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  overdue: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  inactive: { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
}

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

  useEffect(() => {
    loadClients()
    const channel = supabase.channel('clients-main')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, loadClients)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (selectedClient) loadFiles(selectedClient.id)
  }, [selectedClient])

  const openClient = (c: Client) => {
    setSelectedClient(c)
    setEditMode(false)
    setActiveTab('info')
    navigate('/clients/' + c.id)
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

  // ── CLIENT DETAIL VIEW ──
  if (selectedClient) {
    const tagList = (editMode ? form.tags : selectedClient.tags || '').split(',').map(t => t.trim()).filter(Boolean)
    const noteLines = (selectedClient.notes || '').split('\n\n').filter(Boolean)

    return (
      <div style={{ padding: '2rem', background: '#0a0f1a', minHeight: '100vh' }}>
        {/* Back button */}
        <button onClick={() => { setSelectedClient(null); navigate('/clients'); }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Back to Clients
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ background: sc(selectedClient.status).bg, color: sc(selectedClient.status).color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>{selectedClient.status}</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#f1f5f9' }}>{selectedClient.first_name} {selectedClient.last_name}</h1>
            {selectedClient.company && <p style={{ margin: '2px 0 0', fontSize: 14, color: '#64748b' }}>{selectedClient.company}</p>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {editMode ? (
              <>
                <button onClick={() => setEditMode(false)} style={{ padding: '8px 16px', border: '1px solid #1e293b', borderRadius: 8, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={handleSaveEdit} style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>Save Changes</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditMode(true)} style={{ padding: '8px 16px', border: '1px solid #1e293b', borderRadius: 8, background: '#0f172a', color: '#f1f5f9', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>✏️ Edit</button>
                <button onClick={() => handleArchive(selectedClient.id)} style={{ padding: '8px 16px', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, background: 'rgba(248,113,113,0.1)', color: '#f87171', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Archive</button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', marginBottom: 24, gap: 0 }}>
          {['info', 'files'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '10px 20px', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid #4ade80' : '2px solid transparent', color: activeTab === tab ? '#f1f5f9' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {tab === 'info' ? 'Client Information' : 'Files & Media'}
            </button>
          ))}
        </div>

        {activeTab === 'info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Contact Info */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Contact Information</h3>
              {editMode ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={lbl}>First Name</label><input style={inp} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
                  <div><label style={lbl}>Last Name</label><input style={inp} value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
                  <div><label style={lbl}>Company</label><input style={inp} value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
                  <div><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Email</label><input style={inp} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                  <div><label style={lbl}>Status</label>
                    <select style={inp} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                      {['lead', 'active', 'inactive', 'overdue'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Division</label>
                    <select style={inp} value={form.divisions} onChange={e => setForm({ ...form, divisions: e.target.value })}>
                      {DIVISIONS.map(d => <option key={d.label}>{d.label}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Lead Source</label><input style={inp} value={form.lead_source} onChange={e => setForm({ ...form, lead_source: e.target.value })} /></div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 32px' }}>
                  {[
                    { label: 'Phone', value: selectedClient.phone },
                    { label: 'Email', value: selectedClient.email },
                    { label: 'Division', value: selectedClient.divisions },
                    { label: 'Status', value: selectedClient.status },
                    { label: 'Lead Source', value: selectedClient.lead_source },
                  ].map(row => (
                    <div key={row.label} style={{ borderBottom: '1px solid #1e293b', paddingBottom: 10 }}>
                      <p style={{ margin: '0 0 2px', fontSize: 11, color: '#475569', fontWeight: 600 }}>{row.label}</p>
                      <p style={{ margin: 0, fontSize: 13, color: row.value ? '#f1f5f9' : '#475569' }}>{row.value || '—'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tags */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Tags</h3>
              {editMode ? (
                <input style={inp} value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="HOA, Monthly bill, PGA POA (comma separated)" />
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {tagList.length === 0 ? <span style={{ color: '#475569', fontSize: 13 }}>No tags yet</span>
                    : tagList.map((t, i) => (
                      <span key={i} style={{ background: 'rgba(100,116,139,0.15)', color: '#94a3b8', padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>{t}</span>
                    ))}
                </div>
              )}
            </div>

            {/* Property / Address */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Property Address</h3>
              {editMode ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Street Address</label><input style={inp} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Main St" /></div>
                  <div><label style={lbl}>City</label><input style={inp} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Port St. Lucie" /></div>
                  <div><label style={lbl}>ZIP</label><input style={inp} value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} placeholder="34986" /></div>
                </div>
              ) : (
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{selectedClient.address || '—'}</p>
                  {(selectedClient.city || selectedClient.zip) && <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{[selectedClient.city, selectedClient.state, selectedClient.zip].filter(Boolean).join(', ')}</p>}
                </div>
              )}
            </div>

            {/* Property Details */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Property Details</h3>
              {editMode ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={lbl}>Lawn Size</label>
                    <select style={inp} value={form.lawn_size} onChange={e => setForm({ ...form, lawn_size: e.target.value })}>
                      {['Small', 'Medium', 'Large', 'Extra Large'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Irrigation</label>
                    <select style={inp} value={form.irrigation} onChange={e => setForm({ ...form, irrigation: e.target.value })}>
                      {['No', 'Yes'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Pest Control</label>
                    <select style={inp} value={form.pest_control} onChange={e => setForm({ ...form, pest_control: e.target.value })}>
                      {['No', 'Yes'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                    <input type="checkbox" id="dog" checked={form.has_dog} onChange={e => setForm({ ...form, has_dog: e.target.checked })} />
                    <label htmlFor="dog" style={{ ...lbl, margin: 0 }}>Has Dog</label>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" id="gate" checked={form.locked_gate} onChange={e => setForm({ ...form, locked_gate: e.target.checked })} />
                    <label htmlFor="gate" style={{ ...lbl, margin: 0 }}>Locked Gate</label>
                  </div>
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
                    <div key={row.label} style={{ borderBottom: '1px solid #1e293b', paddingBottom: 10 }}>
                      <p style={{ margin: '0 0 2px', fontSize: 11, color: '#475569', fontWeight: 600 }}>{row.label}</p>
                      <p style={{ margin: 0, fontSize: 13, color: '#f1f5f9' }}>{row.value || 'No'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
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
                <p style={{ margin: '4px 0 0', fontSize: 12 }}>Upload contracts, photos, or any documents</p>
              </div>
            ) : (
              <div>
                {files.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ fontSize: 24 }}>{f.type.startsWith('image') ? '🖼️' : f.type === 'application/pdf' ? '📄' : '📎'}</div>
                    <div style={{ flex: 1 }}>
                      <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#4ade80', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>{f.name}</a>
                      <p style={{ margin: 0, fontSize: 11, color: '#475569' }}>{fmtSize(f.size)} · {fmtTime(f.created_at)}</p>
                    </div>
                    <button onClick={() => handleDeleteFile(f.id, f.url)} style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── CLIENT LIST VIEW ──
  return (
    <div style={{ padding: '2rem', background: '#0a0f1a', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', margin: '0 0 2px' }}>Clients</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{clients.length} total clients</p>
        </div>
        <button onClick={openNewClient} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ New Client</button>
      </div>

      {/* Stats */}
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

      {/* Filters */}
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

      {/* Table */}
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
              <div><label style={lbl}>First Name *</label><input style={inp} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="First name" /></div>
              <div><label style={lbl}>Last Name *</label><input style={inp} value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="Last name" /></div>
              <div><label style={lbl}>Company</label><input style={inp} value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Company name" /></div>
              <div><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(561) 000-0000" /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Email</label><input style={inp} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" /></div>
              <div><label style={lbl}>Lead Source</label><input style={inp} value={form.lead_source} onChange={e => setForm({ ...form, lead_source: e.target.value })} placeholder="Referral, Google..." /></div>
            </div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>Property Address</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Street Address</label><input style={inp} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Main St" /></div>
              <div><label style={lbl}>City</label><input style={inp} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Port St. Lucie" /></div>
              <div><label style={lbl}>ZIP</label><input style={inp} value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} placeholder="34986" /></div>
            </div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>Details</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div><label style={lbl}>Division</label>
                <select style={inp} value={form.divisions} onChange={e => setForm({ ...form, divisions: e.target.value })}>
                  {DIVISIONS.map(d => <option key={d.label}>{d.icon} {d.label}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Status</label>
                <select style={inp} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {['lead', 'active', 'inactive', 'overdue'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Tags (comma separated)</label><input style={inp} value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="HOA, Monthly bill, PGA POA" /></div>
            </div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>Property Details</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <div><label style={lbl}>Lawn Size</label>
                <select style={inp} value={form.lawn_size} onChange={e => setForm({ ...form, lawn_size: e.target.value })}>
                  {['Small', 'Medium', 'Large', 'Extra Large'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Irrigation</label>
                <select style={inp} value={form.irrigation} onChange={e => setForm({ ...form, irrigation: e.target.value })}>
                  <option>No</option><option>Yes</option>
                </select>
              </div>
              <div><label style={lbl}>Pest Control</label>
                <select style={inp} value={form.pest_control} onChange={e => setForm({ ...form, pest_control: e.target.value })}>
                  <option>No</option><option>Yes</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingTop: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.has_dog} onChange={e => setForm({ ...form, has_dog: e.target.checked })} /> Dog
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.locked_gate} onChange={e => setForm({ ...form, locked_gate: e.target.checked })} /> Locked Gate
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewClient(false)} style={{ padding: '10px 20px', border: '1px solid #1e293b', borderRadius: 9, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleSaveNew} style={{ padding: '10px 20px', border: 'none', borderRadius: 9, background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>Save Client</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
