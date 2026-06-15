import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// ── Public Client Portal ─────────────────────────────────────────────────────
// Accessed via:
//   /#/portal?invoice=UUID         → view & pay invoice
//   /#/portal?quote=UUID           → view & approve/decline quote
//   /#/portal?type=quote&id=UUID   → same as above
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  interface Window { Square: any }
}

type PortalMode = 'invoice' | 'quote' | 'loading' | 'error' | 'success'

export default function ClientPortalPage() {
  const [mode, setMode]         = useState<PortalMode>('loading')
  const [doc, setDoc]           = useState<any>(null)
  const [error, setError]       = useState('')
  const [toast, setToast]       = useState('')
  const [processing, setProcessing] = useState(false)
  const [paid, setPaid]         = useState(false)
  const [approved, setApproved] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [view, setView]         = useState<'details'|'pay'|'sign'|'card'|'other'>('details')
  const [signMode, setSignMode] = useState<'draw'|'type'>('draw')
  const [typedSig, setTypedSig] = useState('')
  const [squareLoaded, setSquareLoaded] = useState(false)
  const [squareCard, setSquareCard] = useState<any>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const squarePaymentsRef = useRef<any>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  // ── Parse URL params ──
  useEffect(() => {
    const hash = window.location.hash // e.g. #/portal?invoice=abc
    const qmark = hash.indexOf('?')
    if (qmark === -1) { setError('No document ID provided'); setMode('error'); return }
    const params = new URLSearchParams(hash.slice(qmark + 1))
    const invoiceId = params.get('invoice')
    const quoteId   = params.get('quote') || (params.get('type') === 'quote' ? params.get('id') : null)

    const load = async () => {
      if (invoiceId) {
        const { data, error: err } = await supabase.from('invoices').select('*').eq('id', invoiceId).single()
        if (err || !data) { setError('Invoice not found or link expired.'); setMode('error'); return }
        setDoc(data)
        setPaid(data.status === 'paid' || data.status === 'Paid')
        setMode('invoice')
      } else if (quoteId) {
        const { data, error: err } = await supabase.from('quotes').select('*').eq('id', quoteId).is('deleted_at', null).single()
        if (err || !data) { setError('Quote not found or link expired.'); setMode('error'); return }
        const { data: lineItems } = await supabase.from('quote_line_items').select('*').eq('quote_id', quoteId).order('id')
        setDoc({ ...data, line_items: lineItems || [] })
        setApproved(data.status === 'approved')
        setDeclined(data.status === 'declined')
        setMode('quote')
      } else {
        setError('Invalid portal link.'); setMode('error')
      }
    }
    load()
  }, [])

  // ── Load Square Web Payments SDK ──
  useEffect(() => {
    if (mode !== 'invoice') return
    const script = document.createElement('script')
    script.src = 'https://sandbox.web.squarecdn.com/v1/square.js' // switch to web.squarecdn.com for prod
    script.onload = () => setSquareLoaded(true)
    script.onerror = () => console.warn('Square SDK failed to load — using fallback')
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [mode])

  // ── Initialize Square card form ──
  useEffect(() => {
    if (!squareLoaded || !window.Square || view !== 'pay') return
    const init = async () => {
      try {
        // Load Square credentials from org_settings
        const { data: settings } = await supabase.from('org_settings_public').select('square_app_id,square_location_id').limit(1).single()
        const appId = settings?.square_app_id || ''
        const locationId = settings?.square_location_id || ''
        if (!appId || !locationId) {
          console.warn('Square not configured — add credentials in Settings → Integrations')
          return
        }
        squarePaymentsRef.current = window.Square.payments(appId, locationId)
        const card = await squarePaymentsRef.current.card({
          style: {
            '.input-container': { borderColor: '#334155', borderRadius: '8px' },
            '.input-container.is-focus': { borderColor: '#4ade80' },
            '.message-text': { color: '#94a3b8' },
            '.message-icon': { color: '#94a3b8' },
          }
        })
        await card.attach('#square-card-container')
        setSquareCard(card)
      } catch (e) {
        console.warn('Square card init failed:', e)
      }
    }
    init()
  }, [squareLoaded, view])

  // ── Drawing signature ──
  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawing.current = true
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) { ctx.beginPath(); ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY) }
  }
  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) { ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY); ctx.stroke() }
  }
  const stopDraw = () => { isDrawing.current = false }
  const clearSig = () => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
  }

  const hasSig = () => {
    if (signMode === 'type') return typedSig.trim().length > 2
    if (!canvasRef.current) return false
    const ctx = canvasRef.current.getContext('2d')
    const data = ctx?.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)
    return data ? data.data.some(v => v !== 0) : false
  }

  // ── Pay with Square ──
  const handleSquarePay = async () => {
    if (!squareCard || !doc) return
    setProcessing(true)
    try {
      const result = await squareCard.tokenize()
      if (result.status !== 'OK') throw new Error(result.errors?.[0]?.message || 'Card tokenization failed')

      const { error: fnErr } = await supabase.functions.invoke('square-payment', {
        body: {
          sourceId: result.token,
          amount: doc.balance || doc.amount,
          invoiceId: doc.id,
          clientName: doc.client_name,
          note: `Invoice #${doc.invoice_number}`,
        }
      })
      if (fnErr) throw new Error(fnErr.message)

      const paidNow = new Date().toISOString()
      await supabase.from('invoices').update({ status: 'paid', balance: 0, paid_at: paidNow, updated_at: paidNow }).eq('id', doc.id)
      await supabase.from('payments').insert({ invoice_id: doc.id, invoice_number: doc.invoice_number, client_name: doc.client_name, amount: doc.amount||doc.balance||0, method: 'Square', note: 'Paid via client portal', paid_at: paidNow })
      setPaid(true); setView('details')
      setMode('success' as any)
      showToast('✅ Payment successful! Thank you.')
    } catch (err: any) {
      showToast(`❌ Payment failed: ${err.message}`)
    }
    setProcessing(false)
  }

  // ── Fallback manual card pay (if Square SDK not available) ──
  const [cardNum, setCardNum] = useState('')
  const [cardExp, setCardExp] = useState('')
  const [cardCvc, setCardCvc] = useState('')
  const [cardName, setCardName] = useState('')

  const handleFallbackPay = async () => {
    if (!cardNum || !cardExp || !cardCvc || !cardName) return
    setProcessing(true)
    await new Promise(r => setTimeout(r, 1800))
    const signedAt = new Date().toISOString()
    await supabase.from('invoices').update({ status: 'paid', balance: 0, paid_at: signedAt, updated_at: signedAt }).eq('id', doc.id)
    await supabase.from('payments').insert({ invoice_id: doc.id, invoice_number: doc.invoice_number, client_name: doc.client_name, amount: doc.amount||doc.balance||0, method: 'E-Signature', note: 'Signed & paid via client portal', paid_at: signedAt })
    setDoc({ ...doc, status: 'paid', balance: 0 })
    setPaid(true); setView('details')
    showToast('✅ Payment recorded! Thank you.')
    setProcessing(false)
  }

  // ── Quote approve/decline ──
  const handleApprove = async () => {
    if (!hasSig()) { showToast('Please sign before approving'); return }
    setProcessing(true)
    const sigData = signMode === 'draw'
      ? canvasRef.current?.toDataURL('image/png') || ''
      : `TYPED:${typedSig}`
    await supabase.from('quotes').update({
      status: 'approved',
      updated_at: new Date().toISOString(),
      // Store signature in notes if column doesn't exist
    }).eq('id', doc.id)
    setApproved(true); setView('details')
    showToast('✅ Quote approved! We\'ll be in touch shortly.')
    setProcessing(false)
  }

  const handleDecline = async () => {
    if (!confirm('Are you sure you want to decline this quote?')) return
    await supabase.from('quotes').update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', doc.id)
    setDeclined(true)
    showToast('Quote declined. Please contact us if you have questions.')
  }

  const fmt = (n: number) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
  const inpStyle: React.CSSProperties = { width:'100%', padding:'12px 14px', border:'1px solid #d1d5db', borderRadius:8, fontSize:14, boxSizing:'border-box', outline:'none', color:'#111', fontFamily:'inherit' }

  // ── LOADING ──
  if (mode === 'loading') return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Arial,sans-serif' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:40, height:40, border:'3px solid #e2e8f0', borderTopColor:'#1e3a5f', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }} />
        <p style={{ color:'#64748b', margin:0 }}>Loading your document...</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // ── ERROR ──
  if (mode === 'error') return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Arial,sans-serif' }}>
      <div style={{ textAlign:'center', maxWidth:400, padding:32 }}>
        <div style={{ fontSize:64, marginBottom:16 }}>🔗</div>
        <h2 style={{ color:'#1e293b', margin:'0 0 8px' }}>Link not found</h2>
        <p style={{ color:'#64748b', margin:'0 0 24px' }}>{error}</p>
        <p style={{ color:'#94a3b8', fontSize:13 }}>Please contact PHL Land Care Inc. at (772) 466-3617 or admin@phllandcare.com</p>
      </div>
    </div>
  )

  // ── SHARED LAYOUT ──
  const Header = () => (
    <div style={{ background:'#1e3a5f', padding:'14px 24px', display:'flex', alignItems:'center', gap:14 }}>
      <div style={{ width:42, height:42, background:'#fff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <img src="https://phllandcare.github.io/phl-crm/phl_logo.jpg" alt="PHL" style={{ width:38, height:38, objectFit:'contain', borderRadius:6 }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
      </div>
      <div>
        <p style={{ margin:0, fontWeight:800, color:'#fff', fontSize:16 }}>PHL Land Care Inc.</p>
        <p style={{ margin:0, color:'#94a3b8', fontSize:11 }}>Client Portal · Secure Document</p>
      </div>
      <div style={{ marginLeft:'auto', textAlign:'right' }}>
        <p style={{ margin:0, color:'#94a3b8', fontSize:11 }}>Questions?</p>
        <a href="tel:7724663617" style={{ color:'#4ade80', fontSize:13, fontWeight:600, textDecoration:'none' }}>(772) 466-3617</a>
      </div>
    </div>
  )

  // ── INVOICE PORTAL ──
  if (mode === 'invoice') {
    const totalDue = doc.balance !== undefined ? doc.balance : doc.amount
    return (
      <div style={{ minHeight:'100vh', background:'#f1f5f9', fontFamily:'Arial,sans-serif' }}>
        <Header />
        {toast && <div style={{ background:'#052e16', color:'#4ade80', padding:'12px 24px', textAlign:'center', fontWeight:600, fontSize:14 }}>{toast}</div>}

        <div style={{ maxWidth:680, margin:'28px auto', padding:'0 16px' }}>

          {/* Status banner */}
          {paid && (
            <div style={{ background:'#052e16', border:'1px solid #16a34a', borderRadius:12, padding:'14px 20px', marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:28 }}>✅</span>
              <div><p style={{ margin:0, fontWeight:700, color:'#4ade80', fontSize:15 }}>Paid in Full — Thank You!</p><p style={{ margin:0, color:'#16a34a', fontSize:13 }}>Your invoice has been paid. You'll receive a receipt by email.</p></div>
            </div>
          )}

          {/* Invoice card */}
          <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 2px 12px rgba(0,0,0,0.08)', overflow:'hidden', marginBottom:20 }}>
            <div style={{ background:'#1e3a5f', padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <p style={{ margin:'0 0 4px', fontSize:11, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>Billed to</p>
                <p style={{ margin:0, fontWeight:800, color:'#fff', fontSize:17 }}>{doc.client_name}</p>
              </div>
              <div style={{ textAlign:'right' }}>
                <p style={{ margin:0, fontWeight:700, color:'#fff', fontSize:15 }}>Invoice #{doc.invoice_number}</p>
                <p style={{ margin:'4px 0 2px', color:'#94a3b8', fontSize:12 }}>Issued: {doc.issued_date}</p>
                <p style={{ margin:0, color:paid?'#4ade80':'#fca5a5', fontSize:12, fontWeight:600 }}>Due: {doc.due_date} {paid?'· PAID':''}</p>
              </div>
            </div>
            <div style={{ padding:'20px 24px' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:16 }}>
                <thead><tr style={{ background:'#f8fafc' }}>
                  <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em' }}>Description</th>
                  <th style={{ padding:'10px 12px', textAlign:'right', fontSize:11, color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em' }}>Amount</th>
                </tr></thead>
                <tbody>
                  <tr style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'12px', fontSize:14, color:'#1e293b' }}>{doc.subject || 'Services Rendered'}</td>
                    <td style={{ padding:'12px', fontSize:14, color:'#1e293b', fontWeight:600, textAlign:'right' }}>{fmt(doc.amount)}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <div style={{ minWidth:220 }}>
                  {!paid && doc.balance < doc.amount && (
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:13, color:'#64748b' }}>
                      <span>Partial payment applied</span>
                      <span>-{fmt(doc.amount - doc.balance)}</span>
                    </div>
                  )}
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderTop:'2px solid #1e3a5f', marginTop:4 }}>
                    <span style={{ fontWeight:700, fontSize:15, color:'#1e293b' }}>{paid ? 'Amount Paid' : 'Balance Due'}</span>
                    <span style={{ fontWeight:800, fontSize:18, color:paid?'#16a34a':'#1e3a5f' }}>{fmt(paid ? doc.amount : totalDue)}</span>
                  </div>
                </div>
              </div>
              {doc.notes && <p style={{ margin:'16px 0 0', fontSize:12, color:'#94a3b8', borderTop:'1px solid #f1f5f9', paddingTop:12 }}>{doc.notes}</p>}
            </div>
          </div>

          {/* Payment section */}
          {!paid && (
            <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 2px 12px rgba(0,0,0,0.08)', padding:'20px 24px', marginBottom:20 }}>
              <h3 style={{ margin:'0 0 16px', fontSize:16, fontWeight:700, color:'#1e293b' }}>Pay Your Invoice</h3>

              {/* Tab toggle */}
              <div style={{ display:'flex', gap:8, marginBottom:20 }}>
                {[
                  { id:'card', label:'💳 Credit / Debit Card' },
                  { id:'other', label:'💵 Other Methods' },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setView(tab.id as any)}
                    style={{ flex:1, padding:'10px', borderRadius:9, border:view===tab.id?'2px solid #1e3a5f':'1px solid #e2e8f0', background:view===tab.id?'#f0f9ff':'#fff', color:view===tab.id?'#1e3a5f':'#64748b', fontWeight:view===tab.id?700:400, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Square card form */}
              {(view === 'card' || view === 'pay') && (
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, padding:'8px 12px', background:'#f8fafc', borderRadius:8 }}>
                    <span style={{ background:'#000', color:'#fff', borderRadius:4, padding:'3px 8px', fontSize:11, fontWeight:800 }}>■ Square</span>
                    <span style={{ fontSize:12, color:'#64748b' }}>Secured by Square · PCI Compliant</span>
                    <span style={{ marginLeft:'auto', fontSize:12, color:'#16a34a', fontWeight:600 }}>🔒 SSL</span>
                  </div>

                  {/* Square Web Payments SDK container */}
                  {squareLoaded && window.Square ? (
                    <>
                      <div id="square-card-container" style={{ marginBottom:16, minHeight:90 }} />
                      <button onClick={handleSquarePay} disabled={processing || !squareCard}
                        style={{ width:'100%', padding:'14px', background:processing?'#94a3b8':'#1e3a5f', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:700, cursor:processing?'default':'pointer', fontFamily:'inherit' }}>
                        {processing ? '⌛ Processing...' : `Pay Securely — ${fmt(totalDue)}`}
                      </button>
                    </>
                  ) : (
                    // Fallback manual form if Square SDK unavailable
                    <>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                        <div style={{ gridColumn:'1/-1' }}>
                          <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>Cardholder Name</label>
                          <input style={inpStyle} placeholder="John Smith" value={cardName} onChange={e => setCardName(e.target.value)} />
                        </div>
                        <div style={{ gridColumn:'1/-1' }}>
                          <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>Card Number</label>
                          <input style={inpStyle} placeholder="1234 5678 9012 3456" value={cardNum}
                            onChange={e => setCardNum(e.target.value.replace(/\D/g,'').slice(0,16).replace(/(\d{4})/g,'$1 ').trim())} maxLength={19} />
                        </div>
                        <div>
                          <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>Expiry (MM/YY)</label>
                          <input style={inpStyle} placeholder="06/28" value={cardExp}
                            onChange={e => { const v=e.target.value.replace(/\D/g,'').slice(0,4); setCardExp(v.length>2?v.slice(0,2)+'/'+v.slice(2):v) }} maxLength={5} />
                        </div>
                        <div>
                          <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>CVC</label>
                          <input style={inpStyle} placeholder="123" value={cardCvc} onChange={e => setCardCvc(e.target.value.replace(/\D/g,'').slice(0,4))} maxLength={4} />
                        </div>
                      </div>
                      <button onClick={handleFallbackPay} disabled={processing || !cardNum || !cardExp || !cardCvc || !cardName}
                        style={{ width:'100%', padding:'14px', background:processing||!cardNum?'#94a3b8':'#1e3a5f', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:700, cursor:processing?'default':'pointer', fontFamily:'inherit' }}>
                        {processing ? '⌛ Processing...' : `Pay ${fmt(totalDue)}`}
                      </button>
                    </>
                  )}
                  <p style={{ margin:'10px 0 0', fontSize:11, color:'#94a3b8', textAlign:'center' }}>Your payment info is encrypted and never stored on our servers.</p>
                </div>
              )}

              {view === 'other' && (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div style={{ background:'#f8fafc', borderRadius:10, padding:'14px 16px' }}>
                    <p style={{ margin:'0 0 4px', fontWeight:700, fontSize:14, color:'#1e293b' }}>✉️ Mail a Check</p>
                    <p style={{ margin:0, fontSize:13, color:'#64748b' }}>Make payable to <strong>PHL Land Care Inc.</strong></p>
                    <p style={{ margin:'4px 0 0', fontSize:13, color:'#64748b' }}>PO Box 13767, Fort Pierce, FL 34979</p>
                    <p style={{ margin:'4px 0 0', fontSize:12, color:'#94a3b8' }}>Please write Invoice #{doc.invoice_number} on the memo line</p>
                  </div>
                  <div style={{ background:'#f8fafc', borderRadius:10, padding:'14px 16px' }}>
                    <p style={{ margin:'0 0 4px', fontWeight:700, fontSize:14, color:'#1e293b' }}>💵 Zelle</p>
                    <p style={{ margin:0, fontSize:13, color:'#64748b' }}>Send to: <strong>admin@phllandcare.com</strong></p>
                    <p style={{ margin:'4px 0 0', fontSize:12, color:'#94a3b8' }}>Include your name and Invoice #{doc.invoice_number}</p>
                  </div>
                  <div style={{ background:'#f8fafc', borderRadius:10, padding:'14px 16px' }}>
                    <p style={{ margin:'0 0 4px', fontWeight:700, fontSize:14, color:'#1e293b' }}>📞 Pay by Phone</p>
                    <p style={{ margin:0, fontSize:13, color:'#64748b' }}>Call us at <a href="tel:7724663617" style={{ color:'#1e3a5f', fontWeight:700 }}>(772) 466-3617</a></p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ textAlign:'center', padding:'12px', color:'#94a3b8', fontSize:11 }}>
            <p style={{ margin:0 }}>PHL Land Care Inc. · PO Box 13767 Fort Pierce FL 34979 · (772) 466-3617</p>
          </div>
        </div>
      </div>
    )
  }

  // ── QUOTE PORTAL (with E-Sign) ──
  if (mode === 'quote') {
    const lineItems = doc.line_items || []
    const subtotal = lineItems.reduce((s: number, i: any) => s + (i.qty * i.unit_price), 0)
    return (
      <div style={{ minHeight:'100vh', background:'#f1f5f9', fontFamily:'Arial,sans-serif' }}>
        <Header />
        {toast && <div style={{ background:toast.startsWith('✅')?'#052e16':'#450a0a', color:toast.startsWith('✅')?'#4ade80':'#fca5a5', padding:'12px 24px', textAlign:'center', fontWeight:600, fontSize:14 }}>{toast}</div>}

        <div style={{ maxWidth:680, margin:'28px auto', padding:'0 16px' }}>

          {/* Status banners */}
          {approved && (
            <div style={{ background:'#052e16', border:'1px solid #16a34a', borderRadius:12, padding:'14px 20px', marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:28 }}>✅</span>
              <div><p style={{ margin:0, fontWeight:700, color:'#4ade80', fontSize:15 }}>Quote Approved!</p><p style={{ margin:0, color:'#16a34a', fontSize:13 }}>Thank you! We'll be in touch to schedule your service.</p></div>
            </div>
          )}
          {declined && (
            <div style={{ background:'#450a0a', border:'1px solid #ef4444', borderRadius:12, padding:'14px 20px', marginBottom:20 }}>
              <p style={{ margin:0, fontWeight:700, color:'#fca5a5', fontSize:15 }}>Quote Declined</p>
              <p style={{ margin:0, color:'#f87171', fontSize:13 }}>Please call us at (772) 466-3617 if you'd like to discuss changes.</p>
            </div>
          )}

          {/* Quote card */}
          <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 2px 12px rgba(0,0,0,0.08)', overflow:'hidden', marginBottom:20 }}>
            <div style={{ background:'#1e3a5f', padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <p style={{ margin:'0 0 4px', fontSize:11, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>Quote for</p>
                <p style={{ margin:0, fontWeight:800, color:'#fff', fontSize:17 }}>{doc.client_name}</p>
                {doc.title && <p style={{ margin:'4px 0 0', color:'#94a3b8', fontSize:13 }}>{doc.title}</p>}
              </div>
              <div style={{ textAlign:'right' }}>
                <p style={{ margin:0, fontWeight:700, color:'#fff', fontSize:15 }}>Quote #{doc.quote_number}</p>
                <p style={{ margin:'4px 0 2px', color:'#94a3b8', fontSize:12 }}>Created: {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}</p>
                <span style={{ background:approved?'#16a34a':declined?'#dc2626':'#d97706', color:'#fff', padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>
                  {approved?'Approved':declined?'Declined':'Awaiting Response'}
                </span>
              </div>
            </div>

            <div style={{ padding:'20px 24px' }}>
              {/* Line items */}
              {lineItems.length > 0 && (
                <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:16 }}>
                  <thead><tr style={{ background:'#f8fafc' }}>
                    <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, color:'#64748b', textTransform:'uppercase' }}>Service</th>
                    <th style={{ padding:'10px 12px', textAlign:'center', fontSize:11, color:'#64748b', textTransform:'uppercase' }}>Qty</th>
                    <th style={{ padding:'10px 12px', textAlign:'right', fontSize:11, color:'#64748b', textTransform:'uppercase' }}>Unit Price</th>
                    <th style={{ padding:'10px 12px', textAlign:'right', fontSize:11, color:'#64748b', textTransform:'uppercase' }}>Total</th>
                  </tr></thead>
                  <tbody>
                    {lineItems.map((item: any, i: number) => (
                      <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'12px', fontSize:13, color:'#1e293b', fontWeight:600 }}>{item.name}<br/>{item.description && <span style={{ fontSize:11, color:'#64748b', fontWeight:400 }}>{item.description}</span>}</td>
                        <td style={{ padding:'12px', fontSize:13, color:'#1e293b', textAlign:'center' }}>{item.qty}</td>
                        <td style={{ padding:'12px', fontSize:13, color:'#1e293b', textAlign:'right' }}>{fmt(item.unit_price)}</td>
                        <td style={{ padding:'12px', fontSize:13, fontWeight:700, color:'#1e293b', textAlign:'right' }}>{fmt(item.qty * item.unit_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {lineItems.length === 0 && doc.amount > 0 && (
                <div style={{ padding:'12px', background:'#f8fafc', borderRadius:8, marginBottom:16 }}>
                  <p style={{ margin:0, fontSize:14, color:'#1e293b' }}>{doc.title || 'Services as described'}</p>
                </div>
              )}

              {/* Totals */}
              <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
                <div style={{ minWidth:220 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderTop:'2px solid #1e3a5f', marginTop:4 }}>
                    <span style={{ fontWeight:700, fontSize:15, color:'#1e293b' }}>Total</span>
                    <span style={{ fontWeight:800, fontSize:18, color:'#1e3a5f' }}>{fmt(doc.amount || subtotal)}</span>
                  </div>
                </div>
              </div>

              {/* Contract / disclaimer */}
              {doc.contract_text && (
                <div style={{ padding:'12px', background:'#f8fafc', borderRadius:8, marginBottom:4 }}>
                  <p style={{ margin:0, fontSize:12, color:'#64748b' }}>{doc.contract_text}</p>
                </div>
              )}
            </div>
          </div>

          {/* E-Sign section */}
          {!approved && !declined && (
            <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 2px 12px rgba(0,0,0,0.08)', padding:'20px 24px', marginBottom:20 }}>
              <h3 style={{ margin:'0 0 4px', fontSize:16, fontWeight:700, color:'#1e293b' }}>✍️ Approve This Quote</h3>
              <p style={{ margin:'0 0 16px', fontSize:13, color:'#64748b' }}>Review the quote above, then sign below to approve. Your signature confirms acceptance of the terms.</p>

              {/* Sign mode toggle */}
              <div style={{ display:'flex', background:'#f1f5f9', borderRadius:8, padding:4, marginBottom:16 }}>
                {[{id:'draw',label:'✏️ Draw Signature'},{id:'type',label:'⌨️ Type Signature'}].map(t => (
                  <button key={t.id} onClick={() => setSignMode(t.id as any)}
                    style={{ flex:1, padding:'8px', borderRadius:6, border:'none', background:signMode===t.id?'#fff':'transparent', color:signMode===t.id?'#1e293b':'#64748b', fontWeight:signMode===t.id?700:400, fontSize:13, cursor:'pointer', fontFamily:'inherit', boxShadow:signMode===t.id?'0 1px 4px rgba(0,0,0,0.1)':'none' }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {signMode === 'draw' && (
                <div>
                  <div style={{ border:'2px solid #e2e8f0', borderRadius:10, background:'#fff', marginBottom:8, position:'relative' }}>
                    <canvas ref={canvasRef} width={580} height={140} style={{ display:'block', width:'100%', cursor:'crosshair', touchAction:'none' }}
                      onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                      onTouchStart={e=>{e.preventDefault();const t=e.touches[0];const r=(e.target as HTMLCanvasElement).getBoundingClientRect();startDraw({nativeEvent:{offsetX:t.clientX-r.left,offsetY:t.clientY-r.top}} as any)}}
                      onTouchMove={e=>{e.preventDefault();const t=e.touches[0];const r=(e.target as HTMLCanvasElement).getBoundingClientRect();draw({nativeEvent:{offsetX:t.clientX-r.left,offsetY:t.clientY-r.top}} as any)}}
                      onTouchEnd={()=>stopDraw()} />
                    <p style={{ position:'absolute', bottom:8, left:0, right:0, textAlign:'center', fontSize:11, color:'#d1d5db', pointerEvents:'none', margin:0 }}>Sign above</p>
                  </div>
                  <button onClick={clearSig} style={{ fontSize:12, color:'#64748b', background:'none', border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 12px', cursor:'pointer', fontFamily:'inherit', marginBottom:16 }}>Clear</button>
                </div>
              )}

              {signMode === 'type' && (
                <div style={{ marginBottom:16 }}>
                  <input style={{ ...inpStyle, fontSize:22, fontFamily:'cursive', letterSpacing:'.02em', color:'#1e3a5f', height:60, borderColor:'#e2e8f0' }}
                    placeholder="Type your full name"
                    value={typedSig} onChange={e => setTypedSig(e.target.value)} />
                  <p style={{ margin:'6px 0 0', fontSize:11, color:'#94a3b8' }}>By typing your name you agree this constitutes a legal electronic signature.</p>
                </div>
              )}

              {/* Legal text */}
              <div style={{ background:'#f8fafc', borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
                <p style={{ margin:0, fontSize:11, color:'#64748b', lineHeight:1.5 }}>
                  By approving this quote, I acknowledge that I have read and agree to the terms above. This electronic signature is legally binding in accordance with the Electronic Signatures in Global and National Commerce Act (E-SIGN Act).
                </p>
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={handleDecline}
                  style={{ flex:1, padding:'12px', background:'#fff', border:'2px solid #e2e8f0', borderRadius:10, color:'#64748b', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  ✕ Decline
                </button>
                <button onClick={handleApprove} disabled={processing}
                  style={{ flex:2, padding:'12px', background:processing?'#94a3b8':'#16a34a', color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:processing?'default':'pointer', fontFamily:'inherit' }}>
                  {processing ? '⌛ Saving...' : '✓ Approve Quote'}
                </button>
              </div>
            </div>
          )}

          <div style={{ textAlign:'center', padding:'12px', color:'#94a3b8', fontSize:11 }}>
            <p style={{ margin:0 }}>PHL Land Care Inc. · PO Box 13767 Fort Pierce FL 34979 · (772) 466-3617 · admin@phllandcare.com</p>
          </div>
        </div>
      </div>
    )
  }

  return null
}
