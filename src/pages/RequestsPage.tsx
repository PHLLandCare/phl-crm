import { useEffect, useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface Request {
  id: string
  title: string
  client_name: string
  client_id: string
  phone: string
  email: string
  property_address: string
  service: string
  notes: string
  internal_notes: string
  status: string
  salesperson: string
  requested_on: string
  availability_date1: string
  availability_date2: string
  arrival_times: string[]
  line_items: LineItem[]
  created_at: string
  updated_at: string
}

interface LineItem {
  id: string
  name: string
  description: string
  qty: number
  unit_price: number
}

const STATUS_COLORS: Record<string, { bg: string; color: string; dot: string }> = {
  'New':                  { bg: 'rgba(96,165,250,0.12)',  color: '#60a5fa', dot: '#3b82f6' },
  'Assessment complete':  { bg: 'rgba(168,85,247,0.12)', color: '#a855f7', dot: '#a855f7' },
  'Overdue':              { bg: 'rgba(248,113,113,0.12)', color: '#f87171', dot: '#ef4444' },
  'Unscheduled':          { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', dot: '#f59e0b' },
  'Archived':             { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8', dot: '#64748b' },
  'Completed':            { bg: 'rgba(74,222,128,0.12)',  color: '#4ade80', dot: '#22c55e' },
}

function blankForm() {
  return {
    title: '', client_name: '', client_id: '', phone: '', email: '',
    property_address: '', service: '', notes: '', internal_notes: '',
    status: 'New', availability_date1: '', availability_date2: '',
    arrival_times: [] as string[], line_items: [] as LineItem[]
  }
}

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })
}

