import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
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

interface LineItem { name: string; description: string; qty: number; unit_price: number }

const STATUS_STYLE: Record<string, {bg:string;color:string;dot:string}> = {
  'Past due': {bg:'#450a0a', color:'#fca5a5', dot:'#ef4444'},
  'overdue':  {bg:'#450a0a', color:'#fca5a5', dot:'#ef4444'},
  'paid':     {bg:'#052e16', color:'#4ade80', dot:'#16a34a'},
  'Paid':     {bg:'#052e16', color:'#4ade80', dot:'#16a34a'},
  'draft':    {bg:'#1e293b', color:'#94a3b8', dot:'#475569'},
  'Draft':    {bg:'#1e293b', color:'#94a3b8', dot:'#475569'},
  'sent':     {bg:'#0c1a2e', color:'#7dd3fc', dot:'#0ea5e9'},
  'Sent':     {bg:'#0c1a2e', color:'#7dd3fc', dot:'#0ea5e9'},
  'partial':  {bg:'#1a1000', color:'#fcd34d', dot:'#d97706'},
}
const inp = {width:'100%',padding:'10px 14px',background:'#1a2332',border:'1px solid #2d3f55',borderRadius:8,fontSize:14,boxSizing:'border-box' as const,outline:'none',color:'#f1f5f9',fontFamily:'inherit'}
const lbl = {fontSize:12,fontWeight:600 as const,color:'#94a3b8',textTransform:'uppercase' as const,letterSpacing:'0.04em',display:'block',marginBottom:6}

function statusBadge(status:string) {
  const s = STATUS_STYLE[status] || {bg:'#1e293b',color:'#94a3b8',dot:'#475569'}
  return <span style={{display:'inline-flex',alignItems:'center',gap:5,background:s.bg,color:s.color,padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:700}}><span style={{width:6,height:6,borderRadius:'50%',background:s.dot,display:'inline-block'}} />{status}</span>
}

