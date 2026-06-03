import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Invoice {
  id: string
  invoice_number: string
  subject: string
  client_name: string
  amount: number
  balance: number
  due_date: string
  issued_date: string
  status: string
  payment_terms: string
  notes: string
  created_at: string
}

interface LineItem {
  name: string
  description: string
  qty: number
  unit_price: number
}

const STATUS_STYLE: Record<string, {bg:string;color:string;dot:string}> = {
  'Past due':  {bg:'#450a0a', color:'#fca5a5', dot:'#ef4444'},
  'overdue':   {bg:'#450a0a', color:'#fca5a5', dot:'#ef4444'},
  'paid':      {bg:'#052e16', color:'#4ade80', dot:'#16a34a'},
  'Paid':      {bg:'#052e16', color:'#4ade80', dot:'#16a34a'},
  'draft':     {bg:'#1e293b', color:'#94a3b8', dot:'#475569'},
  'Draft':     {bg:'#1e293b', color:'#94a3b8', dot:'#475569'},
  'sent':      {bg:'#0c1a2e', color:'#7dd3fc', dot:'#0ea5e9'},
  'Sent':      {bg:'#0c1a2e', color:'#7dd3fc', dot:'#0ea5e9'},
  'partial':   {bg:'#1a1000', color:'#fcd34d', dot:'#d97706'},
}

const inp = {width:'100%',padding:'10px 14px',background:'#1a2332',border:'1px solid #2d3f55',borderRadius:8,fontSize:14,boxSizing:'border-box' as const,outline:'none',color:'#f1f5f9',fontFamily:'inherit'}
const lbl = {fontSize:12,fontWeight:600 as const,color:'#94a3b8',textTransform:'uppercase' as const,letterSpacing:'0.04em',display:'block',marginBottom:6}

function statusBadge(status:string) {
  const s = STATUS_STYLE[status] || {bg:'#1e293b',color:'#94a3b8',dot:'#475569'}
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5,background:s.bg,color:s.color,padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:700}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:s.dot,display:'inline-block'}} />
      {status}
    </span>
  )
}