export default function RequestsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>(blankForm())
  const [clients, setClients] = useState<any[]>([])
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const [uploadingImg, setUploadingImg] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const inp: React.CSSProperties = { width:'100%', padding:'10px 14px', border:'1px solid #2d3748', borderRadius:8, fontSize:14, fontFamily:'inherit', outline:'none', background:'#1a2035', color:'#e2e8f0', boxSizing:'border-box' }
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadRequests = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('requests').select('*').order('created_at', { ascending: false })
      if (!error && data) setRequests(data)
      else setRequests([])
    } catch { setRequests([]) }
    setLoading(false)
  }

  useEffect(() => {
    loadRequests()
    supabase.from('clients').select('id,first_name,last_name,company,phone,email,address,city,state,zip').is('deleted_at',null).order('first_name').then(({data})=>setClients(data??[]))
    const state = location.state as any
    if (state?.filter === 'new') setStatusFilter('New')
    else if (state?.filter === 'overdue') setStatusFilter('Overdue')
    if (state?.clientName) setForm((f: any) => ({ ...f, client_name: state.clientName }))
    if (state?.openCreate) setShowNew(true)
    const ch = supabase.channel('requests-rt').on('postgres_changes',{event:'*',schema:'public',table:'requests'},loadRequests).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [location.state])

  const handleClientSelect = (clientId: string) => {
    const c = clients.find(x => x.id === clientId)
    if (c) {
      const addr = [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')
      setForm((f: any) => ({
        ...f,
        client_id: c.id,
        client_name: `${c.first_name} ${c.last_name}`,
        phone: c.phone || '',
        email: c.email || '',
        property_address: addr,
      }))
    }
  }

  const handleImageUpload = async (file: File) => {
    setUploadingImg(true)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `request-images/${Date.now()}_${safeName}`
      // Try product-images bucket (already exists), fall back to base64 preview
      const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
        setUploadedImages(prev => [...prev, publicUrl])
      } else {
        // Fallback: show local preview as base64
        const reader = new FileReader()
        reader.onload = e => { if (e.target?.result) setUploadedImages(prev => [...prev, e.target!.result as string]) }
        reader.readAsDataURL(file)
      }
    } catch {
      // Fallback to base64 preview
      const reader = new FileReader()
      reader.onload = e => { if (e.target?.result) setUploadedImages(prev => [...prev, e.target!.result as string]) }
      reader.readAsDataURL(file)
    }
    setUploadingImg(false)
  }

  const addLineItem = () => {
    setForm((f: any) => ({
      ...f,
      line_items: [...(f.line_items||[]), { id: String(Date.now()), name:'', description:'', qty:1, unit_price:0 }]
    }))
  }

  const updateLineItem = (id: string, field: string, value: any) => {
    setForm((f: any) => ({
      ...f,
      line_items: f.line_items.map((li: LineItem) => li.id===id ? {...li,[field]:value} : li)
    }))
  }

  const removeLineItem = (id: string) => {
    setForm((f: any) => ({ ...f, line_items: f.line_items.filter((li: LineItem) => li.id!==id) }))
  }

  const subtotal = (form.line_items||[]).reduce((s: number, li: LineItem) => s + (li.qty||0)*(li.unit_price||0), 0)

  const handleSave = async () => {
    if (!form.client_name?.trim()) { showToast('Please select a client'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        line_items: JSON.stringify(form.line_items||[]),
        arrival_times: form.arrival_times||[],
        requested_on: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('requests').insert(payload)
      if (error) throw error
      showToast('✅ Request saved!')
      setShowNew(false)
      setForm(blankForm())
      setUploadedImages([])
      loadRequests()
    } catch (e: any) {
      showToast('Error: ' + e.message)
    }
    setSaving(false)
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await supabase.from('requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
      setRequests(prev => prev.map(r => r.id===id ? {...r,status} : r))
    } catch {}
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this request?')) return
    await supabase.from('requests').delete().eq('id', id)
    setRequests(prev => prev.filter(r => r.id!==id))
    showToast('Request deleted')
  }

  const sc = (s: string) => STATUS_COLORS[s] || STATUS_COLORS['New']

  const filtered = requests.filter(r => {
    const ms = `${r.client_name} ${r.title} ${r.email} ${r.phone} ${r.property_address}`.toLowerCase().includes(search.toLowerCase())
    const mf = statusFilter === 'All' || r.status === statusFilter
    return ms && mf
  })

  const newCount =         requests.filter(r => r.status==='New').length
  const assessCount =      requests.filter(r => r.status==='Assessment complete').length
  const overdueCount =     requests.filter(r => r.status==='Overdue').length
  const unscheduledCount = requests.filter(r => r.status==='Unscheduled').length

  const STATUS_TABS = ['All','New','Assessment complete','Overdue','Unscheduled','Archived']

  return (
    <div style={{ padding:'2rem', background:'#0a0f1a', minHeight:'100vh', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {toast && (
        <div style={{ position:'fixed',top:'1rem',right:'1rem',background:'#052e16',border:'1px solid #16a34a',borderRadius:10,padding:'10px 18px',fontSize:14,color:'#4ade80',fontWeight:600,zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,0.5)' }}>
          {toast}
        </div>
      )}

      {/* Header — matches Jobber exactly */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12 }}>
        <h1 style={{ fontSize:30,fontWeight:800,color:'#f1f5f9',margin:0 }}>Requests</h1>
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={() => { const sel = filtered.filter(r => r.status === 'New'); sel.forEach(r => handleUpdateStatus(r.id, 'Assessment complete')) }} style={{ background:'transparent',color:'#94a3b8',border:'1px solid #1e293b',borderRadius:8,padding:'9px 16px',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit' }}>
            ··· Mark All Assessed
          </button>
          <button onClick={() => { const csv = ['Client,Title,Property,Contact,Status,Date'].concat(filtered.map(r=>`"${r.client_name}","${r.title||r.notes||''}","${r.property_address||''}","${r.phone||r.email||''}","${r.status}","${r.created_at?.slice(0,10)||''}"`)).join('\n'); const b = new Blob([csv],{type:'text/csv'}); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download='requests.csv'; a.click() }} style={{ background:'transparent',color:'#94a3b8',border:'1px solid #1e293b',borderRadius:8,padding:'9px 16px',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit' }}>
            🔔 Export CSV
          </button>
          <button onClick={() => setShowNew(true)} style={{ background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>
            New Request
          </button>
        </div>
      </div>

      {/* Overview cards — Jobber layout */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:'1.5rem' }}>
        <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.1rem 1.25rem' }}>
          <p style={{ margin:'0 0 10px',fontSize:13,fontWeight:600,color:'#f1f5f9' }}>Overview</p>
          {[
            { dot:'#3b82f6', label:`New (${newCount})`,                    filter:'New' },
            { dot:'#a855f7', label:`Assessment complete (${assessCount})`, filter:'Assessment complete' },
            { dot:'#ef4444', label:`Overdue (${overdueCount})`,            filter:'Overdue' },
            { dot:'#f59e0b', label:`Unscheduled (${unscheduledCount})`,    filter:'Unscheduled' },
          ].map(s => (
            <div key={s.label} onClick={() => setStatusFilter(f => f === s.filter ? 'All' : s.filter)}
              style={{ display:'flex',alignItems:'center',gap:8,marginBottom:6,cursor:'pointer',borderRadius:6,padding:'3px 4px',
                background: statusFilter === s.filter ? 'rgba(255,255,255,0.06)' : 'transparent' }}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.06)')}
              onMouseLeave={e=>(e.currentTarget.style.background=statusFilter===s.filter?'rgba(255,255,255,0.06)':'transparent')}>
              <div style={{ width:8,height:8,borderRadius:'50%',background:s.dot,flexShrink:0 }} />
              <span style={{ fontSize:12,color: statusFilter===s.filter ? '#f1f5f9' : '#94a3b8',fontWeight: statusFilter===s.filter ? 600 : 400 }}>{s.label}</span>
            </div>
          ))}
        </div>
        <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.1rem 1.25rem' }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4 }}>
            <p style={{ margin:0,fontSize:13,fontWeight:600,color:'#f1f5f9' }}>New requests</p>
            <span style={{ fontSize:11,color:'#475569' }}>Past 30 days</span>
          </div>
          <p style={{ margin:'8px 0 0',fontSize:30,fontWeight:800,color:'#f1f5f9' }}>{newCount}</p>
        </div>
        <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.1rem 1.25rem' }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4 }}>
            <p style={{ margin:0,fontSize:13,fontWeight:600,color:'#f1f5f9' }}>Conversion rate</p>
            <span style={{ fontSize:11,color:'#475569' }}>Past 30 days</span>
          </div>
          <p style={{ margin:'8px 0 0',fontSize:30,fontWeight:800,color:'#f1f5f9' }}>
            {requests.length > 0 ? Math.round((requests.filter(r=>r.status==='Completed').length/requests.length)*100) : 0}%
          </p>
        </div>
        <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.1rem 1.25rem' }}>
          <p style={{ margin:'0 0 6px',fontSize:13,fontWeight:600,color:'#f1f5f9' }}>How can you win more work?</p>
          <p style={{ margin:0,fontSize:11,color:'#64748b',lineHeight:1.5 }}>See how PHL CRM can help you respond to potential customers faster and win more business.</p>
        </div>
      </div>

      {/* All requests header + search */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8 }}>
        <h2 style={{ margin:0,fontSize:16,fontWeight:700,color:'#f1f5f9' }}>
          All requests <span style={{ fontSize:13,color:'#475569',fontWeight:400 }}>({filtered.length} results)</span>
        </h2>
        <div style={{ position:'relative',width:280 }}>
          <span style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#475569',fontSize:14 }}>🔍</span>
          <input placeholder="Search requests..." value={search} onChange={e=>setSearch(e.target.value)}
            style={{ ...inp,paddingLeft:34,height:38,background:'#0f172a',border:'1px solid #1e293b' }} />
        </div>
      </div>

      {/* Status filter chips */}
      <div style={{ display:'flex',gap:6,marginBottom:16,flexWrap:'wrap' }}>
        {[{label:'Status | All', val:'All'}, ...STATUS_TABS.slice(1).map(s=>({label:s,val:s}))].map(s => (
          <button key={s.val} onClick={() => setStatusFilter(s.val)} style={{
            padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
            background: statusFilter===s.val ? 'rgba(74,222,128,0.12)' : '#0f172a',
            color: statusFilter===s.val ? '#4ade80' : '#64748b',
            border: statusFilter===s.val ? '1px solid rgba(74,222,128,0.3)' : '1px solid #1e293b',
          }}>
            {statusFilter==='All'&&s.val==='All' ? '🗓 Status | All' : s.label}
          </button>
        ))}
      </div>

      {/* Table — exact Jobber columns: Client | Title | Property | Contact | Requested | Status */}
      {loading ? (
        <div style={{ textAlign:'center',padding:'3rem',color:'#475569' }}>Loading...</div>
      ) : (
        <div style={{ background:'#0f172a',borderRadius:12,border:'1px solid #1e293b',overflow:'hidden' }}>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e293b',background:'#0d1526' }}>
                {[
                  { label:'Client', width:'14%' },
                  { label:'Title', width:'28%' },
                  { label:'Property', width:'18%' },
                  { label:'Contact', width:'16%' },
                  { label:'Requested', width:'10%' },
                  { label:'Status', width:'10%' },
                  { label:'', width:'4%' },
                ].map(h => (
                  <th key={h.label} style={{ padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',width:h.width }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding:'3rem',textAlign:'center',color:'#475569',fontSize:14 }}>
                  <div style={{ fontSize:48,marginBottom:12 }}>📬</div>
                  <p style={{ margin:'0 0 4px',fontSize:16,fontWeight:700,color:'#64748b' }}>No requests found</p>
                  <p style={{ margin:'0 0 20px',fontSize:13,color:'#475569' }}>Click "New Request" to log your first service request</p>
                  <button onClick={() => setShowNew(true)} style={{ background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>New Request</button>
                </td></tr>
              ) : filtered.map(r => {
                const s = sc(r.status)
                return (
                  <tr key={r.id} onClick={() => setSelectedRequest(r)} style={{ borderBottom:'1px solid #0d1526', cursor:'pointer' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.03)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <td style={{ padding:'14px 14px' }}>
                      <span style={{ fontSize:13,fontWeight:700,color:'#f1f5f9' }}>{r.client_name || '—'}</span>
                    </td>
                    <td style={{ padding:'14px 14px' }}>
                      <span style={{ fontSize:13,color:'#cbd5e1',lineHeight:1.4 }}>{r.title || r.notes || r.service || '—'}</span>
                    </td>
                    <td style={{ padding:'14px 14px' }}>
                      <span style={{ fontSize:12,color:'#64748b' }}>{r.property_address || '—'}</span>
                    </td>
                    <td style={{ padding:'14px 14px' }}>
                      <div style={{ fontSize:12,color:'#64748b' }}>
                        {r.phone && <div>{r.phone}</div>}
                        {r.email && <div style={{ color:'#60a5fa' }}>{r.email}</div>}
                      </div>
                    </td>
                    <td style={{ padding:'14px 14px',fontSize:12,color:'#64748b' }}>{fmtDate(r.created_at)}</td>
                    <td style={{ padding:'14px 14px' }}>
                      <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                        <div style={{ width:8,height:8,borderRadius:'50%',background:s.dot,flexShrink:0 }} />
                        <select value={r.status} onClick={e=>e.stopPropagation()} onChange={e => handleUpdateStatus(r.id, e.target.value)}
                          style={{ background:'transparent',color:s.color,border:'none',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',outline:'none',padding:0 }}>
                          {Object.keys(STATUS_COLORS).map(s=><option key={s} style={{ background:'#0f172a',color:'#f1f5f9' }}>{s}</option>)}
                        </select>
                      </div>
                    </td>
                    <td style={{ padding:'14px 8px' }}>
                      <button onClick={e => { e.stopPropagation(); handleDelete(r.id) }}
                        style={{ background:'none',border:'none',color:'#334155',cursor:'pointer',fontSize:16,padding:'2px 6px',borderRadius:4 }}
                        onMouseEnter={e=>(e.currentTarget.style.color='#f87171')}
                        onMouseLeave={e=>(e.currentTarget.style.color='#334155')}>×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          NEW REQUEST FULL-SCREEN MODAL — exact Jobber layout
          ═══════════════════════════════════════════════════════════ */}
      {showNew && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:500 }} onClick={() => setShowNew(false)} />
          <div style={{ position:'fixed',inset:0,zIndex:501,display:'flex',flexDirection:'column',background:'#131c2e',overflow:'hidden' }} onClick={e=>e.stopPropagation()}>

            {/* Orange top bar — Jobber signature */}
            <div style={{ height:4,background:'#f97316',flexShrink:0 }} />

            {/* Title bar */}
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 28px',background:'#131c2e',borderBottom:'1px solid #1e293b',flexShrink:0 }}>
              <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                <span style={{ fontSize:20 }}>📬</span>
                <h2 style={{ margin:0,fontSize:18,fontWeight:700,color:'#f1f5f9' }}>New Request</h2>
              </div>
              <button onClick={() => setShowNew(false)} style={{ background:'none',border:'none',color:'#64748b',fontSize:24,cursor:'pointer',lineHeight:1 }}>×</button>
            </div>

            {/* Header section — Title + Client + Requested on + Salesperson */}
            <div style={{ padding:'16px 28px',background:'#131c2e',borderBottom:'1px solid #1e293b',flexShrink:0 }}>
              <input
                value={form.title||''}
                onChange={e => setForm((f:any)=>({...f,title:e.target.value}))}
                placeholder="Title"
                style={{ display:'block',width:'100%',padding:'12px 16px',background:'#1e293b',border:'1px solid #2d3748',borderRadius:8,color:'#f1f5f9',fontSize:16,outline:'none',fontFamily:'inherit',boxSizing:'border-box',marginBottom:12 }}
              />
              <div style={{ display:'grid',gridTemplateColumns:'1fr 260px',gap:16,alignItems:'start' }}>
                <select
                  value={form.client_id||''}
                  onChange={e => handleClientSelect(e.target.value)}
                  style={{ ...inp,background:'#1e293b',border:'1px solid #2d3748' }}>
                  <option value="">Select a client</option>
                  {clients.map((c:any) => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.company ? ` — ${c.company}` : ''}</option>
                  ))}
                </select>
                <div>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
                    <span style={{ fontSize:13,color:'#64748b' }}>Requested on</span>
                    <span style={{ fontSize:13,fontWeight:600,color:'#f1f5f9' }}>
                      {new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                    </span>
                  </div>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                    <span style={{ fontSize:13,color:'#64748b' }}>Salesperson</span>
                    <span style={{ fontSize:12,background:'#1e293b',border:'1px solid #2d3748',borderRadius:20,padding:'3px 12px',color:'#f1f5f9' }}>
                      Salesperson | Romy Cruz
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{ flex:1,overflowY:'auto',padding:'28px' }}>
              <div style={{ maxWidth:860,margin:'0 auto' }}>

                {/* Overview heading */}
                <h3 style={{ fontSize:22,fontWeight:700,color:'#f1f5f9',margin:'0 0 20px',paddingBottom:12,borderBottom:'1px solid #1e293b' }}>Overview</h3>

                {/* Service Details */}
                <div style={{ marginBottom:20 }}>
                  <h4 style={{ margin:'0 0 4px',fontSize:15,fontWeight:700,color:'#f1f5f9' }}>Service Details</h4>
                  <p style={{ margin:'0 0 10px',fontSize:13,color:'#64748b' }}>Please provide as much information as you can</p>
                  <textarea value={form.notes||''} onChange={e => setForm((f:any)=>({...f,notes:e.target.value}))}
                    style={{ width:'100%',padding:'12px 16px',background:'#1a2035',border:'1px solid #2d3748',borderRadius:8,color:'#f1f5f9',fontSize:14,outline:'none',resize:'vertical',minHeight:120,fontFamily:'inherit',boxSizing:'border-box' as 'border-box' }}
                    placeholder="Describe the service needed..." />
                </div>

                {/* Your Availability */}
                <div style={{ marginBottom:20 }}>
                  <h4 style={{ margin:'0 0 4px',fontSize:15,fontWeight:700,color:'#f1f5f9' }}>Your Availability</h4>
                  <p style={{ margin:'0 0 12px',fontSize:13,color:'#64748b' }}>Which day would be best for an assessment of the work?</p>
                  <div style={{ position:'relative',marginBottom:10 }}>
                    <input type="date" value={form.availability_date1||''} onChange={e => setForm((f:any)=>({...f,availability_date1:e.target.value}))}
                      style={{ ...inp,background:'#1a2035',border:'1px solid #2d3748',paddingRight:40 }}
                      placeholder="Date" />
                    <span style={{ position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',color:'#475569',pointerEvents:'none' }}>📅</span>
                  </div>
                  <p style={{ margin:'0 0 10px',fontSize:13,color:'#64748b' }}>What is another day that works for you?</p>
                  <div style={{ position:'relative',marginBottom:16 }}>
                    <input type="date" value={form.availability_date2||''} onChange={e => setForm((f:any)=>({...f,availability_date2:e.target.value}))}
                      style={{ ...inp,background:'#1a2035',border:'1px solid #2d3748',paddingRight:40 }}
                      placeholder="Date" />
                    <span style={{ position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',color:'#475569',pointerEvents:'none' }}>📅</span>
                  </div>
                  <p style={{ margin:'0 0 10px',fontSize:13,color:'#64748b' }}>What are your preferred arrival times?</p>
                  <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                    {['Any time','Morning','Afternoon','Evening'].map(t => {
                      const active = (form.arrival_times||[]).includes(t)
                      return (
                        <label key={t} style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer' }}
                          onClick={() => setForm((f:any) => ({ ...f, arrival_times: active ? f.arrival_times.filter((x:string)=>x!==t) : [...(f.arrival_times||[]),t] }))}>
                          <div style={{ width:18,height:18,border:`2px solid ${active?'#4ade80':'#334155'}`,borderRadius:3,background:active?'#16a34a':'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' }}>
                            {active && <span style={{ color:'#fff',fontSize:11,lineHeight:1 }}>✓</span>}
                          </div>
                          <span style={{ fontSize:14,color:'#cbd5e1' }}>{t}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Upload Images */}
                <div style={{ marginBottom:20 }}>
                  <h4 style={{ margin:'0 0 4px',fontSize:15,fontWeight:700,color:'#f1f5f9' }}>Upload Images</h4>
                  <p style={{ margin:'0 0 10px',fontSize:13,color:'#64748b' }}>Share images of the work to be done</p>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e=>e.preventDefault()}
                    onDrop={async e=>{ e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) await handleImageUpload(f) }}
                    style={{ border:'2px dashed #2d3748',borderRadius:10,padding:'2rem',textAlign:'center',cursor:'pointer',marginBottom:10,transition:'border-color .2s' }}
                    onMouseEnter={e=>(e.currentTarget.style.borderColor='#4ade80')}
                    onMouseLeave={e=>(e.currentTarget.style.borderColor='#2d3748')}>
                    <div style={{ fontSize:28,marginBottom:6,color:'#475569' }}>🖼️</div>
                    <p style={{ margin:0,fontSize:13,color:'#64748b' }}>
                      {uploadingImg ? 'Uploading...' : 'Drop images here or click to browse'}
                    </p>
                    <p style={{ margin:'4px 0 0',fontSize:11,color:'#334155' }}>{uploadedImages.length}/10</p>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display:'none' }}
                      onChange={async e => { for (const f of Array.from(e.target.files||[])) await handleImageUpload(f) }} />
                  </div>
                  {uploadedImages.length > 0 && (
                    <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                      {uploadedImages.map((url,i) => (
                        <div key={i} style={{ position:'relative',width:80,height:80,borderRadius:8,overflow:'hidden',border:'1px solid #1e293b' }}>
                          <img src={url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
                          <button onClick={() => setUploadedImages(prev=>prev.filter((_,j)=>j!==i))}
                            style={{ position:'absolute',top:2,right:2,background:'rgba(0,0,0,0.7)',border:'none',borderRadius:'50%',color:'#fff',width:18,height:18,cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',justifyContent:'center' }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* On-site assessment */}
                <div style={{ marginBottom:20 }}>
                  <h4 style={{ margin:'0 0 12px',fontSize:15,fontWeight:700,color:'#f1f5f9' }}>On-site assessment</h4>
                  <div style={{ border:'2px dashed #2d3748',borderRadius:10,padding:'2.5rem',textAlign:'center' }}>
                    <div style={{ width:56,height:56,borderRadius:'50%',background:'#1e293b',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px',fontSize:24 }}>🚐</div>
                    <p style={{ margin:0,fontSize:14,color:'#64748b' }}>Visit the property to assess the job before you do the work</p>
                  </div>
                </div>

                {/* Product / Service — line items */}
                <div style={{ marginBottom:20 }}>
                  <h4 style={{ margin:'0 0 4px',fontSize:15,fontWeight:700,color:'#f1f5f9' }}>Product / Service</h4>
                  <p style={{ margin:'0 0 12px',fontSize:13,color:'#64748b' }}>Keep everything on track by adding products and services.</p>
                  <button onClick={addLineItem} style={{ background:'#16a34a',color:'#fff',border:'none',borderRadius:7,padding:'8px 16px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',marginBottom:16 }}>
                    Add Line Item
                  </button>
                  {(form.line_items||[]).map((li: LineItem) => (
                    <div key={li.id} style={{ display:'grid',gridTemplateColumns:'2fr 3fr 80px 100px 28px',gap:8,marginBottom:8,alignItems:'center' }}>
                      <input value={li.name} onChange={e=>updateLineItem(li.id,'name',e.target.value)}
                        placeholder="Product/service name"
                        style={{ ...inp,background:'#1a2035',border:'1px solid #2d3748',fontSize:13 }} />
                      <input value={li.description} onChange={e=>updateLineItem(li.id,'description',e.target.value)}
                        placeholder="Description"
                        style={{ ...inp,background:'#1a2035',border:'1px solid #2d3748',fontSize:13 }} />
                      <input type="number" value={li.qty} min={1} onChange={e=>updateLineItem(li.id,'qty',Number(e.target.value))}
                        style={{ ...inp,background:'#1a2035',border:'1px solid #2d3748',fontSize:13,textAlign:'right' }} />
                      <input type="number" value={li.unit_price} min={0} step={0.01} onChange={e=>updateLineItem(li.id,'unit_price',Number(e.target.value))}
                        placeholder="Unit price"
                        style={{ ...inp,background:'#1a2035',border:'1px solid #2d3748',fontSize:13,textAlign:'right' }} />
                      <button onClick={()=>removeLineItem(li.id)} style={{ background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:18,padding:0 }}>×</button>
                    </div>
                  ))}
                  {/* Subtotal / Total */}
                  <div style={{ borderTop:'1px solid #1e293b',paddingTop:12,marginTop:4 }}>
                    <div style={{ display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13,color:'#94a3b8' }}>
                      <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
                    </div>
                    <div style={{ display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:15,fontWeight:700,color:'#f1f5f9',borderTop:'1px solid #1e293b' }}>
                      <span>Total</span><span>${subtotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Notes (internal) */}
                <div style={{ marginBottom:20 }}>
                  <h4 style={{ margin:'0 0 4px',fontSize:15,fontWeight:700,color:'#f1f5f9' }}>Notes</h4>
                  <div
                    style={{ border:'2px dashed #2d3748',borderRadius:10,padding:'1.5rem',textAlign:'center',cursor:'text',transition:'border-color .2s' }}
                    onClick={() => {
                      setForm((f:any) => ({...f, _showNoteInput:true}))
                    }}
                    onMouseEnter={e=>(e.currentTarget.style.borderColor='#4ade80')}
                    onMouseLeave={e=>(e.currentTarget.style.borderColor='#2d3748')}>
                    {form._showNoteInput ? (
                      <textarea value={form.internal_notes||''} autoFocus
                        onChange={e => setForm((f:any)=>({...f,internal_notes:e.target.value}))}
                        style={{ width:'100%',background:'transparent',border:'none',color:'#f1f5f9',fontSize:14,outline:'none',resize:'vertical',minHeight:80,fontFamily:'inherit',textAlign:'left' }}
                        placeholder="Leave an internal note for yourself or a team member" />
                    ) : (
                      <>
                        <div style={{ width:44,height:44,borderRadius:'50%',background:'#1e293b',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px',fontSize:20 }}>📋</div>
                        <p style={{ margin:0,fontSize:13,color:'#64748b' }}>Leave an internal note for yourself or a team member</p>
                      </>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Sticky footer */}
            <div style={{ display:'flex',justifyContent:'flex-end',gap:12,padding:'14px 28px',background:'#131c2e',borderTop:'1px solid #1e293b',flexShrink:0 }}>
              <button onClick={() => setShowNew(false)}
                style={{ padding:'10px 24px',border:'1px solid #2d3748',borderRadius:8,background:'transparent',color:'#94a3b8',cursor:'pointer',fontSize:14,fontFamily:'inherit' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding:'10px 32px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700,fontFamily:'inherit',opacity:saving?0.7:1 }}>
                {saving ? 'Saving...' : 'Save Request'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── REQUEST DETAIL DRAWER ── */}
      {selectedRequest && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:500 }} onClick={() => setSelectedRequest(null)} />
          <div style={{ position:'fixed',top:0,right:0,width:'min(600px,100vw)',height:'100vh',background:'#0d1526',borderLeft:'1px solid #1e293b',zIndex:501,display:'flex',flexDirection:'column',overflow:'hidden' }}>
            {/* Header */}
            <div style={{ padding:'16px 20px',borderBottom:'1px solid #1e293b',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
              <div>
                <h2 style={{ margin:0,fontSize:16,fontWeight:700,color:'#f1f5f9' }}>{selectedRequest.title || selectedRequest.service || 'Request'}</h2>
                <p style={{ margin:'2px 0 0',fontSize:12,color:'#64748b' }}>{selectedRequest.client_name}</p>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button
                  onClick={async () => {
                    await supabase.from('requests').update({ status: 'Quoted' }).eq('id', selectedRequest.id)
                    navigate('/quotes', { state:{
                      openCreate: true,
                      clientName: selectedRequest.client_name,
                      clientId: String(selectedRequest.client_id || ''),
                      title: selectedRequest.service || selectedRequest.title || '',
                      description: selectedRequest.notes || '',
                      sourceId: selectedRequest.id,
                      sourceType: 'request',
                    }})
                    setSelectedRequest(null)
                  }}
                  style={{ background:'rgba(168,85,247,0.12)',color:'#a855f7',border:'1px solid rgba(168,85,247,0.3)',borderRadius:7,padding:'6px 12px',fontSize:12,cursor:'pointer',fontFamily:'inherit',fontWeight:600 }}>
                  → Quote
                </button>
                <button
                  onClick={async () => {
                    await supabase.from('requests').update({ status: 'Converted' }).eq('id', selectedRequest.id)
                    navigate('/jobs', { state:{
                      openCreate: true,
                      clientName: selectedRequest.client_name,
                      clientId: String(selectedRequest.client_id || ''),
                      title: selectedRequest.service || selectedRequest.title || '',
                      description: selectedRequest.notes || '',
                      sourceId: selectedRequest.id,
                      sourceType: 'request',
                    }})
                    setSelectedRequest(null)
                  }}
                  style={{ background:'rgba(74,222,128,0.1)',color:'#4ade80',border:'1px solid rgba(74,222,128,0.2)',borderRadius:7,padding:'6px 12px',fontSize:12,cursor:'pointer',fontFamily:'inherit',fontWeight:600 }}>
                  → Job
                </button>
                <button onClick={() => setSelectedRequest(null)} style={{ background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer' }}>×</button>
              </div>
            </div>
            {/* Body */}
            <div style={{ flex:1,overflowY:'auto',padding:20 }}>
              {/* Status */}
              <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:16 }}>
                <div style={{ width:8,height:8,borderRadius:'50%',background:sc(selectedRequest.status).dot }} />
                <select value={selectedRequest.status}
                  onChange={e => { handleUpdateStatus(selectedRequest.id, e.target.value); setSelectedRequest({...selectedRequest, status: e.target.value}) }}
                  style={{ background:'#1e293b',color:sc(selectedRequest.status).color,border:'1px solid #334155',borderRadius:7,padding:'4px 10px',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',outline:'none' }}>
                  {Object.keys(STATUS_COLORS).map(s=><option key={s} style={{ background:'#0f172a',color:'#f1f5f9' }}>{s}</option>)}
                </select>
                <span style={{ fontSize:12,color:'#475569',marginLeft:'auto' }}>Requested: {fmtDate(selectedRequest.created_at)}</span>
              </div>

              {/* Info grid */}
              {[
                { label:'Client', value: selectedRequest.client_name },
                { label:'Phone', value: selectedRequest.phone },
                { label:'Email', value: selectedRequest.email },
                { label:'Property', value: selectedRequest.property_address },
                { label:'Service', value: selectedRequest.service },
                { label:'Availability', value: [selectedRequest.availability_date1, selectedRequest.availability_date2].filter(Boolean).join(' / ') },
                { label:'Arrival Times', value: Array.isArray(selectedRequest.arrival_times) ? selectedRequest.arrival_times.join(', ') : selectedRequest.arrival_times },
              ].filter(row => row.value).map(row => (
                <div key={row.label} style={{ display:'flex',gap:12,padding:'8px 0',borderBottom:'1px solid #1e293b' }}>
                  <span style={{ fontSize:12,color:'#475569',fontWeight:600,width:100,flexShrink:0 }}>{row.label}</span>
                  <span style={{ fontSize:13,color:'#cbd5e1' }}>{row.value}</span>
                </div>
              ))}

              {/* Notes */}
              {selectedRequest.notes && (
                <div style={{ marginTop:16,background:'#0f172a',border:'1px solid #1e293b',borderRadius:10,padding:'12px 14px' }}>
                  <p style={{ margin:'0 0 6px',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em' }}>Service Details</p>
                  <p style={{ margin:0,fontSize:13,color:'#cbd5e1',lineHeight:1.6 }}>{selectedRequest.notes}</p>
                </div>
              )}
              {selectedRequest.internal_notes && (
                <div style={{ marginTop:10,background:'#0f172a',border:'1px solid #1e293b',borderRadius:10,padding:'12px 14px' }}>
                  <p style={{ margin:'0 0 6px',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em' }}>Internal Notes</p>
                  <p style={{ margin:0,fontSize:13,color:'#cbd5e1',lineHeight:1.6 }}>{selectedRequest.internal_notes}</p>
                </div>
              )}
            </div>
            {/* Footer */}
            <div style={{ padding:'12px 20px',borderTop:'1px solid #1e293b',display:'flex',gap:8,flexShrink:0 }}>
              <button
                onClick={() => { handleDelete(selectedRequest.id); setSelectedRequest(null) }}
                style={{ padding:'8px 16px',background:'rgba(248,113,113,0.1)',color:'#f87171',border:'1px solid rgba(248,113,113,0.2)',borderRadius:7,cursor:'pointer',fontSize:12,fontFamily:'inherit' }}>
                Delete Request
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
