import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface LineItem {
  id?: number
  quote_id?: number
  name: string
  description: string
  qty: number
  unit_price: number
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
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
  sent: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  approved: { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' },
  declined: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  archived: { bg: 'rgba(100,116,139,0.1)', color: '#64748b' },
}

export default function QuotesPage() {
  const navigate = useNavigate()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [showNew, setShowNew] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  // editMode removed
  const [newNote, setNewNote] = useState('')
  const [form, setForm] = useState({
    client_id: '', client_name: '', title: '', message: '', status: 'draft'
  })
  const [newLineItems, setNewLineItems] = useState<LineItem[]>([
    { name: '', description: '', qty: 1, unit_price: 0 }
  ])

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

  const openQuote = (q: Quote) => {
    setSelectedQuote(q)
    
    navigate('/quotes/' + q.id)
  }

  const calcTotal = (items: LineItem[]) => items.reduce((sum, i) => sum + (i.qty * i.unit_price), 0)

  const handleSaveNew = async () => {
    if (!form.title || !form.client_name) return
    const total = calcTotal(newLineItems)
    const quoteNum = 'Q-' + String(quotes.length + 1).padStart(4, '0')
    const { data: q } = await supabase.from('quotes').insert({
      quote_number: quoteNum,
      client_id: form.client_id ? parseInt(form.client_id) : null,
      client_name: form.client_name,
      title: form.title,
      message: form.message,
      status: form.status,
      amount: total,
      updated_at: new Date().toISOString()
    }).select().single()
    if (q && newLineItems.length > 0) {
      await supabase.from('quote_line_items').insert(
        newLineItems.filter(i => i.name).map(i => ({ ...i, quote_id: q.id }))
      )
    }
    setShowNew(false)
    setForm({ client_id: '', client_name: '', title: '', message: '', status: 'draft' })
    setNewLineItems([{ name: '', description: '', qty: 1, unit_price: 0 }])
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
    navigate('/quotes')
    loadQuotes()
  }

  const addLineItem = () => setNewLineItems([...newLineItems, { name: '', description: '', qty: 1, unit_price: 0 }])
  const removeLineItem = (i: number) => setNewLineItems(newLineItems.filter((_, idx) => idx !== i))
  const updateLineItem = (i: number, field: keyof LineItem, value: any) => {
    const updated = [...newLineItems]
    updated[i] = { ...updated[i], [field]: value }
    setNewLineItems(updated)
  }

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
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

  const sc = (s: string) => STATUS_COLORS[s?.toLowerCase()] || STATUS_COLORS.draft
  const filtered = quotes.filter(q => {
    const matchSearch = `${q.quote_number} ${q.client_name} ${q.title}`.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' ? true : q.status?.toLowerCase() === statusFilter.toLowerCase()
    return matchSearch && matchStatus
  })

  const draftCount = quotes.filter(q => q.status === 'draft').length
  const sentCount = quotes.filter(q => q.status === 'sent').length
  const approvedCount = quotes.filter(q => q.status === 'approved').length
  const approvedValue = quotes.filter(q => q.status === 'approved').reduce((a, q) => a + (q.amount || 0), 0)
  const sentValue = quotes.filter(q => q.status === 'sent').reduce((a, q) => a + (q.amount || 0), 0)

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #1e293b', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#0f172a', color: '#f1f5f9', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }

  // ── QUOTE DETAIL VIEW ──
  if (selectedQuote) {
    return (
      <div style={{ padding: '2rem', background: '#0a0f1a', minHeight: '100vh' }}>
        <button onClick={() => { setSelectedQuote(null); navigate('/quotes') }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16 }}>
          ← Back to Quotes
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ background: sc(selectedQuote.status).bg, color: sc(selectedQuote.status).color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>{selectedQuote.status}</span>
              <span style={{ fontSize: 13, color: '#475569' }}>{selectedQuote.quote_number}</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#f1f5f9' }}>{selectedQuote.title}</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>{selectedQuote.client_name}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {selectedQuote.status === 'draft' && (
              <button onClick={() => handleUpdateStatus('sent')} style={{ padding: '8px 16px', background: '#fbbf24', color: '#000', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Mark as Sent</button>
            )}
            {selectedQuote.status === 'sent' && (
              <>
                <button onClick={() => handleUpdateStatus('approved')} style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Approve</button>
                <button onClick={() => handleUpdateStatus('declined')} style={{ padding: '8px 16px', background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Decline</button>
              </>
            )}
            <button onClick={() => handleArchive(selectedQuote.id)} style={{ padding: '8px 16px', background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Archive</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Quote Info */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Quote Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 32px' }}>
              {[
                { label: 'Client', value: selectedQuote.client_name },
                { label: 'Quote #', value: selectedQuote.quote_number },
                { label: 'Status', value: selectedQuote.status },
                { label: 'Created', value: fmtDate(selectedQuote.created_at) },
                { label: 'Last Updated', value: fmtDate(selectedQuote.updated_at) },
                { label: 'Total', value: fmt(selectedQuote.amount || 0) },
              ].map(row => (
                <div key={row.label} style={{ borderBottom: '1px solid #1e293b', paddingBottom: 10 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 11, color: '#475569', fontWeight: 600 }}>{row.label}</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#f1f5f9', textTransform: row.label === 'Status' ? 'capitalize' : 'none' }}>{row.value}</p>
                </div>
              ))}
            </div>
            {selectedQuote.message && (
              <div style={{ marginTop: 12 }}>
                <p style={{ margin: '0 0 4px', fontSize: 11, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Message</p>
                <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1' }}>{selectedQuote.message}</p>
              </div>
            )}
          </div>

          {/* Line Items */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Line Items</h3>
            {lineItems.length === 0 ? (
              <p style={{ color: '#475569', fontSize: 13 }}>No line items</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e293b' }}>
                    {['Item', 'Description', 'Qty', 'Unit Price', 'Total'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{item.name}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>{item.description || '—'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#f1f5f9' }}>{item.qty}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#f1f5f9' }}>{fmt(item.unit_price)}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#4ade80', fontWeight: 700 }}>{fmt(item.qty * item.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ borderTop: '1px solid #1e293b', marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 32 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#4ade80' }}>{fmt(selectedQuote.amount || 0)}</span>
            </div>
          </div>

          {/* Notes */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Notes</h3>
            <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add an internal note..." style={{ ...inp, height: 80, resize: 'vertical' } as React.CSSProperties} />
            <button onClick={() => setNewNote('')} style={{ marginTop: 8, padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Save Note</button>
          </div>
        </div>
      </div>
    )
  }

  // ── QUOTES LIST VIEW ──
  return (
    <div style={{ padding: '2rem', background: '#0a0f1a', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', margin: '0 0 2px' }}>Quotes</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{quotes.length} total quotes</p>
        </div>
        <button onClick={() => setShowNew(true)} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ New Quote</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: '1.5rem' }}>
        {[
          { label: 'Draft', val: draftCount, sub: 'quotes' },
          { label: 'Awaiting response', val: sentCount, sub: fmt(sentValue) },
          { label: 'Approved', val: approvedCount, sub: fmt(approvedValue) },
          { label: 'Total quotes', val: quotes.length, sub: 'all time' },
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
          <input placeholder="Search quotes..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, paddingLeft: 32, height: 38 }} />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }}>🔍</span>
        </div>
        {['All', 'Draft', 'Sent', 'Approved', 'Declined'].map(s => (
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
                {['Quote #', 'Client', 'Title', 'Amount', 'Status', 'Created', 'Last Activity', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#475569', fontSize: 13 }}>No quotes found</td></tr>
              ) : filtered.map(q => (
                <tr key={q.id} onClick={() => openQuote(q)}
                  style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{q.quote_number || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{q.client_name || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#cbd5e1' }}>{q.title}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#4ade80', fontWeight: 700 }}>{fmt(q.amount || 0)}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ background: sc(q.status).bg, color: sc(q.status).color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>{q.status}</span>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>{fmtDate(q.created_at)}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>{fmtTime(q.updated_at || q.created_at)}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <button onClick={e => { e.stopPropagation(); handleArchive(q.id) }} style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Archive</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Quote Modal */}
      {showNew && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500 }} onClick={() => setShowNew(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 620, maxHeight: '90vh', overflowY: 'auto', background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 501, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>New Quote</h2>
              <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            <p style={lbl as any}>Client</p>
            <select style={{ ...inp, marginBottom: 12 }} value={form.client_id} onChange={e => {
              const c = clients.find(c => c.id == e.target.value)
              setForm({ ...form, client_id: e.target.value, client_name: c ? `${c.first_name} ${c.last_name}` : '' })
            }}>
              <option value="">Select a client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.company ? ` — ${c.company}` : ''}</option>)}
            </select>

            <p style={lbl as any}>Quote Title *</p>
            <input style={{ ...inp, marginBottom: 12 }} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Lawn maintenance proposal" />

            <p style={lbl as any}>Message to client</p>
            <textarea style={{ ...inp, height: 80, resize: 'vertical', marginBottom: 16 } as React.CSSProperties} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Add a message..." />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ ...lbl, margin: 0 } as any}>Line Items</p>
              <button onClick={addLineItem} style={{ background: 'none', border: '1px solid #1e293b', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#4ade80', cursor: 'pointer', fontFamily: 'inherit' }}>+ Add Item</button>
            </div>
            {newLineItems.map((item, i) => (
              <div key={i} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 6 }}>
                  <input style={inp} placeholder="Item name" value={item.name} onChange={e => updateLineItem(i, 'name', e.target.value)} />
                  <input style={inp} placeholder="Qty" type="number" min="1" value={item.qty} onChange={e => updateLineItem(i, 'qty', parseFloat(e.target.value) || 1)} />
                  <input style={inp} placeholder="Unit price" type="number" min="0" value={item.unit_price} onChange={e => updateLineItem(i, 'unit_price', parseFloat(e.target.value) || 0)} />
                  <button onClick={() => removeLineItem(i)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
                <input style={inp} placeholder="Description (optional)" value={item.description} onChange={e => updateLineItem(i, 'description', e.target.value)} />
                <p style={{ margin: '6px 0 0', fontSize: 11, color: '#4ade80', textAlign: 'right' }}>Subtotal: {fmt(item.qty * item.unit_price)}</p>
              </div>
            ))}
            <div style={{ background: '#1e293b', borderRadius: 8, padding: '10px 12px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#4ade80' }}>{fmt(calcTotal(newLineItems))}</span>
            </div>

            <p style={lbl as any}>Status</p>
            <select style={{ ...inp, marginBottom: 20 }} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {['draft', 'sent', 'approved', 'declined'].map(s => <option key={s}>{s}</option>)}
            </select>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNew(false)} style={{ padding: '10px 20px', border: '1px solid #1e293b', borderRadius: 9, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleSaveNew} style={{ padding: '10px 20px', border: 'none', borderRadius: 9, background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>Save Quote</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