export default function InvoicesPage() {
  const [invoices, setInvoices]   = useState<Invoice[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [showNew, setShowNew]     = useState(false)
  const [showBatch, setShowBatch] = useState(false)
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const batchRef = useRef<HTMLDivElement>(null)

  // New invoice form state
  const [subject, setSubject]             = useState('For Services Rendered')
  const [clientSearch, setClientSearch]   = useState('')
  const [clientSuggestions, setClientSuggestions] = useState<{id:string;name:string}[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [invoiceNum, setInvoiceNum]       = useState('')
  const [paymentTerms, setPaymentTerms]   = useState('Net 7')
  const [irrigation, setIrrigation]       = useState('No')
  const [pestControl, setPestControl]     = useState('No')
  const [invoiceTitle, setInvoiceTitle]   = useState('')
  const [lineItems, setLineItems]         = useState<LineItem[]>([{name:'',description:'',qty:1,unit_price:0}])
  const [discount, setDiscount]           = useState(0)
  const [taxPct, setTaxPct]              = useState(0)
  const [contractNote, setContractNote]   = useState('Thank you for your business. Please contact us with any questions regarding this invoice.')
  const [internalNote, setInternalNote]   = useState('')
  const [saving, setSaving]               = useState(false)

  const loadInvoices = async () => {
    setLoading(true)
    const { data } = await supabase.from('invoices').select('*').is('deleted_at',null).order('created_at',{ascending:false})
    setInvoices(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadInvoices()
    // Get next invoice number
    supabase.from('invoices').select('invoice_number').order('created_at',{ascending:false}).limit(1).then(({data})=>{
      if (data && data[0]?.invoice_number) {
        const last = parseInt(data[0].invoice_number.replace(/\D/g,''))||16260
        setInvoiceNum(String(last+1))
      } else setInvoiceNum('16261')
    })
    const ch = supabase.channel('invoices').on('postgres_changes',{event:'*',schema:'public',table:'invoices'},loadInvoices).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Client autocomplete
  useEffect(() => {
    if (clientSearch.length < 2) { setClientSuggestions([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('clients').select('id,first_name,last_name,company').ilike('last_name', `%${clientSearch}%`).limit(8)
      setClientSuggestions((data??[]).map((c:any) => ({id:c.id, name:[c.first_name,c.last_name,c.company?`(${c.company})`:''].filter(Boolean).join(' ')})))
    }, 250)
    return () => clearTimeout(t)
  }, [clientSearch])

  const subtotal = lineItems.reduce((s,l) => s + l.qty * l.unit_price, 0)
  const discountAmt = discount > 0 ? subtotal * (discount/100) : 0
  const taxAmt = taxPct > 0 ? (subtotal - discountAmt) * (taxPct/100) : 0
  const total = subtotal - discountAmt + taxAmt

  const handleSaveInvoice = async () => {
    if (!selectedClient && !clientSearch) return
    setSaving(true)
    await supabase.from('invoices').insert({
      invoice_number: invoiceNum,
      subject,
      client_name: selectedClient || clientSearch,
      amount: total,
      balance: total,
      status: 'draft',
      payment_terms: paymentTerms,
      notes: internalNote,
      issued_date: new Date().toISOString().slice(0,10),
      due_date: paymentTerms === 'Net 7'  ? new Date(Date.now()+7*86400000).toISOString().slice(0,10)
               : paymentTerms === 'Net 14' ? new Date(Date.now()+14*86400000).toISOString().slice(0,10)
               : paymentTerms === 'Net 30' ? new Date(Date.now()+30*86400000).toISOString().slice(0,10)
               : new Date().toISOString().slice(0,10),
    })
    setSaving(false)
    setShowNew(false)
    resetForm()
    loadInvoices()
  }

  const resetForm = () => {
    setSubject('For Services Rendered'); setClientSearch(''); setSelectedClient('')
    setPaymentTerms('Net 7'); setIrrigation('No'); setPestControl('No')
    setInvoiceTitle(''); setLineItems([{name:'',description:'',qty:1,unit_price:0}])
    setDiscount(0); setTaxPct(0)
    setContractNote('Thank you for your business. Please contact us with any questions regarding this invoice.')
    setInternalNote('')
  }

  const handleDelete = async (id:string) => {
    if (!confirm('Delete this invoice?')) return
    await supabase.from('invoices').update({deleted_at:new Date().toISOString()}).eq('id',id)
  }

  const toggleSelect = (id:string) => setSelected(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
  })

  const filtered = invoices.filter(i => {
    const matchSearch = `${i.invoice_number||''} ${i.client_name||''} ${i.subject||''} ${i.status||''}`.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' || i.status === statusFilter
    return matchSearch && matchStatus
  })

  const pastDue    = invoices.filter(i=>i.status==='Past due'||i.status==='overdue')
  const pastDueAmt = pastDue.reduce((s,i)=>s+(i.balance||i.amount||0),0)
  const sentNotDue = invoices.filter(i=>i.status==='sent'||i.status==='Sent')
  const sentAmt    = sentNotDue.reduce((s,i)=>s+(i.balance||i.amount||0),0)
  const draftCount = invoices.filter(i=>i.status==='draft'||i.status==='Draft').length

  return (
    <div style={{padding:'2rem',maxWidth:1300,margin:'0 auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <h1 style={{fontSize:26,fontWeight:700,color:'#f1f5f9',margin:0}}>Invoices</h1>
        <div style={{display:'flex',gap:8,alignItems:'center',position:'relative'}}>
          <button onClick={()=>setShowNew(true)}
            style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:'pointer'}}>
            New Invoice
          </button>
          <button onClick={()=>setShowBatch(v=>!v)}
            style={{background:'transparent',color:'#f1f5f9',border:'1.5px solid #334155',borderRadius:8,padding:'10px 14px',fontSize:14,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
            ••• More Actions
          </button>
          {showBatch && (
            <div ref={batchRef} style={{position:'absolute',top:'110%',right:0,background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'6px 0',zIndex:50,minWidth:200,boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
              {[
                {icon:'📋',label:'Batch Create Invoices'},
                {icon:'📧',label:'Batch Deliver Invoices'},
                {icon:'📥',label:'Import Invoice Data'},
              ].map(a=>(
                <button key={a.label} onClick={()=>setShowBatch(false)}
                  style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 16px',background:'none',border:'none',color:'#f1f5f9',fontSize:14,cursor:'pointer',textAlign:'left',fontFamily:'inherit'}}
                  onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')}
                  onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                  <span style={{fontSize:16}}>{a.icon}</span>{a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPI overview row — Jobber style */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:'1.5rem'}}>
        <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.1rem 1.25rem'}}>
          <p style={{fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 8px'}}>Overview</p>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
              <span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:8,height:8,borderRadius:'50%',background:'#ef4444',display:'inline-block'}}/>Past due ({pastDue.length})</span>
              <span style={{fontWeight:700,color:'#fca5a5'}}>${pastDueAmt.toLocaleString()}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
              <span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:8,height:8,borderRadius:'50%',background:'#f59e0b',display:'inline-block'}}/>Sent not due ({sentNotDue.length})</span>
              <span style={{fontWeight:700,color:'#fcd34d'}}>${sentAmt.toLocaleString()}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
              <span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:8,height:8,borderRadius:'50%',background:'#475569',display:'inline-block'}}/>Draft ({draftCount})</span>
              <span style={{fontWeight:700,color:'#94a3b8'}}></span>
            </div>
          </div>
        </div>
        <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.1rem 1.25rem'}}>
          <p style={{fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 4px'}}>Issued (past 30 days)</p>
          <p style={{fontSize:28,fontWeight:800,color:'#f1f5f9',margin:0}}>{invoices.length}</p>
        </div>
        <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.1rem 1.25rem'}}>
          <p style={{fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 4px'}}>Average invoice</p>
          <p style={{fontSize:28,fontWeight:800,color:'#f1f5f9',margin:0}}>
            {invoices.length > 0 ? `$${(invoices.reduce((s,i)=>s+(i.amount||0),0)/invoices.length).toLocaleString('en-US',{maximumFractionDigits:0})}` : '$0'}
          </p>
        </div>
        <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.1rem 1.25rem'}}>
          <p style={{fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 4px'}}>Total Outstanding</p>
          <p style={{fontSize:28,fontWeight:800,color:'#4ade80',margin:0}}>
            ${invoices.filter(i=>i.status!=='paid'&&i.status!=='Paid').reduce((s,i)=>s+(i.balance||i.amount||0),0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filters row */}
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:'1rem',flexWrap:'wrap'}}>
        {/* Status filter */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {['All','Draft','Sent','Past due','paid'].map(s=>(
            <button key={s} onClick={()=>setStatusFilter(s)}
              style={{padding:'6px 14px',borderRadius:20,fontSize:13,fontWeight:600,cursor:'pointer',border:'1.5px solid',
                borderColor: statusFilter===s ? '#4ade80' : '#1e293b',
                background:  statusFilter===s ? '#052e16'  : '#0f172a',
                color:       statusFilter===s ? '#4ade80'  : '#64748b',
              }}>
              {s} {s==='All'?`(${invoices.length})`:s==='Past due'?`(${pastDue.length})`:s==='Draft'?`(${draftCount})`:''}
            </button>
          ))}
        </div>
        {/* Search */}
        <input placeholder="Search invoices..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{...inp,flex:1,minWidth:200,height:40,padding:'0 14px',background:'#0f172a',border:'1.5px solid #1e293b',borderRadius:8}} />
      </div>

      {/* Table */}
      {loading ? <p style={{color:'#64748b'}}>Loading...</p> : (
        <div style={{background:'#0f172a',borderRadius:16,border:'1px solid #1e293b',overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}>
            <thead>
              <tr style={{borderBottom:'1px solid #1e293b',background:'#0a0f1a'}}>
                <th style={{width:40,padding:'11px 14px'}}>
                  <input type="checkbox" onChange={e=>{
                    if(e.target.checked) setSelected(new Set(filtered.map(i=>i.id)))
                    else setSelected(new Set())
                  }} style={{cursor:'pointer'}} />
                </th>
                {['Client','Invoice #','Due Date','Subject','Status','Total','Balance',''].map(h=>(
                  <th key={h} style={{padding:'11px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap',cursor:h?'pointer':'default'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={9} style={{padding:'3rem',textAlign:'center',color:'#475569'}}>No invoices found</td></tr>
              ) : filtered.map((inv,idx)=>(
                <tr key={inv.id}
                  style={{borderBottom:'1px solid #1e293b',background:selected.has(inv.id)?'#0c1e35':idx%2===0?'transparent':'rgba(255,255,255,0.015)',cursor:'pointer'}}
                  onMouseEnter={e=>{if(!selected.has(inv.id))(e.currentTarget as HTMLElement).style.background='#111c2d'}}
                  onMouseLeave={e=>{if(!selected.has(inv.id))(e.currentTarget as HTMLElement).style.background=idx%2===0?'transparent':'rgba(255,255,255,0.015)'}}>
                  <td style={{padding:'12px 14px'}} onClick={e=>e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(inv.id)} onChange={()=>toggleSelect(inv.id)} style={{cursor:'pointer'}} />
                  </td>
                  <td style={{padding:'12px 14px'}}>
                    <span style={{fontSize:14,fontWeight:600,color:'#f1f5f9'}}>{inv.client_name||'—'}</span>
                  </td>
                  <td style={{padding:'12px 14px',fontSize:13,color:'#64748b',fontFamily:'monospace'}}>#{inv.invoice_number||'—'}</td>
                  <td style={{padding:'12px 14px',fontSize:13,color:'#94a3b8',whiteSpace:'nowrap'}}>{inv.due_date||'—'}</td>
                  <td style={{padding:'12px 14px',fontSize:13,color:'#94a3b8',maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{inv.subject||'—'}</td>
                  <td style={{padding:'12px 14px'}}>{statusBadge(inv.status||'draft')}</td>
                  <td style={{padding:'12px 14px',fontSize:14,fontWeight:700,color:'#f1f5f9'}}>${(inv.amount||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                  <td style={{padding:'12px 14px',fontSize:14,fontWeight:700,color:(inv.balance||inv.amount||0)>0?'#fca5a5':'#4ade80'}}>${(inv.balance||inv.amount||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                  <td style={{padding:'12px 14px'}}>
                    <button onClick={()=>handleDelete(inv.id)} style={{background:'#450a0a',color:'#fca5a5',border:'none',borderRadius:6,padding:'4px 10px',fontSize:12,cursor:'pointer',fontWeight:600}}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── NEW INVOICE MODAL ── Jobber style ─────────────────── */}
      {showNew && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'stretch',justifyContent:'center',zIndex:1000,overflowY:'auto'}}>
          <div style={{background:'#111827',width:'100%',maxWidth:900,display:'flex',flexDirection:'column',minHeight:'100vh'}}>

            {/* Modal header bar */}
            <div style={{background:'#0d1526',borderBottom:'1px solid #1e293b',padding:'1rem 1.5rem',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:10}}>
              <span style={{fontSize:20}}>🧾</span>
              <h2 style={{fontSize:17,fontWeight:700,color:'#f1f5f9',margin:0}}>New Invoice</h2>
            </div>

            <div style={{padding:'1.5rem',flex:1,overflowY:'auto'}}>

              {/* Subject */}
              <div style={{marginBottom:'1.25rem'}}>
                <input value={subject} onChange={e=>setSubject(e.target.value)}
                  placeholder="Subject"
                  style={{...inp,fontSize:16,fontWeight:600,background:'#1a2332'}} />
              </div>

              {/* Client + Invoice # row */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:'1.25rem'}}>
                <div style={{position:'relative'}}>
                  <input value={selectedClient||clientSearch}
                    onChange={e=>{ setClientSearch(e.target.value); setSelectedClient('') }}
                    placeholder="Select a client"
                    style={{...inp,border:'2px solid #334155'}} />
                  {clientSuggestions.length>0 && !selectedClient && (
                    <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#0f172a',border:'1px solid #1e293b',borderRadius:8,zIndex:20,maxHeight:200,overflowY:'auto',boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
                      {clientSuggestions.map(c=>(
                        <div key={c.id} onClick={()=>{setSelectedClient(c.name);setClientSearch('');setClientSuggestions([])}}
                          style={{padding:'10px 14px',cursor:'pointer',fontSize:14,color:'#f1f5f9',borderBottom:'1px solid #1e293b'}}
                          onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')}
                          onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                          {c.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <label style={{...lbl,margin:0,whiteSpace:'nowrap',color:'#64748b'}}>Invoice #</label>
                    <input value={invoiceNum} onChange={e=>setInvoiceNum(e.target.value)} style={{...inp,fontFamily:'monospace'}} />
                  </div>
                </div>
              </div>

              {/* Payment terms / custom fields */}
              <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.25rem',marginBottom:'1.25rem'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                  <div>
                    <label style={lbl}>Payment terms</label>
                    <select value={paymentTerms} onChange={e=>setPaymentTerms(e.target.value)} style={{...inp,padding:'9px 12px'}}>
                      {['Net 7','Net 14','Net 30','Due on receipt','Custom'].map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Issued date</label>
                    <div style={{...inp,color:'#4ade80',fontWeight:600,display:'flex',alignItems:'center'}}>
                      {new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Irrigation</label>
                    <select value={irrigation} onChange={e=>setIrrigation(e.target.value)} style={{...inp,padding:'9px 12px'}}>
                      <option>No</option><option>Yes</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Pest Control</label>
                    <select value={pestControl} onChange={e=>setPestControl(e.target.value)} style={{...inp,padding:'9px 12px'}}>
                      <option>No</option><option>Yes</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Title</label>
                    <input value={invoiceTitle} onChange={e=>setInvoiceTitle(e.target.value)} placeholder="Title" style={inp} />
                  </div>
                </div>
              </div>

              {/* Line Items — Product / Service */}
              <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.25rem',marginBottom:'1.25rem'}}>
                <h3 style={{fontSize:15,fontWeight:700,color:'#f1f5f9',margin:'0 0 1rem'}}>Product / Service</h3>
                {lineItems.map((item,i)=>(
                  <div key={i} style={{marginBottom:'1rem'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 100px 120px 120px 32px',gap:8,marginBottom:6}}>
                      <input placeholder="Name" value={item.name} onChange={e=>{const l=[...lineItems];l[i]={...l[i],name:e.target.value};setLineItems(l)}} style={inp} />
                      <input type="number" placeholder="Qty" value={item.qty} onChange={e=>{const l=[...lineItems];l[i]={...l[i],qty:parseFloat(e.target.value)||1};setLineItems(l)}} style={{...inp,textAlign:'center' as const}} />
                      <div style={{position:'relative'}}>
                        <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#64748b',fontSize:14}}>$</span>
                        <input type="number" placeholder="0.00" value={item.unit_price||''} onChange={e=>{const l=[...lineItems];l[i]={...l[i],unit_price:parseFloat(e.target.value)||0};setLineItems(l)}} style={{...inp,paddingLeft:24}} />
                      </div>
                      <div style={{...inp,display:'flex',alignItems:'center',fontWeight:700,color:'#4ade80',justifyContent:'flex-end'}}>
                        ${(item.qty*item.unit_price).toFixed(2)}
                      </div>
                      <button onClick={()=>setLineItems(lineItems.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:18,padding:0}}>×</button>
                    </div>
                    <textarea placeholder="Description" value={item.description} onChange={e=>{const l=[...lineItems];l[i]={...l[i],description:e.target.value};setLineItems(l)}}
                      style={{...inp,height:60,padding:'8px 12px',resize:'vertical' as const}} />
                  </div>
                ))}
                <button onClick={()=>setLineItems([...lineItems,{name:'',description:'',qty:1,unit_price:0}])}
                  style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                  + Add Line Item
                </button>

                {/* Totals */}
                <div style={{marginTop:'1.5rem',borderTop:'1px solid #1e293b',paddingTop:'1rem'}}>
                  <div style={{maxWidth:300,marginLeft:'auto',display:'flex',flexDirection:'column' as const,gap:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:14,color:'#94a3b8'}}>
                      <span>Subtotal</span><span style={{color:'#f1f5f9',fontWeight:600}}>${subtotal.toFixed(2)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:14,color:'#94a3b8'}}>
                      <span>Discount (%)</span>
                      <input type="number" value={discount||''} onChange={e=>setDiscount(parseFloat(e.target.value)||0)} placeholder="0"
                        style={{...inp,width:80,textAlign:'right' as const,height:36,padding:'0 10px',fontSize:13}} />
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:14,color:'#94a3b8'}}>
                      <span>Tax (%)</span>
                      <input type="number" value={taxPct||''} onChange={e=>setTaxPct(parseFloat(e.target.value)||0)} placeholder="0"
                        style={{...inp,width:80,textAlign:'right' as const,height:36,padding:'0 10px',fontSize:13}} />
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:16,fontWeight:800,color:'#4ade80',borderTop:'1px solid #1e293b',paddingTop:8}}>
                      <span>Total</span><span>${total.toFixed(2)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'#64748b'}}>
                      <span>Invoice balance</span><span>${total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Add section row */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:'1.25rem'}}>
                <span style={{fontSize:13,color:'#64748b',fontWeight:500}}>+ Add section</span>
                {['Client Message','Images','Attachments'].map(s=>(
                  <button key={s} style={{background:'transparent',border:'1px solid #334155',borderRadius:6,padding:'5px 12px',fontSize:12,color:'#94a3b8',cursor:'pointer',fontFamily:'inherit'}}>{s}</button>
                ))}
              </div>

              {/* Contract / Disclaimer */}
              <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.25rem',marginBottom:'1.25rem'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
                  <h3 style={{fontSize:15,fontWeight:700,color:'#f1f5f9',margin:0}}>Contract / Disclaimer</h3>
                </div>
                <textarea value={contractNote} onChange={e=>setContractNote(e.target.value)}
                  style={{...inp,height:80,padding:'10px 14px',resize:'vertical' as const}} />
              </div>

              {/* Internal Notes */}
              <div style={{background:'#0f172a',border:'2px dashed #1e293b',borderRadius:12,padding:'1.25rem',marginBottom:'1.5rem'}}>
                <h3 style={{fontSize:15,fontWeight:700,color:'#f1f5f9',margin:'0 0 0.75rem'}}>Notes</h3>
                <textarea value={internalNote} onChange={e=>setInternalNote(e.target.value)}
                  placeholder="Leave an internal note for yourself or a team member"
                  style={{...inp,height:80,padding:'10px 14px',resize:'vertical' as const,background:'transparent',border:'none'}} />
              </div>
            </div>

            {/* Sticky footer */}
            <div style={{background:'#0d1526',borderTop:'1px solid #1e293b',padding:'1rem 1.5rem',display:'flex',justifyContent:'flex-end',gap:8,position:'sticky',bottom:0}}>
              <button onClick={()=>{setShowNew(false);resetForm()}}
                style={{padding:'10px 22px',border:'1px solid #334155',borderRadius:8,background:'transparent',color:'#cbd5e1',cursor:'pointer',fontSize:14,fontFamily:'inherit'}}>
                Cancel
              </button>
              <button onClick={handleSaveInvoice} disabled={saving}
                style={{padding:'10px 22px',border:'none',borderRadius:8,background:'#4ade80',color:'#111827',cursor:'pointer',fontSize:14,fontWeight:700,fontFamily:'inherit',opacity:saving?0.7:1}}>
                {saving ? 'Saving...' : 'Save Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
