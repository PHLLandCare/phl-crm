import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface LineItem {
  id?: number
  quote_id?: number
  name: string
  description: string
  qty: number
  unit_price: number
  is_optional?: boolean
}

interface Quote {
  id: number
  quote_number: string
  client_id: number
  client_name: string
  title: string
  message: string
  status: string
  amount: number
  salesperson?: string
  irrigation?: string
  pest_control?: string
  discount?: number
  discount_type?: string
  tax?: number
  contract_text?: string
  internal_notes?: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:    { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
  sent:     { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24' },
  approved: { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' },
  declined: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  archived: { bg: 'rgba(100,116,139,0.1)',  color: '#64748b' },
}

const QUOTE_TEMPLATES = [
  { label: 'Bi-Weekly Service', title: 'Bi-Weekly Lawn Service', services: [{ name: 'Bi-Weekly Lawn Mowing', description: 'Mowing, edging, trimming and blowoff every two weeks', qty: 1, unit_price: 0 }] },
  { label: 'One-Time Seasonal (Spring/Fall)', title: 'One-Time Seasonal Service', services: [{ name: 'Seasonal Cleanup', description: 'Spring/Fall yard cleanup and bed maintenance', qty: 1, unit_price: 0 }] },
  { label: 'Weekly Service', title: 'Weekly Lawn Service', services: [{ name: 'Weekly Lawn Mowing', description: 'Weekly mowing, edging, trimming and blowoff', qty: 1, unit_price: 0 }] },
]

const PHL_SERVICES = [
  { name: 'Free Assessment', description: 'Our experts will come to assess your needs and discuss solutions', unit_price: 0 },
  { name: 'Lawn Mowing Service', description: 'Weekly lawn mowing including trimming, edging, and blowing off clippings.', unit_price: 0 },
  { name: 'Core Aeration Service', description: 'Core aeration of lawn to reduce soil compaction, promote root growth, and improve nutrient uptake.', unit_price: 0 },
  { name: 'Mulch Installation', description: 'Delivery and installation of premium mulch to landscape beds, including bed preparation and edging.', unit_price: 0 },
  { name: 'Yard Clean Up', description: 'Includes trimming of trees and bushes, removal of weeds and debris from property, and hauling away yard waste.', unit_price: 0 },
  { name: 'Fertilizer and Weed Control Program', description: 'Annual program consisting of multiple treatments throughout the year including pre-emergent, post-emergent, and fertilizer.', unit_price: 0 },
  { name: 'Pest Control Bundle', description: 'Year-round perimeter pest control applications every 6-8 weeks to reduce populations of spiders, ants, ticks, and other pests.', unit_price: 0 },
  { name: 'Tree Trimming', description: 'Pruning of trees to remove dead or dangerous branches, promote healthy growth, and clear limbs from structures.', unit_price: 0 },
  { name: 'Irrigation System Startup', description: 'Spring startup service includes opening irrigation valves, setting and adjusting timer, pressurizing system, and inspecting heads.', unit_price: 0 },
  { name: 'Landscape Enhancement Services', description: 'Design and installation services for landscapes such as wall construction, patio design, tree and shrub installation.', unit_price: 0 },
  { name: '.75 inch screenings', description: '', unit_price: 0 },
  { name: 'Agave attenuata/Spinless Agave', description: '', unit_price: 0 },
  { name: 'Adonidia Palm, Veitchia merrill', description: '', unit_price: 0 },
  { name: 'Agronomy', description: '', unit_price: 0 },
]

export default function QuotesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [showNew, setShowNew] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [newNote, setNewNote] = useState('')
  const [serviceSearch, setServiceSearch] = useState('')
  const [showServicePicker, setShowServicePicker] = useState(false)
  const [quoteToast, setQuoteToast] = useState('')
  const [sendingQuote, setSendingQuote] = useState<number|null>(null)
  const [duplicateQuotes, setDuplicateQuotes] = useState<Quote[]>([])
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const showQToast = (msg: string) => { setQuoteToast(msg); setTimeout(() => setQuoteToast(''), 4000) }

  const sendQuoteForApproval = async (q: Quote) => {
    if (!q.client_name) { showQToast('⚠️ No client on this quote'); return }
    setSendingQuote(q.id)
    try {
      // Look up client email
      const { data: client } = await supabase.from('clients')
        .select('email,first_name,last_name')
        .or(`first_name.ilike.%${q.client_name.split(' ')[0]}%,last_name.ilike.%${q.client_name.split(' ').pop()}%`)
        .limit(1).single()
      const recipientEmail = client?.email
      if (!recipientEmail) {
        showQToast(`⚠️ No email on file for ${q.client_name}. Add one in their client profile.`)
        setSendingQuote(null); return
      }
      const portalUrl = `https://phllandcare.github.io/phl-crm/#/portal?quote=${q.id}`
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: recipientEmail,
          subject: `Quote #${q.quote_number} from PHL Land Care Inc. — Please Review`,
          html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc"><div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)"><div style="background:#1e3a5f;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">PHL Land Care Inc.</h1><p style="color:#94a3b8;margin:4px 0 0">Quote #${q.quote_number}</p></div><div style="padding:24px"><p>Dear ${q.client_name},</p><p>Your quote for <strong>${q.title || 'lawn care services'}</strong> is ready for your review.</p><p><strong>Total: $${(q.amount||0).toFixed(2)}</strong></p><div style="text-align:center;margin:24px 0"><a href="${portalUrl}" style="background:#16a34a;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Review &amp; Approve Quote →</a></div><p style="color:#64748b;font-size:12px">You can approve or decline the quote at the link above. Valid for 30 days.</p></div><div style="background:#1e3a5f;padding:16px;text-align:center"><p style="color:#94a3b8;margin:0;font-size:12px">PHL Land Care Inc. | 772-466-3617 | admin@phllandcare.com</p></div></div></body></html>`,
        }
      })
      if (error) throw new Error(error.message)
      // Log structured communication to client notes for Last Communication panel
      const sentAt = new Date().toISOString()
      const commEntry = `COMM|type:email_quote|sent_at:${sentAt}|to:${recipientEmail}|subject:Quote #${q.quote_number} from PHL Land Care Inc. — Please Review|body:Hi ${q.client_name},\n\nYour quote for ${q.title || 'lawn care services'} is ready for review.\n\nTotal: $${(q.amount||0).toFixed(2)}\n\nPortal: ${portalUrl}|quote_num:${q.quote_number}|amount:${q.amount||0}`
      const { data: clientRow } = await supabase.from('clients')
        .select('id,notes').eq('first_name', q.client_name.split(' ')[0]).eq('last_name', q.client_name.split(' ').slice(1).join(' ')).single()
      if (clientRow) {
        const updatedNotes = (clientRow.notes || '') + (clientRow.notes ? '\n\n' : '') + commEntry
        await supabase.from('clients').update({ notes: updatedNotes }).eq('id', clientRow.id)
      }
      await supabase.from('quotes').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', q.id)
      loadQuotes()
      showQToast(`✅ Quote #${q.quote_number} sent to ${recipientEmail} for approval!`)
      if (selectedQuote?.id === q.id) setSelectedQuote({ ...selectedQuote, status: 'sent' })
    } catch {
      // Email not connected yet — copy portal link
      const portalUrl = `https://phllandcare.github.io/phl-crm/#/portal?quote=${q.id}`
      navigator.clipboard.writeText(portalUrl).catch(() => {})
      await supabase.from('quotes').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', q.id)
      loadQuotes()
      showQToast(`📋 Portal link copied! Share with ${q.client_name}: ${portalUrl.slice(0, 60)}...`)
    }
    setSendingQuote(null)
  }
  const [showCustomField, setShowCustomField] = useState(false)
  const [customFieldForm, setCustomFieldForm] = useState({ name: '', value: '' })
  const [customFields, setCustomFields] = useState<{name:string;value:string}[]>([])
  const [activeSection, setActiveSection] = useState<string|null>(null)

  const [form, setForm] = useState({
    client_id: '', client_name: '', title: '', message: '', status: 'draft',
    salesperson: 'Romy Cruz', irrigation: 'No', pest_control: 'No',
    discount: 0, discount_type: 'percent', tax: 0,
    contract_text: 'This quote is valid for the next 30 days, after which values may be subject to change.',
    internal_notes: '',
  })
  const [newLineItems, setNewLineItems] = useState<LineItem[]>([
    { name: '', description: '', qty: 1, unit_price: 0, is_optional: false }
  ])

  useEffect(() => {
    if ((location.state as any)?.openCreate) {
      const state = location.state as any
      if (state.clientName) {
        setForm(f => ({ ...f, client_name: state.clientName, client_id: state.clientId || '' }))
        // Check for existing quotes for this client
        supabase.from('quotes')
          .select('*')
          .eq('client_name', state.clientName)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(5)
          .then(({ data }) => {
            if (data && data.length > 0) {
              setDuplicateQuotes(data)
              setShowDuplicateModal(true)
            } else {
              setShowTemplateModal(true)
            }
          })
      } else {
        setShowTemplateModal(true)
      }
    }
  }, [location.state])

  useEffect(() => {
    const f = (location.state as any)?.filter
    if (f) setStatusFilter(f)
  }, [location.state])

  const loadQuotes = async () => {
    setLoading(true)
    const { data } = await supabase.from('quotes').select('*').is('deleted_at', null).order('created_at', { ascending: false })
    setQuotes(data ?? [])
    setLoading(false)
  }

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('id,first_name,last_name,company').is('deleted_at', null).order('last_name')
    setClients(data ?? [])
  }

  const loadLineItems = async (quoteId: number) => {
    const { data } = await supabase.from('quote_line_items').select('*').eq('quote_id', quoteId).order('id')
    setLineItems(data ?? [])
  }

  useEffect(() => {
    loadQuotes()
    loadClients()
    const channel = supabase.channel('quotes-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, loadQuotes)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (selectedQuote) loadLineItems(selectedQuote.id)
  }, [selectedQuote])

  // Fix: open detail in-page, NOT by navigating away
  const openQuote = (q: Quote) => {
    setSelectedQuote(q)
  }

  const calcSubtotal = (items: LineItem[]) => items.reduce((sum, i) => sum + (i.qty * i.unit_price), 0)
  const calcDiscount = (sub: number) => {
    if (!form.discount) return 0
    return form.discount_type === 'percent' ? sub * (form.discount / 100) : form.discount
  }
  const calcTax = (sub: number, disc: number) => {
    if (!form.tax) return 0
    return (sub - disc) * (form.tax / 100)
  }
  const calcTotal = (items: LineItem[]) => {
    const sub = calcSubtotal(items)
    const disc = calcDiscount(sub)
    const tax = calcTax(sub, disc)
    return sub - disc + tax
  }

  const handleApplyTemplate = (tmpl: typeof QUOTE_TEMPLATES[0]) => {
    setForm(f => ({ ...f, title: tmpl.title }))
    setNewLineItems(tmpl.services.map(s => ({ ...s, is_optional: false, description: s.description })))
    setShowTemplateModal(false)
    setShowNew(true)
  }

  const handleSaveNew = async () => {
    if (!form.title || !form.client_name) return
    const sub = calcSubtotal(newLineItems)
    const disc = calcDiscount(sub)
    const tax = calcTax(sub, disc)
    const total = sub - disc + tax
    // Get next quote number from Jobber sequence
    const maxQ = quotes.reduce((max, q) => {
      const n = parseInt((q.quote_number || '0').replace(/\D/g,''))
      return n > max ? n : max
    }, 15699)
    const quoteNum = String(maxQ + 1)
    const { data: q } = await supabase.from('quotes').insert({
      quote_number: quoteNum,
      client_id: form.client_id ? parseInt(form.client_id) : null,
      client_name: form.client_name,
      title: form.title,
      message: form.message,
      status: form.status,
      amount: total,
      salesperson: form.salesperson,
      irrigation: form.irrigation,
      pest_control: form.pest_control,
      discount: form.discount,
      discount_type: form.discount_type,
      tax: form.tax,
      contract_text: form.contract_text,
      internal_notes: form.internal_notes,
      updated_at: new Date().toISOString()
    }).select().single()
    if (q && newLineItems.length > 0) {
      await supabase.from('quote_line_items').insert(
        newLineItems.filter(i => i.name).map(i => ({ ...i, quote_id: q.id }))
      )
    }
    setShowNew(false)
    setForm({ client_id:'', client_name:'', title:'', message:'', status:'draft', salesperson:'Romy Cruz', irrigation:'No', pest_control:'No', discount:0, discount_type:'percent', tax:0, contract_text:'This quote is valid for the next 30 days, after which values may be subject to change.', internal_notes:'' })
    setNewLineItems([{ name:'', description:'', qty:1, unit_price:0, is_optional:false }])
    setCustomFields([])
    loadQuotes()
  }

  const handleUpdateStatus = async (status: string) => {
    if (!selectedQuote) return
    await supabase.from('quotes').update({ status, updated_at: new Date().toISOString() }).eq('id', selectedQuote.id)
    setSelectedQuote({ ...selectedQuote, status })
    loadQuotes()
  }

  const handleArchive = async (id: number) => {
    if (!confirm('Archive this quote?')) return
    await supabase.from('quotes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setSelectedQuote(null)
    loadQuotes()
  }

  const addLineItem = () => setNewLineItems([...newLineItems, { name:'', description:'', qty:1, unit_price:0, is_optional:false }])
  const removeLineItem = (i: number) => setNewLineItems(newLineItems.filter((_, idx) => idx !== i))
  const updateLineItem = (i: number, field: keyof LineItem, value: any) => {
    const updated = [...newLineItems]
    updated[i] = { ...updated[i], [field]: value }
    setNewLineItems(updated)
  }

  const addServiceFromPicker = (svc: typeof PHL_SERVICES[0]) => {
    setNewLineItems([...newLineItems.filter(i => i.name), { name: svc.name, description: svc.description, qty: 1, unit_price: svc.unit_price, is_optional: false }])
    setShowServicePicker(false)
    setServiceSearch('')
  }

  const fmt = (n: number) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  const sc = (s: string) => STATUS_COLORS[s?.toLowerCase()] || STATUS_COLORS.draft
  const filtered = quotes.filter(q => {
    const matchSearch = `${q.quote_number} ${q.client_name} ${q.title}`.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' ? true : q.status?.toLowerCase() === statusFilter.toLowerCase()
    return matchSearch && matchStatus
  })

  const draftCount = quotes.filter(q => q.status === 'draft').length
  const sentCount = quotes.filter(q => q.status === 'sent').length
  const approvedCount = quotes.filter(q => q.status === 'approved').length
  const changesCount = quotes.filter(q => q.status === 'changes_requested').length
  const approvedValue = quotes.filter(q => q.status === 'approved').reduce((a, q) => a + (q.amount || 0), 0)
  const sentValue = quotes.filter(q => q.status === 'sent').reduce((a, q) => a + (q.amount || 0), 0)

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #1e293b', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#0f172a', color: '#f1f5f9', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }

  const filteredServices = PHL_SERVICES.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()) || s.description.toLowerCase().includes(serviceSearch.toLowerCase()))

  // ── QUOTE DETAIL VIEW ──
  if (selectedQuote) {
    const sub = lineItems.reduce((s, i) => s + (i.qty * i.unit_price), 0)
    return (
      <div style={{ padding: '2rem', background: '#0a0f1a', minHeight: '100vh' }}>
      {quoteToast && <div style={{ position:'fixed',top:'1rem',right:'1rem',background:quoteToast.startsWith('✅')?'#052e16':'#1a0a00',border:`1px solid ${quoteToast.startsWith('✅')?'#16a34a':'#d97706'}`,borderRadius:10,padding:'10px 18px',fontSize:14,color:quoteToast.startsWith('✅')?'#4ade80':'#fcd34d',fontWeight:600,zIndex:9999,maxWidth:400 }}>{quoteToast}</div>}
        <button onClick={() => setSelectedQuote(null)} style={{ background:'none',border:'none',color:'#64748b',fontSize:13,cursor:'pointer',fontFamily:'inherit',marginBottom:16 }}>
          ← Back to Quotes
        </button>

        {/* Header */}
        <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12 }}>
          <div>
            <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:6 }}>
              <span style={{ background:sc(selectedQuote.status).bg, color:sc(selectedQuote.status).color, padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, textTransform:'capitalize' }}>{selectedQuote.status}</span>
              <span style={{ fontSize:13, color:'#475569' }}>#{selectedQuote.quote_number}</span>
            </div>
            <h1 style={{ margin:0,fontSize:26,fontWeight:800,color:'#f1f5f9' }}>{selectedQuote.title}</h1>
            <p style={{ margin:'4px 0 0',fontSize:14,color:'#64748b' }}>{selectedQuote.client_name}</p>
          </div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            {selectedQuote.status === 'draft' && (
              <>
                <button onClick={() => handleUpdateStatus('sent')} style={{ padding:'8px 16px',background:'#fbbf24',color:'#000',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>Mark as Sent</button>
                <button onClick={() => sendQuoteForApproval(selectedQuote)} disabled={sendingQuote===selectedQuote.id} style={{ padding:'8px 16px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:sendingQuote===selectedQuote.id?0.7:1 }}>
                  {sendingQuote===selectedQuote.id?'Sending…':'📧 Send for Approval'}
                </button>
              </>
            )}
            {selectedQuote.status === 'sent' && (
              <button onClick={() => {
                const url = `https://phllandcare.github.io/phl-crm/#/portal?quote=${selectedQuote.id}`
                navigator.clipboard.writeText(url).then(()=>showQToast('✅ Portal link copied!')).catch(()=>showQToast('Link: '+url))
              }} style={{ padding:'8px 16px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,fontSize:13,cursor:'pointer',fontFamily:'inherit',color:'#94a3b8' }}>
                🔗 Copy Approval Link
              </button>
            )}
            {selectedQuote.status === 'sent' && (
              <>
                <button onClick={() => handleUpdateStatus('approved')} style={{ padding:'8px 16px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>Approve</button>
                <button onClick={() => handleUpdateStatus('declined')} style={{ padding:'8px 16px',background:'rgba(248,113,113,0.15)',color:'#f87171',border:'1px solid rgba(248,113,113,0.3)',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>Decline</button>
              </>
            )}
            {selectedQuote.status === 'approved' && (
              <button onClick={() => navigate('/jobs', { state:{ openCreate:true, clientName:selectedQuote.client_name } })} style={{ padding:'8px 16px',background:'#3b82f6',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>Convert to Job</button>
            )}
            <button onClick={() => handleArchive(selectedQuote.id)} style={{ padding:'8px 16px',background:'rgba(248,113,113,0.1)',color:'#f87171',border:'1px solid rgba(248,113,113,0.3)',borderRadius:8,fontSize:13,cursor:'pointer',fontFamily:'inherit' }}>Archive</button>
          </div>
        </div>

        <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
          {/* Quote Info */}
          <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem' }}>
            <h3 style={{ margin:'0 0 16px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>Quote Details</h3>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 32px' }}>
              {[
                { label:'Client', value:selectedQuote.client_name },
                { label:'Quote #', value:`#${selectedQuote.quote_number}` },
                { label:'Salesperson', value:selectedQuote.salesperson || 'Romy Cruz' },
                { label:'Status', value:selectedQuote.status },
                { label:'Created', value:fmtDate(selectedQuote.created_at) },
                { label:'Last Updated', value:fmtDate(selectedQuote.updated_at) },
                { label:'Irrigation', value:selectedQuote.irrigation || 'No' },
                { label:'Pest Control', value:selectedQuote.pest_control || 'No' },
              ].map(row => (
                <div key={row.label} style={{ borderBottom:'1px solid #1e293b',paddingBottom:10 }}>
                  <p style={{ margin:'0 0 2px',fontSize:11,color:'#475569',fontWeight:600 }}>{row.label}</p>
                  <p style={{ margin:0,fontSize:13,color:'#f1f5f9',textTransform:row.label==='Status'?'capitalize':'none' }}>{row.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Line Items */}
          <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem' }}>
            <h3 style={{ margin:'0 0 16px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>Product / Service</h3>
            {lineItems.length === 0 ? (
              <p style={{ color:'#475569',fontSize:13 }}>No line items</p>
            ) : (
              <table style={{ width:'100%',borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #1e293b' }}>
                    {['Item','Description','Qty','Unit Price','Total'].map(h => (
                      <th key={h} style={{ padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid #1e293b' }}>
                      <td style={{ padding:'10px 12px',fontSize:13,color:'#f1f5f9',fontWeight:600 }}>{item.name}</td>
                      <td style={{ padding:'10px 12px',fontSize:12,color:'#64748b' }}>{item.description || '—'}</td>
                      <td style={{ padding:'10px 12px',fontSize:13,color:'#f1f5f9' }}>{item.qty}</td>
                      <td style={{ padding:'10px 12px',fontSize:13,color:'#f1f5f9' }}>{fmt(item.unit_price)}</td>
                      <td style={{ padding:'10px 12px',fontSize:13,color:'#4ade80',fontWeight:700 }}>{fmt(item.qty * item.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {/* Totals */}
            <div style={{ marginTop:12,paddingTop:12,borderTop:'1px solid #1e293b',display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end' }}>
              <div style={{ display:'flex',gap:32 }}><span style={{ fontSize:13,color:'#64748b' }}>Subtotal</span><span style={{ fontSize:13,color:'#f1f5f9' }}>{fmt(sub)}</span></div>
              {(selectedQuote.discount || 0) > 0 && <div style={{ display:'flex',gap:32 }}><span style={{ fontSize:13,color:'#64748b' }}>Discount</span><span style={{ fontSize:13,color:'#f87171' }}>-{fmt(selectedQuote.discount || 0)}</span></div>}
              {(selectedQuote.tax || 0) > 0 && <div style={{ display:'flex',gap:32 }}><span style={{ fontSize:13,color:'#64748b' }}>Tax</span><span style={{ fontSize:13,color:'#f1f5f9' }}>{fmt(selectedQuote.tax || 0)}</span></div>}
              <div style={{ display:'flex',gap:32,borderTop:'1px solid #1e293b',paddingTop:8,marginTop:4 }}><span style={{ fontSize:15,fontWeight:700,color:'#f1f5f9' }}>Total</span><span style={{ fontSize:18,fontWeight:800,color:'#4ade80' }}>{fmt(selectedQuote.amount || 0)}</span></div>
            </div>
          </div>

          {/* Contract */}
          {selectedQuote.contract_text && (
            <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem' }}>
              <h3 style={{ margin:'0 0 12px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>Contract / Disclaimer</h3>
              <p style={{ margin:0,fontSize:13,color:'#cbd5e1' }}>{selectedQuote.contract_text}</p>
            </div>
          )}

          {/* Notes */}
          <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem' }}>
            <h3 style={{ margin:'0 0 12px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>Notes</h3>
            {selectedQuote.internal_notes && <p style={{ margin:'0 0 12px',fontSize:13,color:'#cbd5e1',background:'#1e293b',borderRadius:8,padding:'10px 12px' }}>{selectedQuote.internal_notes}</p>}
            <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Leave an internal note for yourself or a team member..." style={{ ...inp, height:80, resize:'vertical' } as React.CSSProperties} />
            <button onClick={async () => {
              if (!newNote.trim() || !selectedQuote) return
              const updated = (selectedQuote.internal_notes || '') + (selectedQuote.internal_notes ? '\n\n' : '') + new Date().toLocaleString() + '\n' + newNote
              await supabase.from('quotes').update({ internal_notes: updated, updated_at: new Date().toISOString() }).eq('id', selectedQuote.id)
              setSelectedQuote({ ...selectedQuote, internal_notes: updated })
              setNewNote('')
            }} style={{ marginTop:8,padding:'8px 16px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>Save Note</button>
          </div>
        </div>
      </div>
    )
  }

  // ── QUOTES LIST VIEW ──
  return (
    <div style={{ padding: '2rem', background: '#0a0f1a', minHeight: '100vh' }}>
      <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12 }}>
        <div>
          <h1 style={{ fontSize:28,fontWeight:800,color:'#f1f5f9',margin:'0 0 2px' }}>Quotes</h1>
          <p style={{ fontSize:13,color:'#64748b',margin:0 }}>{quotes.length} total quotes</p>
        </div>
        <button onClick={() => setShowTemplateModal(true)} style={{ background:'#16a34a',color:'#fff',border:'none',borderRadius:9,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer' }}>New Quote</button>
      </div>

      {/* Stats - clickable */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:'1.5rem' }}>
        {[
          { label:'Draft', val:draftCount, filter:'draft', color:'#94a3b8' },
          { label:'Awaiting response', val:sentCount, sub:fmt(sentValue), filter:'sent', color:'#fbbf24' },
          { label:'Changes requested', val:changesCount, filter:'changes_requested', color:'#fb923c' },
          { label:'Approved', val:approvedCount, sub:fmt(approvedValue), filter:'approved', color:'#4ade80' },
          { label:'Total quotes', val:quotes.length, filter:'All', color:'#60a5fa' },
        ].map((s, i) => (
          <div key={i} onClick={() => setStatusFilter(s.filter)}
            style={{ background:'#0f172a',border:`1px solid #1e293b`,borderTop:`3px solid ${s.color}`,borderRadius:14,padding:'1rem 1.25rem',cursor:'pointer',transition:'background .1s' }}
            onMouseEnter={e=>(e.currentTarget.style.background='#111c2d')} onMouseLeave={e=>(e.currentTarget.style.background='#0f172a')}>
            <p style={{ margin:'0 0 2px',fontSize:11,color:s.color,fontWeight:700 }}>{s.label}</p>
            <span style={{ fontSize:26,fontWeight:800,color:'#f1f5f9' }}>{s.val}</span>
            {(s as any).sub && <p style={{ margin:'2px 0 0',fontSize:11,color:'#4ade80' }}>{(s as any).sub}</p>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center' }}>
        <div style={{ position:'relative',flex:1,minWidth:200 }}>
          <input placeholder="Search quotes..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp,paddingLeft:32,height:38 }} />
          <span style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#475569' }}>🔍</span>
        </div>
        {['All','draft','sent','approved','declined'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            padding:'7px 14px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
            background:statusFilter===s?'rgba(74,222,128,0.15)':'#0f172a',
            color:statusFilter===s?'#4ade80':'#64748b',
            border:statusFilter===s?'1px solid rgba(74,222,128,0.3)':'1px solid #1e293b',
            textTransform:'capitalize',
          }}>{s}</button>
        ))}
        <p style={{ margin:0,fontSize:12,color:'#475569' }}>{filtered.length} results</p>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign:'center',padding:'3rem',color:'#475569' }}>Loading...</div>
      ) : (
        <div style={{ background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',overflow:'hidden' }}>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e293b',background:'#0d1526' }}>
                {['Client','Quote #','Property','Created','Status','Total'].map(h => (
                  <th key={h} style={{ padding:'10px 14px',textAlign:'left',fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding:'3rem',textAlign:'center',color:'#475569',fontSize:13 }}>No quotes found</td></tr>
              ) : filtered.map(q => (
                <tr key={q.id} onClick={() => openQuote(q)}
                  style={{ borderBottom:'1px solid #1e293b',cursor:'pointer' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.03)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <td style={{ padding:'12px 14px',fontSize:13,color:'#f1f5f9',fontWeight:600 }}>{q.client_name || '—'}</td>
                  <td style={{ padding:'12px 14px' }}>
                    <p style={{ margin:'0 0 2px',fontSize:13,color:'#4ade80',fontWeight:700 }}>#{q.quote_number}</p>
                    <p style={{ margin:0,fontSize:11,color:'#64748b' }}>{q.title}</p>
                  </td>
                  <td style={{ padding:'12px 14px',fontSize:12,color:'#64748b' }}>—</td>
                  <td style={{ padding:'12px 14px',fontSize:12,color:'#64748b' }}>{fmtDate(q.created_at)}</td>
                  <td style={{ padding:'12px 14px' }}>
                    <span style={{ background:sc(q.status).bg,color:sc(q.status).color,padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:700,textTransform:'capitalize' }}>
                      {q.status === 'sent' ? 'Awaiting response' : q.status}
                    </span>
                  </td>
                  <td style={{ padding:'12px 14px',fontSize:13,color:'#4ade80',fontWeight:700 }}>{fmt(q.amount || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TEMPLATE PICKER MODAL ── */}
      {/* ── DUPLICATE QUOTE MODAL ── */}
      {showDuplicateModal && duplicateQuotes.length > 0 && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:500 }} onClick={() => setShowDuplicateModal(false)} />
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:520,maxHeight:'80vh',overflowY:'auto',background:'#0d1526',border:'1px solid #f59e0b',borderRadius:16,zIndex:501,padding:24,boxShadow:'0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:16 }}>
              <span style={{ fontSize:24 }}>⚠️</span>
              <div>
                <h2 style={{ margin:0,fontSize:16,fontWeight:700,color:'#f1f5f9' }}>Existing Quote Found</h2>
                <p style={{ margin:0,fontSize:12,color:'#94a3b8' }}>This client already has {duplicateQuotes.length} quote{duplicateQuotes.length>1?'s':''} on file</p>
              </div>
            </div>
            <div style={{ border:'1px solid #1e293b',borderRadius:10,overflow:'hidden',marginBottom:16 }}>
              {duplicateQuotes.map((q, i) => (
                <div key={q.id} style={{ padding:'14px 16px',borderBottom:i<duplicateQuotes.length-1?'1px solid #1e293b':'none',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                  <div>
                    <p style={{ margin:'0 0 2px',fontSize:13,fontWeight:700,color:'#f1f5f9' }}>
                      Quote #{q.quote_number} — {q.title || 'Untitled'}
                    </p>
                    <p style={{ margin:0,fontSize:11,color:'#64748b' }}>
                      Created {new Date(q.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} · 
                      <span style={{ marginLeft:4,fontWeight:600, color: q.status==='approved'?'#4ade80':q.status==='sent'?'#fbbf24':'#94a3b8' }}>{q.status}</span>
                      {q.amount ? ` · $${q.amount.toLocaleString()}` : ''}
                    </p>
                  </div>
                  <button onClick={() => { setShowDuplicateModal(false); setSelectedQuote(q) }}
                    style={{ padding:'6px 14px',background:'rgba(74,222,128,0.1)',border:'1px solid rgba(74,222,128,0.3)',borderRadius:8,color:'#4ade80',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap' }}>
                    Load Quote →
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
              <button onClick={() => setShowDuplicateModal(false)} style={{ padding:'10px 16px',border:'1px solid #334155',borderRadius:9,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>
                Cancel
              </button>
              <button onClick={() => { setShowDuplicateModal(false); setShowTemplateModal(true) }}
                style={{ padding:'10px 20px',border:'none',borderRadius:9,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>
                + Create New Quote Anyway
              </button>
            </div>
          </div>
        </>
      )}

      {showTemplateModal && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:500 }} onClick={() => setShowTemplateModal(false)} />
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:480,background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:501,padding:24 }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
              <h2 style={{ margin:0,fontSize:17,fontWeight:700,color:'#f1f5f9' }}>New quote</h2>
              <button onClick={() => setShowTemplateModal(false)} style={{ background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer' }}>×</button>
            </div>
            <p style={{ margin:'0 0 12px',fontSize:12,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.06em' }}>Use template</p>
            <div style={{ border:'1px solid #1e293b',borderRadius:10,overflow:'hidden',marginBottom:20 }}>
              {QUOTE_TEMPLATES.map((t, i) => (
                <button key={i} onClick={() => handleApplyTemplate(t)}
                  style={{ display:'block',width:'100%',padding:'14px 16px',background:'none',border:'none',borderBottom:i<QUOTE_TEMPLATES.length-1?'1px solid #1e293b':'none',color:'#f1f5f9',fontSize:14,cursor:'pointer',fontFamily:'inherit',textAlign:'left' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:20 }}>
              <div style={{ flex:1,height:1,background:'#1e293b' }} />
              <span style={{ fontSize:12,color:'#475569' }}>or</span>
              <div style={{ flex:1,height:1,background:'#1e293b' }} />
            </div>
            <button onClick={() => { setShowTemplateModal(false); setShowNew(true) }}
              style={{ display:'block',width:'100%',padding:'14px',background:'#16a34a',border:'none',borderRadius:10,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>
              Create New Quote
            </button>
          </div>
        </>
      )}

      {/* ── NEW QUOTE MODAL (Jobber-style) ── */}
      {showNew && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:500 }} onClick={() => setShowNew(false)} />
          <div style={{ position:'fixed',top:0,right:0,width:'min(760px,100vw)',height:'100vh',overflowY:'auto',background:'#0d1526',border:'none',borderLeft:'1px solid #1e293b',zIndex:501 }}>
            {/* Modal header */}
            <div style={{ position:'sticky',top:0,zIndex:10,background:'#0d1526',borderBottom:'1px solid #1e293b',padding:'14px 24px',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <span style={{ fontSize:16 }}>📋</span>
                <h2 style={{ margin:0,fontSize:16,fontWeight:700,color:'#f1f5f9' }}>New Quote</h2>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button onClick={() => setShowNew(false)} style={{ padding:'8px 16px',border:'1px solid #1e293b',borderRadius:8,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
                <button onClick={handleSaveNew} style={{ padding:'8px 16px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Save Quote ▾</button>
              </div>
            </div>

            <div style={{ padding:24 }}>
              {/* Title + Client */}
              <input style={{ ...inp, fontSize:18, fontWeight:700, padding:'12px', marginBottom:16, border:'none', background:'transparent', borderBottom:'1px solid #1e293b', borderRadius:0 }}
                placeholder="Title" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />

              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16 }}>
                <div>
                  <label style={lbl}>Select a client</label>
                  <select style={inp} value={form.client_id} onChange={async e => {
                    const c = clients.find(c => c.id == e.target.value)
                    const clientName = c ? `${c.first_name} ${c.last_name}` : ''
                    setForm({...form, client_id: e.target.value, client_name: clientName})
                    // Check for existing quotes for this client
                    if (clientName) {
                      const { data: existing } = await supabase.from('quotes')
                        .select('id,quote_number,title,status,amount,created_at')
                        .eq('client_name', clientName)
                        .is('deleted_at', null)
                        .order('created_at', { ascending: false })
                        .limit(5)
                      if (existing && existing.length > 0) {
                        setDuplicateQuotes(existing as Quote[])
                        setShowDuplicateModal(true)
                      }
                    }
                  }}>
                    <option value="">Select a client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.company ? ` — ${c.company}` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Quote #</label>
                  <input style={inp} value={String(quotes.reduce((max,q)=>Math.max(max,parseInt((q.quote_number||'0').replace(/\D/g,''))||0),15699)+1)} readOnly />
                </div>
                <div>
                  <label style={lbl}>Salesperson</label>
                  <div style={{ ...inp, display:'flex',alignItems:'center',gap:8 }}>
                    <span style={{ fontSize:11,background:'#1e293b',padding:'2px 8px',borderRadius:99,color:'#94a3b8' }}>Salesperson</span>
                    <input style={{ flex:1,background:'none',border:'none',outline:'none',color:'#f1f5f9',fontSize:13,fontFamily:'inherit' }} value={form.salesperson} onChange={e => setForm({...form, salesperson: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>Irrigation</label>
                  <select style={inp} value={form.irrigation} onChange={e => setForm({...form, irrigation: e.target.value})}>
                    <option>No</option><option>Yes</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Pest Control</label>
                  <select style={inp} value={form.pest_control} onChange={e => setForm({...form, pest_control: e.target.value})}>
                    <option>No</option><option>Yes</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Customize</label>
                  <button onClick={() => setShowCustomField(true)} style={{ padding:'8px 14px',background:'none',border:'1px solid #4ade80',borderRadius:8,color:'#4ade80',cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:700 }}>Add Field</button>
                </div>
              </div>

              {/* Custom fields */}
              {customFields.map((cf, i) => (
                <div key={i} style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}>
                  <span style={{ fontSize:12,color:'#64748b',minWidth:120 }}>{cf.name}</span>
                  <input style={{ ...inp, flex:1 }} value={cf.value} onChange={e => {
                    const updated = [...customFields]; updated[i].value = e.target.value; setCustomFields(updated)
                  }} />
                  <button onClick={() => setCustomFields(customFields.filter((_,idx)=>idx!==i))} style={{ background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:16 }}>×</button>
                </div>
              ))}

              {/* Add section tabs */}
              <div style={{ display:'flex',gap:8,marginBottom:16,borderBottom:'1px solid #1e293b',paddingBottom:12 }}>
                <button style={{ padding:'6px 14px',background:'#0f172a',border:'1px solid #334155',borderRadius:99,color:'#94a3b8',cursor:'pointer',fontSize:12,fontFamily:'inherit' }}>+ Add section</button>
                {['Introduction','Attachments','Images','Reviews','Client message'].map(s => (
                  <button key={s} onClick={() => setActiveSection(activeSection === s ? null : s)}
                    style={{ padding:'6px 14px',background:activeSection===s?'#1e293b':'transparent',border:activeSection===s?'1px solid #334155':'1px solid transparent',borderRadius:99,color:activeSection===s?'#f1f5f9':'#64748b',cursor:'pointer',fontSize:12,fontFamily:'inherit' }}>
                    {s}
                  </button>
                ))}
              </div>
              {activeSection === 'Client message' && (
                <div style={{ marginBottom:16 }}>
                  <label style={lbl}>Message to client</label>
                  <textarea style={{ ...inp,height:80,resize:'vertical' } as React.CSSProperties} value={form.message} onChange={e => setForm({...form, message: e.target.value})} placeholder="Add a message to your client..." />
                </div>
              )}

              {/* Product / Service section */}
              <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem',marginBottom:16 }}>
                <h3 style={{ margin:'0 0 16px',fontSize:15,fontWeight:700,color:'#f1f5f9' }}>Product / Service</h3>
                {newLineItems.map((item, i) => (
                  <div key={i} style={{ borderBottom:'1px solid #1e293b',paddingBottom:16,marginBottom:16 }}>
                    <div style={{ display:'grid',gridTemplateColumns:'::::::⠒⠒⠒⠒⠒⠒⠒⠒2fr 1fr 1fr auto',gap:8,marginBottom:8 }}>
                      <div style={{ display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,width:'100%' }}>
                        <div style={{ position:'relative' }}>
                          <input style={inp} placeholder="Name" value={item.name} onChange={e => updateLineItem(i, 'name', e.target.value)} />
                        </div>
                        <input style={inp} placeholder="Quantity" type="number" min="1" value={item.qty} onChange={e => updateLineItem(i,'qty',parseFloat(e.target.value)||1)} />
                        <input style={inp} placeholder="Unit price" type="number" min="0" value={item.unit_price} onChange={e => updateLineItem(i,'unit_price',parseFloat(e.target.value)||0)} />
                        <div style={{ fontSize:13,color:'#4ade80',fontWeight:700,padding:'9px 4px',whiteSpace:'nowrap' }}>{fmt(item.qty*item.unit_price)}</div>
                      </div>
                    </div>
                    <div style={{ display:'grid',gridTemplateColumns:'1fr auto',gap:8,alignItems:'start' }}>
                      <textarea style={{ ...inp,height:60,resize:'vertical' } as React.CSSProperties} placeholder="Description" value={item.description} onChange={e => updateLineItem(i,'description',e.target.value)} />
                      <div style={{ width:80,height:60,border:'1px dashed #334155',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#475569',cursor:'pointer',fontSize:18 }}>🖼️</div>
                    </div>
                    <div style={{ display:'flex',alignItems:'center',gap:12,marginTop:8 }}>
                      <label style={{ display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#94a3b8',cursor:'pointer' }}>
                        <input type="checkbox" checked={item.is_optional || false} onChange={e => updateLineItem(i,'is_optional',e.target.checked)} /> Mark as optional
                      </label>
                      {newLineItems.length > 1 && (
                        <button onClick={() => removeLineItem(i)} style={{ background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:12,fontFamily:'inherit' }}>Remove</button>
                      )}
                    </div>
                  </div>
                ))}
                {/* Buttons */}
                <div style={{ display:'flex',gap:8,marginBottom:24 }}>
                  <button onClick={addLineItem}
                    style={{ padding:'8px 16px',background:'#16a34a',border:'none',borderRadius:8,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>
                    Add Line Item
                  </button>
                  <div style={{ position:'relative' }}>
                    <button onClick={() => setShowServicePicker(v => !v)}
                      style={{ padding:'8px 16px',background:'none',border:'1px solid #334155',borderRadius:8,color:'#94a3b8',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>
                      Add Text
                    </button>
                  </div>
                </div>

                {/* Totals */}
                <div style={{ borderTop:'1px solid #1e293b',paddingTop:16 }}>
                  <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:4 }}>
                    <span style={{ fontSize:13,color:'#475569',flex:1,textAlign:'left' }}>👁 Client view</span>
                    <button style={{ color:'#4ade80',fontSize:12,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit' }}>Change</button>
                  </div>
                  <div style={{ display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end',marginTop:12 }}>
                    <div style={{ display:'flex',justifyContent:'space-between',width:'100%',maxWidth:320 }}>
                      <span style={{ fontSize:13,color:'#64748b' }}>Subtotal</span>
                      <span style={{ fontSize:13,color:'#f1f5f9' }}>{fmt(calcSubtotal(newLineItems))}</span>
                    </div>
                    <div style={{ display:'flex',justifyContent:'space-between',width:'100%',maxWidth:320,alignItems:'center' }}>
                      <span style={{ fontSize:13,color:'#64748b' }}>Discount</span>
                      <div style={{ display:'flex',gap:6,alignItems:'center' }}>
                        <input type="number" style={{ ...inp,width:80,padding:'4px 8px' }} value={form.discount} onChange={e => setForm({...form,discount:parseFloat(e.target.value)||0})} placeholder="0" />
                        <select style={{ ...inp,width:80,padding:'4px 8px' }} value={form.discount_type} onChange={e => setForm({...form,discount_type:e.target.value})}>
                          <option value="percent">%</option>
                          <option value="fixed">$</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display:'flex',justifyContent:'space-between',width:'100%',maxWidth:320,alignItems:'center' }}>
                      <span style={{ fontSize:13,color:'#64748b' }}>Tax</span>
                      <div style={{ display:'flex',gap:6,alignItems:'center' }}>
                        <input type="number" style={{ ...inp,width:80,padding:'4px 8px' }} value={form.tax} onChange={e => setForm({...form,tax:parseFloat(e.target.value)||0})} placeholder="0" />
                        <span style={{ fontSize:12,color:'#64748b' }}>%</span>
                      </div>
                    </div>
                    <div style={{ display:'flex',justifyContent:'space-between',width:'100%',maxWidth:320,borderTop:'2px solid #1e293b',paddingTop:8,marginTop:4 }}>
                      <span style={{ fontSize:15,fontWeight:700,color:'#f1f5f9' }}>Total</span>
                      <span style={{ fontSize:18,fontWeight:800,color:'#4ade80' }}>{fmt(calcTotal(newLineItems))}</span>
                    </div>
                    <button style={{ fontSize:12,color:'#4ade80',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',textDecoration:'underline' }}>Add Deposit or Payment Schedule</button>
                  </div>
                </div>
              </div>

              {/* Contract / Disclaimer */}
              <div style={{ background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem',marginBottom:16,position:'relative' }}>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
                  <h3 style={{ margin:0,fontSize:15,fontWeight:700,color:'#f1f5f9' }}>Contract / Disclaimer</h3>
                  <button style={{ background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:16 }}>🗑️</button>
                </div>
                <textarea style={{ ...inp,height:80,resize:'vertical' } as React.CSSProperties}
                  value={form.contract_text} onChange={e => setForm({...form, contract_text: e.target.value})} />
                <label style={{ display:'flex',alignItems:'center',gap:8,marginTop:8,fontSize:12,color:'#94a3b8',cursor:'pointer' }}>
                  <input type="checkbox" /> Apply to all future quotes
                </label>
              </div>

              {/* Notes */}
              <div style={{ background:'#0f172a',border:'1px dashed #334155',borderRadius:14,padding:'1.25rem',marginBottom:24 }}>
                <h3 style={{ margin:'0 0 12px',fontSize:15,fontWeight:700,color:'#f1f5f9' }}>Notes</h3>
                <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'1.5rem',color:'#475569' }}>
                  <span style={{ fontSize:28 }}>📋</span>
                  <textarea style={{ ...inp,height:80,resize:'vertical',border:'none',background:'transparent',textAlign:'center' } as React.CSSProperties}
                    placeholder="Leave an internal note for yourself or a team member"
                    value={form.internal_notes} onChange={e => setForm({...form, internal_notes: e.target.value})} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── SERVICE PICKER ── */}
      {showServicePicker && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.3)',zIndex:600 }} onClick={() => setShowServicePicker(false)} />
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:440,maxHeight:'70vh',overflowY:'auto',background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:601 }}>
            <div style={{ padding:'14px 16px',borderBottom:'1px solid #1e293b',position:'sticky',top:0,background:'#0d1526' }}>
              <input style={{ ...inp,fontSize:13 }} placeholder="Search services..." value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} autoFocus />
            </div>
            <div style={{ padding:'8px 0' }}>
              <p style={{ margin:'0 0 4px',padding:'4px 16px',fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.06em' }}>Services</p>
              {filteredServices.map((s, i) => (
                <button key={i} onClick={() => addServiceFromPicker(s)}
                  style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',width:'100%',padding:'10px 16px',background:'none',border:'none',color:'#f1f5f9',cursor:'pointer',fontFamily:'inherit',textAlign:'left' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                  <div>
                    <p style={{ margin:'0 0 2px',fontSize:13,fontWeight:700 }}>{s.name}</p>
                    {s.description && <p style={{ margin:0,fontSize:11,color:'#64748b' }}>{s.description.slice(0,80)}{s.description.length>80?'...':''}</p>}
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
            <input style={{ ...inp,marginBottom:12 }} placeholder="e.g. HOA Approval" value={customFieldForm.name} onChange={e => setCustomFieldForm({...customFieldForm, name: e.target.value})} />
            <label style={lbl}>Value</label>
            <input style={{ ...inp,marginBottom:20 }} placeholder="Field value" value={customFieldForm.value} onChange={e => setCustomFieldForm({...customFieldForm, value: e.target.value})} />
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
              <button onClick={() => setShowCustomField(false)} style={{ padding:'9px 18px',border:'1px solid #1e293b',borderRadius:8,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
              <button onClick={() => {
                if (customFieldForm.name) {
                  setCustomFields([...customFields, { name:customFieldForm.name, value:customFieldForm.value }])
                  setCustomFieldForm({ name:'', value:'' })
                  setShowCustomField(false)
                }
              }} style={{ padding:'9px 18px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Add Field</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