export default function InvoicesPage() {
  const [invoices, setInvoices]   = useState<Invoice[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [showNew, setShowNew]     = useState(false)
  const [showBatch, setShowBatch] = useState(false)
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [openInvoice, setOpenInvoice] = useState<Invoice|null>(null)
  const [showPayModal, setShowPayModal] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Square')
  const [payNote, setPayNote]     = useState('')
  const [toast, setToast]         = useState('')
  const batchRef = useRef<HTMLDivElement>(null)

  // New invoice form
  const [subject, setSubject]           = useState('For Services Rendered')
  const [clientSearch, setClientSearch] = useState('')
  const [clientSuggestions, setClientSuggestions] = useState<{id:string;name:string}[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [invoiceNum, setInvoiceNum]     = useState('')
  const [paymentTerms, setPaymentTerms] = useState('Net 7')
  const [irrigation, setIrrigation]     = useState('No')
  const [pestControl, setPestControl]   = useState('No')
  const [invoiceTitle, setInvoiceTitle] = useState('')
  const [lineItems, setLineItems]       = useState<LineItem[]>([{name:'',description:'',qty:1,unit_price:0}])
  const [discount, setDiscount]         = useState(0)
  const [taxPct, setTaxPct]            = useState(0)
  const [contractNote, setContractNote] = useState('Thank you for your business. Please contact us with any questions regarding this invoice.')
  const [internalNote, setInternalNote] = useState('')
  const [saving, setSaving]             = useState(false)
  const [sending, setSending]           = useState<string|null>(null)
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [sourceId, setSourceId]         = useState<string>('')
  const [sourceType, setSourceType]     = useState<string>('')
  const location = useLocation()

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  useEffect(() => {
    const s = location.state as any
    if (s?.openCreate) {
      setShowNew(true)
      // Pre-fill from Jobs or Quotes navigation
      if (s.clientName) {
        setClientSearch(s.clientName)
        setSelectedClient(s.clientName)
      }
      if (s.clientId) setSelectedClientId(s.clientId)
      if (s.jobTitle || s.quoteTitle) setSubject(s.jobTitle || s.quoteTitle || '')
      if (s.amount) {
        setLineItems([{ name: s.jobTitle || s.quoteTitle || 'Services Rendered', description: '', qty: 1, unit_price: Number(s.amount) || 0 }])
      }
      if (s.lineItems?.length) {
        setLineItems(s.lineItems.map((li: any) => ({ name: li.name || '', description: li.description || '', qty: li.qty || 1, unit_price: li.unit_price || 0 })))
      }
      if (s.sourceId) setSourceId(s.sourceId)
      if (s.sourceType) setSourceType(s.sourceType)
    }
    const f = s?.filter
    if (f) setStatusFilter(f)
  }, [location.state])

  const loadInvoices = async () => {
    setLoading(true)
    const { data } = await supabase.from('invoices').select('*').is('deleted_at',null).order('created_at',{ascending:false})
    setInvoices(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadInvoices()
    supabase.from('invoices').select('invoice_number').order('created_at',{ascending:false}).limit(1).then(({data})=>{
      if (data?.[0]?.invoice_number) {
        const last = parseInt(data[0].invoice_number.replace(/\D/g,''))||16260
        setInvoiceNum(String(last+1))
      } else setInvoiceNum('16261')
    })
    const ch = supabase.channel('invoices').on('postgres_changes',{event:'*',schema:'public',table:'invoices'},loadInvoices).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    if (clientSearch.length < 2) { setClientSuggestions([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('clients').select('id,first_name,last_name,company').ilike('last_name',`%${clientSearch}%`).limit(8)
      setClientSuggestions((data??[]).map((c:any)=>({id:c.id,name:[c.first_name,c.last_name,c.company?`(${c.company})`:''].filter(Boolean).join(' ')})))
    }, 250)
    return () => clearTimeout(t)
  }, [clientSearch])

  const subtotal    = lineItems.reduce((s,l)=>s+l.qty*l.unit_price,0)
  const discountAmt = discount>0 ? subtotal*(discount/100) : 0
  const taxAmt      = taxPct>0 ? (subtotal-discountAmt)*(taxPct/100) : 0
  const total       = subtotal - discountAmt + taxAmt

  const handleSaveInvoice = async () => {
    if (!selectedClient && !clientSearch) return
    setSaving(true)
    await supabase.from('invoices').insert({
      invoice_number: invoiceNum, subject,
      client_name: selectedClient||clientSearch,
      amount: total, balance: total, status: 'draft',
      payment_terms: paymentTerms, notes: internalNote,
      issued_date: new Date().toISOString().slice(0,10),
      due_date: paymentTerms==='Net 7'  ? new Date(Date.now()+7*86400000).toISOString().slice(0,10)
              : paymentTerms==='Net 14' ? new Date(Date.now()+14*86400000).toISOString().slice(0,10)
              : paymentTerms==='Net 30' ? new Date(Date.now()+30*86400000).toISOString().slice(0,10)
              : new Date().toISOString().slice(0,10),
    })
    setSaving(false); setShowNew(false); resetForm(); loadInvoices()
    showToast('✅ Invoice created!')
  }

  const sendInvoiceEmail = async (inv: Invoice) => {
    if (!inv.client_name) { showToast('⚠️ No client on this invoice'); return }
    setSending(inv.id)
    try {
      // Look up client email
      const { data: client } = await supabase.from('clients')
        .select('email,first_name,last_name')
        .or(`first_name.ilike.%${inv.client_name.split(' ')[0]}%,last_name.ilike.%${inv.client_name.split(' ').pop()}%`)
        .limit(1).single()
      const recipientEmail = client?.email
      if (!recipientEmail) {
        showToast(`⚠️ No email on file for ${inv.client_name}. Add one in their client profile.`)
        setSending(null); return
      }
      const portalUrl = `https://phllandcare.github.io/phl-crm/#/portal?invoice=${inv.id}`
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: recipientEmail,
          subject: `Invoice #${inv.invoice_number} from PHL Land Care Inc.`,
          html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc"><div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)"><div style="background:#1e3a5f;padding:24px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">PHL Land Care Inc.</h1><p style="color:#94a3b8;margin:4px 0 0">Invoice #${inv.invoice_number}</p></div><div style="padding:24px"><p>Dear ${inv.client_name},</p><p>Please find your invoice for services rendered.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr style="background:#f1f5f9"><th style="padding:10px;text-align:left">Description</th><th style="padding:10px;text-align:right">Amount</th></tr><tr style="border-bottom:1px solid #e2e8f0"><td style="padding:10px">${inv.subject||'Services Rendered'}</td><td style="padding:10px;text-align:right;font-weight:bold">$${(inv.amount||0).toFixed(2)}</td></tr></table><div style="text-align:right;margin-top:16px;padding:12px;background:#f1f5f9;border-radius:8px"><strong>Total Due: $${(inv.amount||0).toFixed(2)}</strong><br><small>Due: ${inv.due_date||'Upon receipt'}</small></div><p style="margin-top:20px;color:#64748b;font-size:12px">To pay, please call (772) 466-3617 or mail a check to PHL Land Care Inc., PO Box 13767, Fort Pierce, FL 34979</p></div><div style="background:#1e3a5f;padding:16px;text-align:center"><p style="color:#94a3b8;margin:0;font-size:12px">PHL Land Care Inc. | 772-466-3617 | admin@phllandcare.com</p></div></div></body></html>`
        }
      })
      if (error) throw error
      await supabase.from('invoices').update({status:'sent',updated_at:new Date().toISOString()}).eq('id',inv.id)
      loadInvoices()
      showToast(`✅ Invoice #${inv.invoice_number} sent to ${inv.client_name}!`)
      if (openInvoice?.id === inv.id) setOpenInvoice({...openInvoice, status:'sent'})
    } catch {
      showToast(`📧 Email queued — connect Resend API key in Settings → Integrations`)
    }
    setSending(null)
  }

  const handleMarkPaid = async (inv: Invoice) => {
    const newStatus = (inv.status==='paid'||inv.status==='Paid') ? 'sent' : 'paid'
    await supabase.from('invoices').update({status:newStatus, balance:newStatus==='paid'?0:inv.amount, updated_at:new Date().toISOString()}).eq('id',inv.id)
    loadInvoices()
    if (openInvoice?.id === inv.id) setOpenInvoice({...openInvoice, status:newStatus, balance:newStatus==='paid'?0:inv.amount})
    showToast(newStatus==='paid' ? `✅ Invoice #${inv.invoice_number} marked as paid!` : `Invoice #${inv.invoice_number} marked as sent`)
  }

  const handleRecordPayment = async () => {
    if (!openInvoice || !payAmount) return
    const amt = parseFloat(payAmount)
    const newBalance = Math.max(0, (openInvoice.balance||openInvoice.amount||0) - amt)
    const newStatus = newBalance <= 0 ? 'paid' : 'partial'
    await supabase.from('invoices').update({status:newStatus, balance:newBalance, updated_at:new Date().toISOString()}).eq('id',openInvoice.id)
    loadInvoices()
    setOpenInvoice({...openInvoice, status:newStatus, balance:newBalance})
    setShowPayModal(false); setPayAmount(''); setPayNote('')
    showToast(`✅ Payment of $${amt.toFixed(2)} recorded via ${payMethod}!`)
  }

  const handlePrint = (inv: Invoice) => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>Invoice #${inv.invoice_number}</title><style>
      body{font-family:Arial,sans-serif;margin:0;padding:32px;color:#111;max-width:800px;margin:auto}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #1e3a5f}
      .logo-area h1{margin:0;color:#1e3a5f;font-size:22px} .logo-area p{margin:2px 0;font-size:12px;color:#64748b}
      .invoice-box{background:#1e3a5f;color:#fff;padding:14px 18px;border-radius:8px;text-align:right}
      .invoice-box h2{margin:0;font-size:18px} .invoice-box p{margin:4px 0;font-size:12px}
      .invoice-box .total{background:#4ade80;color:#052e16;padding:6px 10px;border-radius:4px;font-weight:bold;font-size:14px;display:inline-block;margin-top:6px}
      .section{margin-bottom:20px} .section h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 8px}
      table{width:100%;border-collapse:collapse} thead{background:#1e3a5f;color:#fff}
      th,td{padding:10px 12px;text-align:left;font-size:13px} th{font-size:11px;text-transform:uppercase;letter-spacing:.04em}
      tbody tr{border-bottom:1px solid #e2e8f0} .total-row td{font-weight:bold;border-top:2px solid #1e3a5f;font-size:15px}
      .footer{margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:center}
      @media print{body{padding:16px}}
    </style></head><body>
    <div class="header">
      <div class="logo-area">
        <h1>PHL Land Care Inc.</h1>
        <p>PO Box 13767 | Fort Pierce, FL 34979</p>
        <p>772-466-3617 | admin@phllandcare.com | phllandcare.com</p>
      </div>
      <div class="invoice-box">
        <h2>Invoice #${inv.invoice_number}</h2>
        <p>Issued: ${inv.issued_date||new Date().toLocaleDateString()}</p>
        <p>Due: ${inv.due_date||'Upon receipt'} | ${inv.payment_terms||'Net 7'}</p>
        <div class="total">Total: $${(inv.amount||0).toFixed(2)}</div>
      </div>
    </div>
    <div style="display:flex;gap:40px;margin-bottom:24px">
      <div class="section"><h3>Bill To</h3><strong>${inv.client_name||'—'}</strong></div>
    </div>
    <div class="section">
      <h3>For Services Rendered</h3>
      <table>
        <thead><tr><th>Product / Service</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
        <tbody><tr><td>${inv.subject||'Services Rendered'}</td><td></td><td>1</td><td>$${(inv.amount||0).toFixed(2)}</td><td>$${(inv.amount||0).toFixed(2)}</td></tr></tbody>
      </table>
      <table style="margin-top:12px"><tbody>
        <tr class="total-row"><td colspan="4" style="text-align:right">Total</td><td>$${(inv.amount||0).toFixed(2)}</td></tr>
      </tbody></table>
    </div>
    <p style="margin-top:20px;font-size:13px">${inv.notes||'Thank you for your business. Please contact us with any questions regarding this invoice.'}</p>
    <p style="font-size:12px;color:#475569">P. H. L. LAND CARE, INC. | 27-2494181</p>
    <div class="footer">PHL Land Care Inc. | PO Box 13767 Fort Pierce, FL 34979 | 772-466-3617 | admin@phllandcare.com</div>
    <script>window.onload=()=>window.print()</script>
    </body></html>`)
    win.document.close()
  }

  const handleDelete = async (id:string) => {
    if (!confirm('Delete this invoice?')) return
    await supabase.from('invoices').update({deleted_at:new Date().toISOString()}).eq('id',id)
    loadInvoices(); setOpenInvoice(null)
  }

  const toggleSelect = (id:string) => setSelected(prev => { const s=new Set(prev); s.has(id)?s.delete(id):s.add(id); return s })
  const resetForm = () => {
    setSubject('For Services Rendered'); setClientSearch(''); setSelectedClient('')
    setPaymentTerms('Net 7'); setIrrigation('No'); setPestControl('No')
    setInvoiceTitle(''); setLineItems([{name:'',description:'',qty:1,unit_price:0}])
    setDiscount(0); setTaxPct(0)
    setContractNote('Thank you for your business. Please contact us with any questions regarding this invoice.')
    setInternalNote('')
  }

  const filtered = invoices.filter(i => {
    const matchSearch = `${i.invoice_number||''} ${i.client_name||''} ${i.subject||''} ${i.status||''}`.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter==='All' || i.status===statusFilter
    return matchSearch && matchStatus
  })

  const pastDue    = invoices.filter(i=>i.status==='Past due'||i.status==='overdue')
  const pastDueAmt = pastDue.reduce((s,i)=>s+(i.balance||i.amount||0),0)
  const sentNotDue = invoices.filter(i=>i.status==='sent'||i.status==='Sent')
  const sentAmt    = sentNotDue.reduce((s,i)=>s+(i.balance||i.amount||0),0)
  const draftCount = invoices.filter(i=>i.status==='draft'||i.status==='Draft').length
  const fmt = (n:number) => '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})

  // ── INVOICE DETAIL VIEW ──
  if (openInvoice) {
    const inv = openInvoice
    const isPaid = inv.status==='paid'||inv.status==='Paid'
    return (
      <div style={{padding:'2rem',background:'#0a0f1a',minHeight:'100vh',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
        {toast && <div style={{position:'fixed',top:'1rem',right:'1rem',background:'#052e16',border:'1px solid #16a34a',borderRadius:10,padding:'10px 18px',fontSize:14,color:'#4ade80',fontWeight:600,zIndex:9999}}>{ toast}</div>}

        <button onClick={()=>setOpenInvoice(null)} style={{background:'none',border:'none',color:'#64748b',fontSize:13,cursor:'pointer',fontFamily:'inherit',marginBottom:16,display:'flex',alignItems:'center',gap:6}}>
          ← Back to Invoices
        </button>

        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
              {statusBadge(inv.status||'draft')}
              <span style={{fontSize:13,color:'#475569'}}>#{inv.invoice_number}</span>
            </div>
            <h1 style={{margin:0,fontSize:26,fontWeight:800,color:'#f1f5f9'}}>{inv.client_name}</h1>
            <p style={{margin:'4px 0 0',fontSize:14,color:'#64748b'}}>{inv.subject}</p>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button onClick={()=>handlePrint(inv)} style={{padding:'9px 16px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9',cursor:'pointer',fontSize:13,fontFamily:'inherit',display:'flex',alignItems:'center',gap:6}}>🖨️ Print / PDF</button>
            <button onClick={()=>sendInvoiceEmail(inv)} disabled={sending===inv.id} style={{padding:'9px 16px',background:'#0c1a2e',border:'1px solid #0ea5e9',borderRadius:8,color:'#7dd3fc',cursor:'pointer',fontSize:13,fontFamily:'inherit',display:'flex',alignItems:'center',gap:6,opacity:sending===inv.id?0.6:1}}>
              {sending===inv.id?'Sending…':'📧 Send Email'}
            </button>
            <button onClick={async()=>{
              const {data:cl}=await supabase.from('clients').select('phone,first_name').ilike('first_name',inv.client_name?.split(' ')[0]||'').limit(1).single()
              const phone=cl?.phone
              if(!phone){showToast('⚠️ No phone number found for this client');return}
              const msg=`Hi ${cl?.first_name||inv.client_name}, your invoice #${inv.invoice_number} for $${(inv.amount||0).toFixed(2)} from PHL Land Care is ready. Questions? Call 772-466-3617.`
              try{await supabase.functions.invoke('send-sms',{body:{to:phone,message:msg}});showToast(`✅ SMS sent to ${phone}`)}
              catch{showToast('⚠️ SMS failed — check Twilio settings in Settings')}
            }} style={{padding:'9px 16px',background:'rgba(167,139,250,0.1)',border:'1px solid rgba(167,139,250,0.3)',borderRadius:8,color:'#a78bfa',cursor:'pointer',fontSize:13,fontFamily:'inherit',display:'flex',alignItems:'center',gap:6}}>
              💬 Send SMS
            </button>
            <button onClick={()=>setShowPayModal(true)} style={{padding:'9px 16px',background:'rgba(96,165,250,0.15)',border:'1px solid #60a5fa',borderRadius:8,color:'#60a5fa',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>💳 Record Payment</button>
            <button onClick={()=>handleMarkPaid(inv)} style={{padding:'9px 16px',background:isPaid?'rgba(100,116,139,0.15)':'rgba(74,222,128,0.15)',border:`1px solid ${isPaid?'#475569':'#16a34a'}`,borderRadius:8,color:isPaid?'#94a3b8':'#4ade80',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>
              {isPaid ? '↩ Mark Unpaid' : '✓ Mark as Paid'}
            </button>
            <button onClick={()=>handleDelete(inv.id)} style={{padding:'9px 16px',background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.3)',borderRadius:8,color:'#f87171',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>Delete</button>
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {/* Invoice info */}
          <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem'}}>
            <h3 style={{margin:'0 0 16px',fontSize:14,fontWeight:700,color:'#f1f5f9'}}>Invoice Details</h3>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 32px'}}>
              {[
                {label:'Client',         value:inv.client_name||'—'},
                {label:'Invoice #',      value:`#${inv.invoice_number}`},
                {label:'Issued Date',    value:inv.issued_date||'—'},
                {label:'Due Date',       value:inv.due_date||'—'},
                {label:'Payment Terms',  value:inv.payment_terms||'—'},
                {label:'Status',         value:inv.status},
                {label:'Total Amount',   value:fmt(inv.amount||0)},
                {label:'Balance Due',    value:fmt(inv.balance||inv.amount||0)},
              ].map(row=>(
                <div key={row.label} style={{borderBottom:'1px solid #1e293b',paddingBottom:10}}>
                  <p style={{margin:'0 0 2px',fontSize:11,color:'#475569',fontWeight:600,textTransform:'uppercase'}}>{row.label}</p>
                  <p style={{margin:0,fontSize:13,color:row.label==='Balance Due'&&(inv.balance||inv.amount||0)>0?'#fca5a5':row.label==='Total Amount'?'#4ade80':'#f1f5f9',fontWeight:row.label==='Total Amount'||row.label==='Balance Due'?700:400}}>{row.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Services */}
          <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem'}}>
            <h3 style={{margin:'0 0 16px',fontSize:14,fontWeight:700,color:'#f1f5f9'}}>For Services Rendered</h3>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{borderBottom:'1px solid #1e293b'}}>
                {['Service','Description','Qty','Unit Price','Total'].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase'}}>{h}</th>)}
              </tr></thead>
              <tbody>
                <tr style={{borderBottom:'1px solid #1e293b'}}>
                  <td style={{padding:'10px 12px',fontSize:13,color:'#f1f5f9',fontWeight:600}}>{inv.subject||'Services'}</td>
                  <td style={{padding:'10px 12px',fontSize:12,color:'#64748b'}}></td>
                  <td style={{padding:'10px 12px',fontSize:13,color:'#f1f5f9'}}>1</td>
                  <td style={{padding:'10px 12px',fontSize:13,color:'#f1f5f9'}}>{fmt(inv.amount||0)}</td>
                  <td style={{padding:'10px 12px',fontSize:13,color:'#4ade80',fontWeight:700}}>{fmt(inv.amount||0)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid #1e293b',display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end'}}>
              <div style={{display:'flex',gap:32}}><span style={{fontSize:13,color:'#64748b'}}>Subtotal</span><span style={{fontSize:13,color:'#f1f5f9'}}>{fmt(inv.amount||0)}</span></div>
              <div style={{display:'flex',gap:32,borderTop:'1px solid #1e293b',paddingTop:8,marginTop:4}}>
                <span style={{fontSize:15,fontWeight:700,color:'#f1f5f9'}}>Total</span>
                <span style={{fontSize:18,fontWeight:800,color:'#4ade80'}}>{fmt(inv.amount||0)}</span>
              </div>
              <div style={{display:'flex',gap:32}}>
                <span style={{fontSize:13,color:'#64748b'}}>Balance Due</span>
                <span style={{fontSize:13,fontWeight:700,color:(inv.balance||inv.amount||0)>0?'#fca5a5':'#4ade80'}}>{fmt(inv.balance||inv.amount||0)}</span>
              </div>
            </div>
          </div>

          {/* Contract / notes */}
          {inv.notes && (
            <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem'}}>
              <h3 style={{margin:'0 0 8px',fontSize:14,fontWeight:700,color:'#f1f5f9'}}>Notes</h3>
              <p style={{margin:0,fontSize:13,color:'#cbd5e1'}}>{inv.notes}</p>
            </div>
          )}

          {/* Client portal link */}
          <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:14,padding:'1.25rem'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <h3 style={{margin:'0 0 4px',fontSize:14,fontWeight:700,color:'#f1f5f9'}}>Client Portal Link</h3>
                <p style={{margin:0,fontSize:12,color:'#64748b'}}>Share this link so the client can view and pay their invoice</p>
              </div>
              <button onClick={()=>{
                const url = `https://phllandcare.github.io/phl-crm/#/portal?invoice=${inv.id}`
                navigator.clipboard.writeText(url).then(()=>showToast('✅ Portal link copied!')).catch(()=>showToast('Link: '+url))
              }} style={{padding:'8px 16px',background:'none',border:'1px solid #4ade80',borderRadius:8,color:'#4ade80',cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>
                🔗 Copy Portal Link
              </button>
            </div>
          </div>
        </div>

        {/* Record Payment Modal */}
        {showPayModal && (
          <>
            <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:500}} onClick={()=>setShowPayModal(false)} />
            <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:420,background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:501,padding:24}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
                <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#f1f5f9'}}>💳 Record Payment</h2>
                <button onClick={()=>setShowPayModal(false)} style={{background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer'}}>×</button>
              </div>
              <p style={{margin:'0 0 16px',fontSize:13,color:'#64748b'}}>Invoice #{inv.invoice_number} — Balance: {fmt(inv.balance||inv.amount||0)}</p>
              <label style={lbl}>Amount *</label>
              <input style={{...inp,marginBottom:12}} type="number" placeholder="0.00" value={payAmount} onChange={e=>setPayAmount(e.target.value)} />
              <label style={lbl}>Payment Method</label>
              <select style={{...inp,marginBottom:12}} value={payMethod} onChange={e=>setPayMethod(e.target.value)}>
                <option>Square</option><option>Cash</option><option>Check</option><option>Zelle</option><option>ACH</option><option>Other</option>
              </select>
              <label style={lbl}>Note (optional)</label>
              <input style={{...inp,marginBottom:20}} placeholder="Check #, reference, etc." value={payNote} onChange={e=>setPayNote(e.target.value)} />
              <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                <button onClick={()=>setShowPayModal(false)} style={{padding:'10px 20px',border:'1px solid #1e293b',borderRadius:9,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>Cancel</button>
                <button onClick={handleRecordPayment} style={{padding:'10px 20px',border:'none',borderRadius:9,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>Record Payment</button>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── INVOICE LIST VIEW ──
  return (
    <div style={{padding:'2rem',maxWidth:1300,margin:'0 auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      {toast && <div style={{position:'fixed',top:'1rem',right:'1rem',background:'#052e16',border:'1px solid #16a34a',borderRadius:10,padding:'10px 18px',fontSize:14,color:'#4ade80',fontWeight:600,zIndex:9999}}>{toast}</div>}

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <h1 style={{fontSize:26,fontWeight:700,color:'#f1f5f9',margin:0}}>Invoices</h1>
        <div style={{display:'flex',gap:8,alignItems:'center',position:'relative'}}>
          <button onClick={()=>setShowNew(true)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:'pointer'}}>New Invoice</button>
          <button onClick={()=>setShowBatch(v=>!v)} style={{background:'transparent',color:'#f1f5f9',border:'1.5px solid #334155',borderRadius:8,padding:'10px 14px',fontSize:14,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>••• More Actions</button>
          {showBatch && (
            <div ref={batchRef} style={{position:'absolute',top:'110%',right:0,background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'6px 0',zIndex:50,minWidth:200,boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
              {[{icon:'📋',label:'Batch Create Invoices'},{icon:'📧',label:'Batch Deliver Invoices'},{icon:'📥',label:'Import Invoice Data'}].map(a=>(
                <button key={a.label} onClick={()=>setShowBatch(false)} style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 16px',background:'none',border:'none',color:'#f1f5f9',fontSize:14,cursor:'pointer',textAlign:'left',fontFamily:'inherit'}}
                  onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                  <span style={{fontSize:16}}>{a.icon}</span>{a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:'1.5rem'}}>
        <div style={{background:'#0f172a',border:'1px solid #1e293b',borderTop:'3px solid #f87171',borderRadius:14,padding:'1.1rem 1.25rem'}}>
          <p style={{fontSize:12,fontWeight:700,color:'#f87171',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 8px'}}>Overview</p>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {[
              {label:`Past due (${pastDue.length})`, val:fmt(pastDueAmt), filter:'Past due', color:'#ef4444', textColor:'#fca5a5'},
              {label:`Sent not due (${sentNotDue.length})`, val:fmt(sentAmt), filter:'Sent', color:'#f59e0b', textColor:'#fcd34d'},
              {label:`Draft (${draftCount})`, val:'', filter:'Draft', color:'#475569', textColor:'#94a3b8'},
            ].map(row=>(
              <div key={row.label} onClick={()=>setStatusFilter(row.filter)} style={{display:'flex',justifyContent:'space-between',fontSize:13,cursor:'pointer',padding:'4px 6px',borderRadius:6,transition:'background .1s'}}
                onMouseEnter={e=>(e.currentTarget.style.background=`${row.color}22`)} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                <span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:8,height:8,borderRadius:'50%',background:row.color,display:'inline-block'}}/>{row.label}</span>
                <span style={{fontWeight:700,color:row.textColor}}>{row.val}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:'#0f172a',border:'1px solid #1e293b',borderTop:'3px solid #fbbf24',borderRadius:14,padding:'1.1rem 1.25rem'}}>
          <p style={{fontSize:12,fontWeight:700,color:'#fbbf24',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 4px'}}>Issued (past 30 days)</p>
          <p style={{fontSize:28,fontWeight:800,color:'#f1f5f9',margin:0}}>{invoices.length}</p>
        </div>
        <div style={{background:'#0f172a',border:'1px solid #1e293b',borderTop:'3px solid #60a5fa',borderRadius:14,padding:'1.1rem 1.25rem'}}>
          <p style={{fontSize:12,fontWeight:700,color:'#60a5fa',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 4px'}}>Average invoice</p>
          <p style={{fontSize:28,fontWeight:800,color:'#f1f5f9',margin:0}}>{invoices.length>0?`$${(invoices.reduce((s,i)=>s+(i.amount||0),0)/invoices.length).toLocaleString('en-US',{maximumFractionDigits:0})}`:'$0'}</p>
        </div>
        <div style={{background:'#0f172a',border:'1px solid #1e293b',borderTop:'3px solid #4ade80',borderRadius:14,padding:'1.1rem 1.25rem'}}>
          <p style={{fontSize:12,fontWeight:700,color:'#4ade80',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 4px'}}>Total Outstanding</p>
          <p style={{fontSize:28,fontWeight:800,color:'#4ade80',margin:0}}>${invoices.filter(i=>i.status!=='paid'&&i.status!=='Paid').reduce((s,i)=>s+(i.balance||i.amount||0),0).toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:'1rem',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {['All','Draft','Sent','Past due','paid'].map(s=>(
            <button key={s} onClick={()=>setStatusFilter(s)} style={{padding:'6px 14px',borderRadius:20,fontSize:13,fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:statusFilter===s?'#4ade80':'#1e293b',background:statusFilter===s?'#052e16':'#0f172a',color:statusFilter===s?'#4ade80':'#64748b'}}>
              {s} {s==='All'?`(${invoices.length})`:s==='Past due'?`(${pastDue.length})`:s==='Draft'?`(${draftCount})`:''}
            </button>
          ))}
        </div>
        <input placeholder="Search invoices..." value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,flex:1,minWidth:200,height:40,padding:'0 14px',background:'#0f172a',border:'1.5px solid #1e293b',borderRadius:8}} />
      </div>

      {/* Table */}
      {loading ? <p style={{color:'#64748b'}}>Loading...</p> : (
        <div style={{background:'#0f172a',borderRadius:16,border:'1px solid #1e293b',overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}>
            <thead>
              <tr style={{borderBottom:'1px solid #1e293b',background:'#0a0f1a'}}>
                <th style={{width:40,padding:'11px 14px'}}><input type="checkbox" onChange={e=>{if(e.target.checked)setSelected(new Set(filtered.map(i=>i.id)));else setSelected(new Set())}} style={{cursor:'pointer'}} /></th>
                {['Client','Invoice #','Due Date','Subject','Status','Total','Balance','Actions'].map(h=>(
                  <th key={h} style={{padding:'11px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={9} style={{padding:'3rem',textAlign:'center',color:'#475569'}}>No invoices found</td></tr>
              ) : filtered.map((inv,idx)=>(
                <tr key={inv.id} onClick={()=>setOpenInvoice(inv)}
                  style={{borderBottom:'1px solid #1e293b',background:selected.has(inv.id)?'#0c1e35':idx%2===0?'transparent':'rgba(255,255,255,0.015)',cursor:'pointer'}}
                  onMouseEnter={e=>{if(!selected.has(inv.id))(e.currentTarget as HTMLElement).style.background='#111c2d'}}
                  onMouseLeave={e=>{if(!selected.has(inv.id))(e.currentTarget as HTMLElement).style.background=idx%2===0?'transparent':'rgba(255,255,255,0.015)'}}>
                  <td style={{padding:'12px 14px'}} onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected.has(inv.id)} onChange={()=>toggleSelect(inv.id)} style={{cursor:'pointer'}} /></td>
                  <td style={{padding:'12px 14px'}}><span style={{fontSize:14,fontWeight:600,color:'#f1f5f9'}}>{inv.client_name||'—'}</span></td>
                  <td style={{padding:'12px 14px',fontSize:13,color:'#64748b',fontFamily:'monospace'}}>#{inv.invoice_number||'—'}</td>
                  <td style={{padding:'12px 14px',fontSize:13,color:'#94a3b8',whiteSpace:'nowrap'}}>{inv.due_date||'—'}</td>
                  <td style={{padding:'12px 14px',fontSize:13,color:'#94a3b8',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{inv.subject||'—'}</td>
                  <td style={{padding:'12px 14px'}}>{statusBadge(inv.status||'draft')}</td>
                  <td style={{padding:'12px 14px',fontSize:14,fontWeight:700,color:'#f1f5f9'}}>{fmt(inv.amount||0)}</td>
                  <td style={{padding:'12px 14px',fontSize:14,fontWeight:700,color:(inv.balance||inv.amount||0)>0?'#fca5a5':'#4ade80'}}>{fmt(inv.balance||inv.amount||0)}</td>
                  <td style={{padding:'12px 14px',display:'flex',gap:5,alignItems:'center'}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>sendInvoiceEmail(inv)} disabled={sending===inv.id} style={{background:'#0c1a2e',color:'#7dd3fc',border:'1px solid #0ea5e9',borderRadius:6,padding:'4px 9px',fontSize:11,cursor:'pointer',fontWeight:600,opacity:sending===inv.id?0.6:1}}>
                      {sending===inv.id?'…':'📧'}
                    </button>
                    <button onClick={()=>handleMarkPaid(inv)} style={{background:(inv.status==='paid'||inv.status==='Paid')?'rgba(100,116,139,0.15)':'rgba(74,222,128,0.1)',color:(inv.status==='paid'||inv.status==='Paid')?'#94a3b8':'#4ade80',border:'1px solid',borderColor:(inv.status==='paid'||inv.status==='Paid')?'#475569':'rgba(74,222,128,0.3)',borderRadius:6,padding:'4px 9px',fontSize:11,cursor:'pointer',fontWeight:600}}>
                      {(inv.status==='paid'||inv.status==='Paid')?'Paid':'✓ Paid'}
                    </button>
                    <button onClick={()=>handlePrint(inv)} style={{background:'#1e293b',color:'#94a3b8',border:'1px solid #334155',borderRadius:6,padding:'4px 9px',fontSize:11,cursor:'pointer'}}>🖨️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Invoice Modal */}
      {showNew && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'stretch',justifyContent:'center',zIndex:1000,overflowY:'auto'}}>
          <div style={{background:'#111827',width:'100%',maxWidth:900,display:'flex',flexDirection:'column',minHeight:'100vh'}}>
            <div style={{background:'#0d1526',borderBottom:'1px solid #1e293b',padding:'1rem 1.5rem',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:10}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <span style={{fontSize:20}}>🧾</span>
                <h2 style={{fontSize:17,fontWeight:700,color:'#f1f5f9',margin:0}}>New Invoice</h2>
              </div>
              <button onClick={()=>{setShowNew(false);resetForm()}} style={{background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer'}}>×</button>
            </div>
            <div style={{padding:'1.5rem',flex:1,overflowY:'auto'}}>
              <div style={{marginBottom:'1.25rem'}}>
                <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Subject" style={{...inp,fontSize:16,fontWeight:600,background:'#1a2332'}} />
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:'1.25rem'}}>
                <div style={{position:'relative'}}>
                  <input value={selectedClient||clientSearch} onChange={e=>{setClientSearch(e.target.value);setSelectedClient('')}} placeholder="Select a client" style={{...inp,border:'2px solid #334155'}} />
                  {clientSuggestions.length>0 && (
                    <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#0f172a',border:'1px solid #1e293b',borderRadius:8,zIndex:50,maxHeight:200,overflowY:'auto',boxShadow:'0 4px 16px rgba(0,0,0,0.4)'}}>
                      {clientSuggestions.map(c=>(
                        <div key={c.id} onClick={()=>{setSelectedClient(c.name);setClientSearch('');setClientSuggestions([])}}
                          style={{padding:'10px 14px',cursor:'pointer',fontSize:14,color:'#f1f5f9'}}
                          onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                          {c.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}><label style={{...lbl,margin:0,whiteSpace:'nowrap',color:'#64748b'}}>Invoice #</label><input value={invoiceNum} onChange={e=>setInvoiceNum(e.target.value)} style={{...inp,fontFamily:'monospace'}} /></div>
              </div>
              <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.25rem',marginBottom:'1.25rem'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                  <div><label style={lbl}>Payment terms</label><select value={paymentTerms} onChange={e=>setPaymentTerms(e.target.value)} style={{...inp,padding:'9px 12px'}}>{['Net 7','Net 14','Net 30','Due on receipt'].map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><label style={lbl}>Issued date</label><div style={{...inp,color:'#4ade80',fontWeight:600,display:'flex',alignItems:'center'}}>{new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div></div>
                  <div><label style={lbl}>Irrigation</label><select value={irrigation} onChange={e=>setIrrigation(e.target.value)} style={{...inp,padding:'9px 12px'}}><option>No</option><option>Yes</option></select></div>
                  <div><label style={lbl}>Pest Control</label><select value={pestControl} onChange={e=>setPestControl(e.target.value)} style={{...inp,padding:'9px 12px'}}><option>No</option><option>Yes</option></select></div>
                </div>
              </div>
              <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.25rem',marginBottom:'1.25rem'}}>
                <h3 style={{fontSize:15,fontWeight:700,color:'#f1f5f9',margin:'0 0 1rem'}}>Product / Service</h3>
                {lineItems.map((item,i)=>(
                  <div key={i} style={{marginBottom:'1rem'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 100px 120px 120px 32px',gap:8,marginBottom:6}}>
                      <input placeholder="Name" value={item.name} onChange={e=>{const l=[...lineItems];l[i]={...l[i],name:e.target.value};setLineItems(l)}} style={inp} />
                      <input type="number" placeholder="Qty" value={item.qty} onChange={e=>{const l=[...lineItems];l[i]={...l[i],qty:parseFloat(e.target.value)||1};setLineItems(l)}} style={{...inp,textAlign:'center' as const}} />
                      <div style={{position:'relative'}}><span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#64748b',fontSize:14}}>$</span><input type="number" placeholder="0.00" value={item.unit_price||''} onChange={e=>{const l=[...lineItems];l[i]={...l[i],unit_price:parseFloat(e.target.value)||0};setLineItems(l)}} style={{...inp,paddingLeft:24}} /></div>
                      <div style={{...inp,display:'flex',alignItems:'center',fontWeight:700,color:'#4ade80',justifyContent:'flex-end'}}>${(item.qty*item.unit_price).toFixed(2)}</div>
                      <button onClick={()=>setLineItems(lineItems.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:18,padding:0}}>×</button>
                    </div>
                    <textarea placeholder="Description" value={item.description} onChange={e=>{const l=[...lineItems];l[i]={...l[i],description:e.target.value};setLineItems(l)}} style={{...inp,height:60,padding:'8px 12px',resize:'vertical' as const}} />
                  </div>
                ))}
                <button onClick={()=>setLineItems([...lineItems,{name:'',description:'',qty:1,unit_price:0}])} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Add Line Item</button>
                <div style={{marginTop:'1.5rem',borderTop:'1px solid #1e293b',paddingTop:'1rem'}}>
                  <div style={{maxWidth:300,marginLeft:'auto',display:'flex',flexDirection:'column' as const,gap:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:14,color:'#94a3b8'}}><span>Subtotal</span><span style={{color:'#f1f5f9',fontWeight:600}}>${subtotal.toFixed(2)}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:14,color:'#94a3b8'}}><span>Discount (%)</span><input type="number" value={discount||''} onChange={e=>setDiscount(parseFloat(e.target.value)||0)} placeholder="0" style={{...inp,width:80,textAlign:'right' as const,height:36,padding:'0 10px',fontSize:13}} /></div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:14,color:'#94a3b8'}}><span>Tax (%)</span><input type="number" value={taxPct||''} onChange={e=>setTaxPct(parseFloat(e.target.value)||0)} placeholder="0" style={{...inp,width:80,textAlign:'right' as const,height:36,padding:'0 10px',fontSize:13}} /></div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:16,fontWeight:800,color:'#4ade80',borderTop:'1px solid #1e293b',paddingTop:8}}><span>Total</span><span>${total.toFixed(2)}</span></div>
                  </div>
                </div>
              </div>
              <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1.25rem',marginBottom:'1.25rem'}}>
                <h3 style={{fontSize:15,fontWeight:700,color:'#f1f5f9',margin:'0 0 0.75rem'}}>Contract / Disclaimer</h3>
                <textarea value={contractNote} onChange={e=>setContractNote(e.target.value)} style={{...inp,height:80,padding:'10px 14px',resize:'vertical' as const}} />
              </div>
              <div style={{background:'#0f172a',border:'2px dashed #1e293b',borderRadius:12,padding:'1.25rem',marginBottom:'1.5rem'}}>
                <h3 style={{fontSize:15,fontWeight:700,color:'#f1f5f9',margin:'0 0 0.75rem'}}>Internal Notes</h3>
                <textarea value={internalNote} onChange={e=>setInternalNote(e.target.value)} placeholder="Leave an internal note for yourself or a team member" style={{...inp,height:80,padding:'10px 14px',resize:'vertical' as const,background:'transparent',border:'none'}} />
              </div>
            </div>
            <div style={{background:'#0d1526',borderTop:'1px solid #1e293b',padding:'1rem 1.5rem',display:'flex',justifyContent:'flex-end',gap:8,position:'sticky',bottom:0}}>
              <button onClick={()=>{setShowNew(false);resetForm()}} style={{padding:'10px 22px',border:'1px solid #334155',borderRadius:8,background:'transparent',color:'#cbd5e1',cursor:'pointer',fontSize:14,fontFamily:'inherit'}}>Cancel</button>
              <button onClick={handleSaveInvoice} disabled={saving} style={{padding:'10px 22px',border:'none',borderRadius:8,background:'#4ade80',color:'#111827',cursor:'pointer',fontSize:14,fontWeight:700,fontFamily:'inherit',opacity:saving?0.7:1}}>{saving?'Saving...':'Save Invoice'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
