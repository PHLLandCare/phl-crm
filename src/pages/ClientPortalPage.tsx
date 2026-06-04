import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ── Public client portal — accessed via /#/portal?invoice=ID or /#/portal?client=NAME ──
export default function ClientPortalPage() {
  const [invoice, setInvoice]   = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [paid, setPaid]         = useState(false)
  const [showPayForm, setShowPayForm] = useState(false)
  const [cardNum, setCardNum]   = useState('')
  const [cardExp, setCardExp]   = useState('')
  const [cardCvc, setCardCvc]   = useState('')
  const [name, setName]         = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
    const invId = params.get('invoice')
    const clientName = params.get('client')

    const load = async () => {
      setLoading(true)
      if (invId) {
        const { data, error: err } = await supabase.from('invoices').select('*').eq('id', invId).single()
        if (err || !data) { setError('Invoice not found'); setLoading(false); return }
        setInvoice(data)
        setPaid(data.status === 'paid' || data.status === 'Paid')
      } else if (clientName) {
        const { data } = await supabase.from('invoices').select('*')
          .eq('client_name', clientName).is('deleted_at', null)
          .order('created_at', { ascending: false }).limit(1)
        if (data?.[0]) {
          setInvoice(data[0])
          setPaid(data[0].status === 'paid' || data[0].status === 'Paid')
        } else {
          setError('No invoices found for this client')
        }
      } else {
        setError('No invoice ID provided')
      }
      setLoading(false)
    }
    load()
  }, [])

  const handlePay = async () => {
    if (!cardNum || !cardExp || !cardCvc || !name) return
    setProcessing(true)
    // Simulate Square payment processing
    await new Promise(r => setTimeout(r, 2000))
    // Mark invoice as paid in Supabase
    if (invoice) {
      await supabase.from('invoices').update({
        status: 'paid', balance: 0, updated_at: new Date().toISOString()
      }).eq('id', invoice.id)
    }
    setProcessing(false)
    setPaid(true)
    setShowPayForm(false)
  }

  const fmt = (n: number) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })

  const inp: React.CSSProperties = {
    width:'100%', padding:'12px 14px', border:'1px solid #e2e8f0', borderRadius:8,
    fontSize:14, boxSizing:'border-box', outline:'none', color:'#111', fontFamily:'inherit'
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Arial,sans-serif' }}>
      <p style={{ color:'#64748b' }}>Loading your invoice...</p>
    </div>
  )

  if (error) return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Arial,sans-serif' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>📄</div>
        <h2 style={{ color:'#1e293b' }}>Invoice Not Found</h2>
        <p style={{ color:'#64748b' }}>{error}</p>
        <p style={{ color:'#64748b', fontSize:14 }}>Please contact PHL Land Care Inc. at (772) 466-3617</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#f1f5f9', fontFamily:'Arial,sans-serif' }}>
      {/* Header */}
      <div style={{ background:'#1e3a5f', padding:'16px 24px', display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ width:48, height:48, background:'#fff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#1e3a5f', textAlign:'center' }}>PHL</div>
        <div>
          <h1 style={{ margin:0, color:'#fff', fontSize:18, fontWeight:700 }}>PHL Land Care Inc.</h1>
          <p style={{ margin:0, color:'#94a3b8', fontSize:12 }}>Client Portal</p>
        </div>
      </div>

      {/* Invoice */}
      <div style={{ maxWidth:700, margin:'32px auto', padding:'0 16px' }}>
        {paid && (
          <div style={{ background:'#052e16', border:'1px solid #16a34a', borderRadius:12, padding:'16px 20px', marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:24 }}>✅</span>
            <div>
              <p style={{ margin:0, fontWeight:700, color:'#4ade80', fontSize:15 }}>Payment Received — Thank You!</p>
              <p style={{ margin:0, color:'#16a34a', fontSize:13 }}>Your invoice has been paid in full.</p>
            </div>
          </div>
        )}

        <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 2px 12px rgba(0,0,0,0.08)', overflow:'hidden' }}>
          {/* Invoice header */}
          <div style={{ background:'#1e3a5f', padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <p style={{ margin:'0 0 4px', fontSize:12, color:'#94a3b8', textTransform:'uppercase' }}>Billed to</p>
              <p style={{ margin:0, fontWeight:700, color:'#fff', fontSize:16 }}>{invoice.client_name}</p>
            </div>
            <div style={{ textAlign:'right' }}>
              <p style={{ margin:0, fontWeight:700, color:'#fff', fontSize:15 }}>Invoice #{invoice.invoice_number}</p>
              <p style={{ margin:'4px 0 0', color:'#94a3b8', fontSize:12 }}>Issued: {invoice.issued_date}</p>
              <p style={{ margin:'2px 0 0', color:'#94a3b8', fontSize:12 }}>Due: {invoice.due_date}</p>
            </div>
          </div>

          <div style={{ padding:'24px' }}>
            {/* Services */}
            <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:20 }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>Description</th>
                  <th style={{ padding:'10px 12px', textAlign:'right', fontSize:11, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'12px', fontSize:14, color:'#1e293b' }}>{invoice.subject || 'Services Rendered'}</td>
                  <td style={{ padding:'12px', fontSize:14, color:'#1e293b', fontWeight:600, textAlign:'right' }}>{fmt(invoice.amount || 0)}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:24 }}>
              <div style={{ minWidth:200 }}>
                <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderTop:'2px solid #1e293b' }}>
                  <span style={{ fontWeight:700, fontSize:15, color:'#1e293b' }}>Total Due</span>
                  <span style={{ fontWeight:800, fontSize:18, color:'#1e3a5f' }}>{fmt(invoice.balance || invoice.amount || 0)}</span>
                </div>
              </div>
            </div>

            {/* Payment */}
            {!paid && (
              <>
                {!showPayForm ? (
                  <div style={{ textAlign:'center', paddingTop:16, borderTop:'1px solid #f1f5f9' }}>
                    <p style={{ margin:'0 0 16px', color:'#64748b', fontSize:14 }}>Pay securely with your credit card via Square</p>
                    <button onClick={() => setShowPayForm(true)}
                      style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:10, padding:'14px 32px', fontSize:15, fontWeight:700, cursor:'pointer', width:'100%', maxWidth:300 }}>
                      💳 Pay Now — {fmt(invoice.balance || invoice.amount || 0)}
                    </button>
                    <p style={{ margin:'12px 0 0', color:'#94a3b8', fontSize:12 }}>Or mail a check to: PHL Land Care Inc., PO Box 13767, Fort Pierce, FL 34979</p>
                    <p style={{ margin:'4px 0 0', color:'#94a3b8', fontSize:12 }}>Questions? Call (772) 466-3617</p>
                  </div>
                ) : (
                  <div style={{ paddingTop:16, borderTop:'1px solid #f1f5f9' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                      <span style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 10px', fontSize:12, fontWeight:700, color:'#1e293b' }}>■ Square</span>
                      <span style={{ fontSize:13, color:'#64748b' }}>Secure payment</span>
                      <span style={{ marginLeft:'auto', fontSize:12, color:'#94a3b8' }}>🔒 SSL Encrypted</span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                      <div style={{ gridColumn:'1/-1' }}>
                        <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>Cardholder Name</label>
                        <input style={inp} placeholder="John Smith" value={name} onChange={e => setName(e.target.value)} />
                      </div>
                      <div style={{ gridColumn:'1/-1' }}>
                        <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>Card Number</label>
                        <input style={inp} placeholder="1234 5678 9012 3456" value={cardNum} onChange={e => setCardNum(e.target.value.replace(/\D/g,'').slice(0,16).replace(/(\d{4})/g,'$1 ').trim())} maxLength={19} />
                      </div>
                      <div>
                        <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>Expiry</label>
                        <input style={inp} placeholder="MM/YY" value={cardExp} onChange={e => setCardExp(e.target.value)} maxLength={5} />
                      </div>
                      <div>
                        <label style={{ fontSize:12, fontWeight:600, color:'#64748b', display:'block', marginBottom:4 }}>CVC</label>
                        <input style={inp} placeholder="123" value={cardCvc} onChange={e => setCardCvc(e.target.value.replace(/\D/g,'').slice(0,4))} maxLength={4} />
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={() => setShowPayForm(false)} style={{ flex:1, padding:'12px', border:'1px solid #e2e8f0', borderRadius:9, background:'transparent', color:'#64748b', cursor:'pointer', fontSize:14, fontFamily:'inherit' }}>Back</button>
                      <button onClick={handlePay} disabled={processing || !cardNum || !cardExp || !cardCvc || !name}
                        style={{ flex:2, padding:'12px', border:'none', borderRadius:9, background:processing?'#94a3b8':'#16a34a', color:'#fff', cursor:processing?'default':'pointer', fontSize:14, fontWeight:700, fontFamily:'inherit' }}>
                        {processing ? '⌛ Processing...' : `Pay ${fmt(invoice.balance || invoice.amount || 0)}`}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Contract note */}
            <div style={{ marginTop:24, paddingTop:16, borderTop:'1px solid #f1f5f9' }}>
              <p style={{ margin:0, fontSize:12, color:'#94a3b8' }}>
                {invoice.notes || 'Thank you for your business. Please contact us with any questions regarding this invoice.'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign:'center', marginTop:24, padding:'16px', color:'#94a3b8', fontSize:12 }}>
          <p style={{ margin:0 }}>PHL Land Care Inc. | PO Box 13767, Fort Pierce, FL 34979</p>
          <p style={{ margin:'4px 0 0' }}>(772) 466-3617 | admin@phllandcare.com | phllandcare.com</p>
        </div>
      </div>
    </div>
  )
}
