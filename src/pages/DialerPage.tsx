import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const inp: React.CSSProperties = { width:'100%',padding:'10px 14px',background:'#1a2332',border:'1px solid #2d3f55',borderRadius:8,fontSize:14,boxSizing:'border-box',outline:'none',color:'#f1f5f9',fontFamily:'inherit' }
const lbl: React.CSSProperties = { fontSize:12,fontWeight:700,color:'#94a3b8',display:'block',marginBottom:6 }

interface CallLog {
  id: string
  direction: 'outbound' | 'inbound'
  to_number: string
  from_number: string
  client_name?: string
  duration_seconds?: number
  status: 'completed' | 'failed' | 'no-answer' | 'busy' | 'in-progress'
  call_sid?: string
  notes?: string
  created_at: string
}

interface SmsLog {
  id: string
  direction: 'outbound' | 'inbound'
  to_number: string
  from_number: string
  client_name?: string
  message: string
  status: 'sent' | 'delivered' | 'failed' | 'received'
  created_at: string
}

interface FaxLog {
  id: string
  direction: 'outbound' | 'inbound'
  to_number: string
  from_number: string
  client_name?: string
  pages?: number
  status: 'sent' | 'failed' | 'received' | 'sending'
  fax_sid?: string
  created_at: string
}

type Tab = 'dialer' | 'sms' | 'fax' | 'history'

export default function DialerPage() {
  const [tab, setTab] = useState<Tab>('dialer')
  const [toast, setToast] = useState('')
  const [swConfigured, setSwConfigured] = useState(false)
  const [swPhone, setSwPhone] = useState('')

  // Dialer state
  const [dialInput, setDialInput] = useState('')
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected' | 'ended'>('idle')
  const [callDuration, setCallDuration] = useState(0)
  const [callNotes, setCallNotes] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clients, setClients] = useState<{id:number;name:string;phone?:string}[]>([])
  const [filteredClients, setFilteredClients] = useState<{id:number;name:string;phone?:string}[]>([])
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // SMS state
  const [smsTo, setSmsTo] = useState('')
  const [smsMsg, setSmsMsg] = useState('')
  const [smsSending, setSmsSending] = useState(false)
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([])

  // Fax state
  const [faxTo, setFaxTo] = useState('')
  const [faxFile, setFaxFile] = useState<File | null>(null)
  const [faxSending, setFaxSending] = useState(false)
  const [faxLogs, setFaxLogs] = useState<FaxLog[]>([])
  const [faxBase64, setFaxBase64] = useState('')

  // Call history
  const [callLogs, setCallLogs] = useState<CallLog[]>([])
  const [histFilter, setHistFilter] = useState<'all'|'calls'|'sms'|'fax'>('all')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  useEffect(() => {
    const loadSettings = async () => {
      const { data: s } = await supabase.from('org_settings').select('signalwire_project_id,signalwire_phone_number').limit(1).single()
      if (s?.signalwire_project_id) {
        setSwConfigured(true)
        setSwPhone(s.signalwire_phone_number || '')
      }
    }
    const loadClients = async () => {
      const { data } = await supabase.from('clients').select('id,name,phone').order('name').limit(200)
      if (data) setClients(data)
    }
    const loadLogs = async () => {
      const { data: calls } = await supabase.from('call_logs').select('*').order('created_at', { ascending: false }).limit(50)
      if (calls) setCallLogs(calls)
      const { data: sms } = await supabase.from('sms_logs').select('*').order('created_at', { ascending: false }).limit(50)
      if (sms) setSmsLogs(sms)
      const { data: faxes } = await supabase.from('fax_logs').select('*').order('created_at', { ascending: false }).limit(50)
      if (faxes) setFaxLogs(faxes)
    }
    loadSettings()
    loadClients()
    loadLogs()
  }, [])

  useEffect(() => {
    if (!clientSearch.trim()) { setFilteredClients([]); return }
    const q = clientSearch.toLowerCase()
    setFilteredClients(clients.filter(c => c.name.toLowerCase().includes(q) || (c.phone||'').includes(q)).slice(0, 6))
  }, [clientSearch, clients])

  const dialKey = (key: string) => {
    if (dialInput.length < 15) setDialInput(v => v + key)
  }
  const clearDial = () => setDialInput(v => v.slice(0, -1))

  const formatDuration = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`

  const startCall = async () => {
    if (!dialInput || dialInput.length < 7) { showToast('⚠️ Enter a valid phone number'); return }
    if (!swConfigured) { showToast('⚠️ Configure SignalWire in Settings first'); return }
    setCallStatus('calling')
    setCallDuration(0)
    try {
      const { error } = await supabase.functions.invoke('signalwire-call', {
        body: { action: 'dial', to: dialInput.startsWith('+') ? dialInput : `+1${dialInput.replace(/\D/g,'')}` }
      })
      if (error) throw error
      setCallStatus('connected')
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    } catch (e: any) {
      setCallStatus('idle')
      showToast('⚠️ Call failed: ' + (e.message || 'Check SignalWire settings'))
    }
  }

  const endCall = async () => {
    if (callTimerRef.current) clearInterval(callTimerRef.current)
    setCallStatus('ended')
    // Log the call
    try {
      await supabase.from('call_logs').insert({
        direction: 'outbound',
        to_number: dialInput,
        from_number: swPhone,
        duration_seconds: callDuration,
        status: 'completed',
        notes: callNotes,
      })
    } catch {}
    setTimeout(() => { setCallStatus('idle'); setCallDuration(0); setCallNotes('') }, 1500)
    showToast(`✅ Call ended — ${formatDuration(callDuration)}`)
  }

  const sendSms = async () => {
    if (!smsTo || !smsMsg.trim()) { showToast('⚠️ Enter number and message'); return }
    if (!swConfigured) { showToast('⚠️ Configure SignalWire in Settings first'); return }
    setSmsSending(true)
    try {
      const { error } = await supabase.functions.invoke('send-sms', {
        body: { to: smsTo.startsWith('+') ? smsTo : `+1${smsTo.replace(/\D/g,'')}`, message: smsMsg }
      })
      if (error) throw error
      // Log it
      await supabase.from('sms_logs').insert({
        direction: 'outbound', to_number: smsTo, from_number: swPhone,
        message: smsMsg, status: 'sent'
      }).select().single().then(({ data }) => {
        if (data) setSmsLogs(prev => [data, ...prev])
      })
      setSmsMsg('')
      showToast('✅ SMS sent!')
    } catch (e: any) {
      showToast('⚠️ SMS failed: ' + (e.message || 'Check SignalWire settings'))
    }
    setSmsSending(false)
  }

  const sendFax = async () => {
    if (!faxTo || !faxBase64) { showToast('⚠️ Enter fax number and select a PDF'); return }
    if (!swConfigured) { showToast('⚠️ Configure SignalWire in Settings first'); return }
    setFaxSending(true)
    try {
      const { error } = await supabase.functions.invoke('send-fax', {
        body: {
          to: faxTo.startsWith('+') ? faxTo : `+1${faxTo.replace(/\D/g,'')}`,
          from: swPhone,
          pdf_base64: faxBase64,
          filename: faxFile?.name || 'document.pdf'
        }
      })
      if (error) throw error
      await supabase.from('fax_logs').insert({
        direction: 'outbound', to_number: faxTo, from_number: swPhone,
        pages: 1, status: 'sending'
      }).select().single().then(({ data }) => {
        if (data) setFaxLogs(prev => [data, ...prev])
      })
      setFaxTo('')
      setFaxFile(null)
      setFaxBase64('')
      showToast('✅ Fax queued for delivery!')
    } catch (e: any) {
      showToast('⚠️ Fax failed: ' + (e.message || 'Check SignalWire settings'))
    }
    setFaxSending(false)
  }

  const handleFaxFile = (file: File) => {
    setFaxFile(file)
    const reader = new FileReader()
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1]
      setFaxBase64(b64)
    }
    reader.readAsDataURL(file)
  }

  const card: React.CSSProperties = { background:'#0f172a',borderRadius:16,border:'1px solid #1e293b',padding:'1.5rem',marginBottom:'1.25rem' }

  const dialKeys = [
    ['1','',''],['2','ABC',''],['3','DEF',''],
    ['4','GHI',''],['5','JKL',''],['6','MNO',''],
    ['7','PQRS',''],['8','TUV',''],['9','WXYZ',''],
    ['*','',''],['0','+',''],['#','',''],
  ]

  const formatPhone = (p: string) => {
    const d = p.replace(/\D/g,'')
    if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
    if (d.length === 11 && d[0]==='1') return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
    return p
  }

  const statusColor = (s: string) => {
    if (['completed','sent','delivered','received'].includes(s)) return '#4ade80'
    if (['failed'].includes(s)) return '#f87171'
    if (['in-progress','sending'].includes(s)) return '#fbbf24'
    return '#94a3b8'
  }

  return (
    <div style={{ background:'#0a0f1a',minHeight:'100vh',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',color:'#f1f5f9' }}>
      {toast && (
        <div style={{ position:'fixed',top:'1rem',right:'1rem',background:'#0d1526',border:'1px solid #4ade80',borderRadius:10,padding:'10px 18px',fontSize:14,color:'#4ade80',fontWeight:600,zIndex:9999 }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ background:'#0d1526',borderBottom:'1px solid #1e293b',padding:'1rem 1.5rem',display:'flex',alignItems:'center',gap:16 }}>
        <div style={{ width:40,height:40,borderRadius:10,background:'linear-gradient(135deg,#5B2D8E,#7C3AED)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18 }}>📞</div>
        <div>
          <h1 style={{ margin:0,fontSize:18,fontWeight:700 }}>Dialer</h1>
          <p style={{ margin:0,fontSize:12,color:'#64748b' }}>Calls · SMS · Fax via SignalWire</p>
        </div>
        {swConfigured ? (
          <span style={{ marginLeft:'auto',fontSize:12,fontWeight:600,background:'#052e16',color:'#4ade80',padding:'4px 12px',borderRadius:20,border:'1px solid #16a34a' }}>
            📡 SignalWire Active
          </span>
        ) : (
          <span style={{ marginLeft:'auto',fontSize:12,fontWeight:600,background:'#1a1000',color:'#fcd34d',padding:'4px 12px',borderRadius:20,border:'1px solid #d97706' }}>
            ⚠️ Setup needed — Go to Settings → Integrations
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex',borderBottom:'1px solid #1e293b',background:'#0d1526',padding:'0 1.5rem' }}>
        {([
          { id:'dialer', icon:'📞', label:'Dialer' },
          { id:'sms',    icon:'💬', label:'SMS' },
          { id:'fax',    icon:'📠', label:'Fax' },
          { id:'history',icon:'📋', label:'History' },
        ] as {id:Tab;icon:string;label:string}[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'14px 20px',background:'none',border:'none',borderBottom:tab===t.id?'2px solid #7C3AED':'2px solid transparent',color:tab===t.id?'#f1f5f9':'#64748b',fontSize:14,fontWeight:tab===t.id?700:400,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding:'1.5rem',maxWidth:900,margin:'0 auto' }}>

        {/* ── DIALER TAB ── */}
        {tab === 'dialer' && (
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem' }}>

            {/* Left: dial pad */}
            <div style={card}>
              <h2 style={{ margin:'0 0 1rem',fontSize:16,fontWeight:700,color:'#f1f5f9' }}>Make a Call</h2>

              {/* Client search */}
              <div style={{ position:'relative',marginBottom:12 }}>
                <input style={inp} placeholder="🔍 Search client by name or number..."
                  value={clientSearch} onChange={e=>setClientSearch(e.target.value)} />
                {filteredClients.length > 0 && (
                  <div style={{ position:'absolute',top:'100%',left:0,right:0,background:'#1e293b',border:'1px solid #334155',borderRadius:8,zIndex:50,overflow:'hidden' }}>
                    {filteredClients.map(c => (
                      <div key={c.id} onClick={() => { setDialInput((c.phone||'').replace(/\D/g,'')); setClientSearch(''); setFilteredClients([]) }}
                        style={{ padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #334155',display:'flex',justifyContent:'space-between',alignItems:'center' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='#334155')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                        <span style={{ fontSize:13,fontWeight:600 }}>{c.name}</span>
                        <span style={{ fontSize:12,color:'#64748b' }}>{c.phone || 'No phone'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Display */}
              <div style={{ background:'#1a2332',borderRadius:12,padding:'16px',marginBottom:16,textAlign:'center',border:'1px solid #2d3f55',minHeight:64,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center' }}>
                {callStatus === 'connected' && (
                  <p style={{ margin:'0 0 4px',fontSize:11,color:'#4ade80',fontWeight:600 }}>CONNECTED · {formatDuration(callDuration)}</p>
                )}
                {callStatus === 'calling' && (
                  <p style={{ margin:'0 0 4px',fontSize:11,color:'#fbbf24',fontWeight:600 }}>CALLING...</p>
                )}
                <p style={{ margin:0,fontSize:26,fontWeight:300,letterSpacing:4,color:'#f1f5f9',fontFamily:'monospace' }}>
                  {dialInput ? formatPhone(dialInput) : <span style={{ color:'#334155' }}>Enter number</span>}
                </p>
              </div>

              {/* Keypad */}
              <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16 }}>
                {dialKeys.map(([num, sub]) => (
                  <button key={num + sub} onClick={() => dialKey(num)}
                    style={{ padding:'14px 8px',background:'#1e293b',border:'1px solid #334155',borderRadius:10,cursor:'pointer',fontFamily:'inherit',transition:'background .1s', display:'flex',flexDirection:'column',alignItems:'center',gap:1 }}
                    onMouseEnter={e=>(e.currentTarget.style.background='#334155')} onMouseLeave={e=>(e.currentTarget.style.background='#1e293b')}>
                    <span style={{ fontSize:20,fontWeight:600,color:'#f1f5f9',lineHeight:1 }}>{num}</span>
                    {sub && <span style={{ fontSize:8,color:'#64748b',letterSpacing:'0.1em' }}>{sub}</span>}
                  </button>
                ))}
              </div>

              {/* Action buttons */}
              <div style={{ display:'flex',gap:8,justifyContent:'center' }}>
                <button onClick={clearDial}
                  style={{ flex:1,padding:'12px',background:'#1e293b',border:'1px solid #334155',borderRadius:10,color:'#94a3b8',fontSize:18,cursor:'pointer',fontFamily:'inherit' }}>
                  ⌫
                </button>
                {callStatus === 'idle' || callStatus === 'ended' ? (
                  <button onClick={startCall}
                    style={{ flex:2,padding:'12px',background:'#16a34a',border:'none',borderRadius:10,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
                    📞 Call
                  </button>
                ) : (
                  <button onClick={endCall}
                    style={{ flex:2,padding:'12px',background:'#dc2626',border:'none',borderRadius:10,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:8,animation:'pulse 1s infinite' }}>
                    📵 End Call
                  </button>
                )}
              </div>

              {/* Call notes (show during/after call) */}
              {(callStatus === 'connected' || callStatus === 'ended') && (
                <div style={{ marginTop:12 }}>
                  <label style={lbl}>Call Notes</label>
                  <textarea style={{ ...inp,height:72,resize:'none' } as React.CSSProperties}
                    placeholder="Notes about this call..."
                    value={callNotes} onChange={e=>setCallNotes(e.target.value)} />
                </div>
              )}
            </div>

            {/* Right: recent calls */}
            <div style={card}>
              <h2 style={{ margin:'0 0 1rem',fontSize:16,fontWeight:700,color:'#f1f5f9' }}>Recent Calls</h2>
              {callLogs.length === 0 ? (
                <div style={{ textAlign:'center',padding:'2rem',color:'#475569' }}>
                  <p style={{ fontSize:32 }}>📞</p>
                  <p style={{ margin:0,fontSize:13 }}>No call history yet</p>
                </div>
              ) : (
                <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                  {callLogs.slice(0,10).map(c => (
                    <div key={c.id} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 12px',background:'#1e293b',borderRadius:10,cursor:'pointer' }}
                      onClick={() => setDialInput(c.to_number.replace(/\D/g,''))}
                      onMouseEnter={e=>(e.currentTarget.style.background='#334155')} onMouseLeave={e=>(e.currentTarget.style.background='#1e293b')}>
                      <span style={{ fontSize:18 }}>{c.direction==='inbound'?'📲':'📞'}</span>
                      <div style={{ flex:1,minWidth:0 }}>
                        <p style={{ margin:'0 0 2px',fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
                          {c.client_name || formatPhone(c.to_number)}
                        </p>
                        <p style={{ margin:0,fontSize:11,color:'#64748b' }}>
                          {new Date(c.created_at).toLocaleDateString()} · {c.duration_seconds ? formatDuration(c.duration_seconds) : '—'}
                        </p>
                      </div>
                      <span style={{ fontSize:11,fontWeight:600,color:statusColor(c.status) }}>{c.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SMS TAB ── */}
        {tab === 'sms' && (
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem' }}>
            <div style={card}>
              <h2 style={{ margin:'0 0 1rem',fontSize:16,fontWeight:700 }}>Send SMS</h2>
              <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
                <div>
                  <label style={lbl}>To (phone number)</label>
                  <input style={inp} placeholder="+17725551234 or search client"
                    value={smsTo} onChange={e=>setSmsTo(e.target.value)} />
                </div>
                <div style={{ position:'relative' }}>
                  <label style={lbl}>Or pick a client</label>
                  <input style={inp} placeholder="🔍 Search clients..."
                    value={clientSearch} onChange={e=>setClientSearch(e.target.value)} />
                  {filteredClients.length > 0 && (
                    <div style={{ position:'absolute',top:'100%',left:0,right:0,background:'#1e293b',border:'1px solid #334155',borderRadius:8,zIndex:50 }}>
                      {filteredClients.map(c => (
                        <div key={c.id} onClick={() => { setSmsTo((c.phone||'').replace(/\D/g,'')); setClientSearch(''); setFilteredClients([]) }}
                          style={{ padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #2d3f55',display:'flex',justifyContent:'space-between' }}
                          onMouseEnter={e=>(e.currentTarget.style.background='#334155')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                          <span style={{ fontSize:13,fontWeight:600 }}>{c.name}</span>
                          <span style={{ fontSize:12,color:'#64748b' }}>{c.phone || 'No phone'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label style={lbl}>Message</label>
                  <textarea style={{ ...inp,height:120,resize:'vertical' } as React.CSSProperties}
                    placeholder="Type your message..."
                    value={smsMsg} onChange={e=>setSmsMsg(e.target.value)} />
                  <p style={{ margin:'4px 0 0',fontSize:11,color:'#475569',textAlign:'right' }}>{smsMsg.length}/160 chars</p>
                </div>
                {/* Quick templates */}
                <div>
                  <p style={{ margin:'0 0 6px',fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase' }}>Quick Templates</p>
                  <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
                    {[
                      'Your PHL Land Care appointment is confirmed for tomorrow. Reply STOP to opt out.',
                      'Hi! Your lawn service is scheduled for today. Our crew is on the way.',
                      'Your invoice is ready. Pay online: phllandcare.github.io/phl-crm/#/portal',
                      'Thank you for your business! Please leave us a review when you get a chance.',
                    ].map((tmpl, i) => (
                      <button key={i} onClick={() => setSmsMsg(tmpl)}
                        style={{ textAlign:'left',padding:'8px 12px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#94a3b8',fontSize:12,cursor:'pointer',fontFamily:'inherit' }}>
                        {tmpl.length > 65 ? tmpl.slice(0,65) + '…' : tmpl}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={sendSms} disabled={smsSending}
                  style={{ padding:'12px',background:'#7C3AED',border:'none',borderRadius:10,color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:smsSending?0.7:1 }}>
                  {smsSending ? 'Sending...' : '💬 Send SMS'}
                </button>
              </div>
            </div>

            <div style={card}>
              <h2 style={{ margin:'0 0 1rem',fontSize:16,fontWeight:700 }}>Sent Messages</h2>
              {smsLogs.length === 0 ? (
                <div style={{ textAlign:'center',padding:'2rem',color:'#475569' }}>
                  <p style={{ fontSize:32 }}>💬</p>
                  <p style={{ margin:0,fontSize:13 }}>No SMS history yet</p>
                </div>
              ) : (
                <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                  {smsLogs.slice(0,15).map(s => (
                    <div key={s.id} style={{ padding:'10px 12px',background:'#1e293b',borderRadius:10,borderLeft:`3px solid ${s.direction==='inbound'?'#7C3AED':'#16a34a'}` }}>
                      <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4 }}>
                        <span style={{ fontSize:12,fontWeight:600,color:s.direction==='inbound'?'#a78bfa':'#4ade80' }}>
                          {s.direction==='inbound'?'↓ Inbound':'↑ Outbound'} · {formatPhone(s.direction==='inbound'?s.from_number:s.to_number)}
                        </span>
                        <span style={{ fontSize:11,color:statusColor(s.status) }}>{s.status}</span>
                      </div>
                      <p style={{ margin:'0 0 4px',fontSize:13,color:'#f1f5f9' }}>{s.message}</p>
                      <p style={{ margin:0,fontSize:11,color:'#475569' }}>{new Date(s.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── FAX TAB ── */}
        {tab === 'fax' && (
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem' }}>
            <div style={card}>
              <h2 style={{ margin:'0 0 1rem',fontSize:16,fontWeight:700 }}>Send a Fax</h2>
              <div style={{ background:'rgba(92,45,142,0.1)',border:'1px solid rgba(124,58,237,0.3)',borderRadius:10,padding:'12px 14px',marginBottom:16 }}>
                <p style={{ margin:'0 0 4px',fontSize:12,fontWeight:700,color:'#a78bfa' }}>📠 How it works</p>
                <p style={{ margin:0,fontSize:12,color:'#94a3b8' }}>Upload a PDF → Enter fax number → Send. SignalWire delivers it as a traditional fax to any fax machine.</p>
              </div>
              <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
                <div>
                  <label style={lbl}>Fax number (recipient)</label>
                  <input style={inp} placeholder="+17725551234" value={faxTo} onChange={e=>setFaxTo(e.target.value)} />
                  <p style={{ margin:'4px 0 0',fontSize:11,color:'#475569' }}>E.164 format or 10-digit US number</p>
                </div>
                <div>
                  <label style={lbl}>Document (PDF)</label>
                  <div style={{ border:'2px dashed #334155',borderRadius:10,padding:'1.5rem',textAlign:'center',cursor:'pointer',background:'#1a2332' }}
                    onClick={() => document.getElementById('fax-file-input')?.click()}
                    onDragOver={e=>e.preventDefault()}
                    onDrop={e=>{ e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) handleFaxFile(f) }}>
                    <input id="fax-file-input" type="file" accept=".pdf,application/pdf" style={{ display:'none' }}
                      onChange={e=>{ const f=e.target.files?.[0]; if(f) handleFaxFile(f) }} />
                    {faxFile ? (
                      <>
                        <p style={{ margin:'0 0 4px',fontSize:24 }}>📄</p>
                        <p style={{ margin:'0 0 4px',fontSize:13,fontWeight:600,color:'#4ade80' }}>{faxFile.name}</p>
                        <p style={{ margin:0,fontSize:11,color:'#64748b' }}>{(faxFile.size/1024).toFixed(1)} KB</p>
                      </>
                    ) : (
                      <>
                        <p style={{ margin:'0 0 4px',fontSize:28 }}>📎</p>
                        <p style={{ margin:'0 0 2px',fontSize:13,color:'#94a3b8' }}>Click or drag a PDF here</p>
                        <p style={{ margin:0,fontSize:11,color:'#475569' }}>PDF only · Max 10MB · Up to 50 pages</p>
                      </>
                    )}
                  </div>
                </div>
                <button onClick={sendFax} disabled={faxSending || !faxBase64 || !faxTo}
                  style={{ padding:'12px',background:faxBase64&&faxTo?'#7C3AED':'#334155',border:'none',borderRadius:10,color:'#fff',fontSize:14,fontWeight:700,cursor:faxBase64&&faxTo?'pointer':'not-allowed',fontFamily:'inherit',opacity:faxSending?0.7:1 }}>
                  {faxSending ? '📠 Sending fax...' : '📠 Send Fax'}
                </button>
              </div>
            </div>

            <div style={card}>
              <h2 style={{ margin:'0 0 1rem',fontSize:16,fontWeight:700 }}>Fax History</h2>
              {faxLogs.length === 0 ? (
                <div style={{ textAlign:'center',padding:'2rem',color:'#475569' }}>
                  <p style={{ fontSize:32 }}>📠</p>
                  <p style={{ margin:0,fontSize:13 }}>No fax history yet</p>
                </div>
              ) : (
                <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                  {faxLogs.slice(0,15).map(f => (
                    <div key={f.id} style={{ padding:'10px 12px',background:'#1e293b',borderRadius:10,borderLeft:`3px solid ${f.direction==='inbound'?'#7C3AED':'#0ea5e9'}` }}>
                      <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4 }}>
                        <span style={{ fontSize:12,fontWeight:600,color:f.direction==='inbound'?'#a78bfa':'#7dd3fc' }}>
                          {f.direction==='inbound'?'↓ Received':'↑ Sent'} · {formatPhone(f.direction==='inbound'?f.from_number:f.to_number)}
                        </span>
                        <span style={{ fontSize:11,color:statusColor(f.status) }}>{f.status}</span>
                      </div>
                      <p style={{ margin:'0 0 2px',fontSize:12,color:'#64748b' }}>
                        {f.pages ? `${f.pages} page${f.pages>1?'s':''}` : '—'} · {new Date(f.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <div style={card}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
              <h2 style={{ margin:0,fontSize:16,fontWeight:700 }}>Communication History</h2>
              <div style={{ display:'flex',gap:8 }}>
                {(['all','calls','sms','fax'] as const).map(f => (
                  <button key={f} onClick={() => setHistFilter(f)}
                    style={{ padding:'6px 14px',background:histFilter===f?'#7C3AED':'#1e293b',border:`1px solid ${histFilter===f?'#7C3AED':'#334155'}`,borderRadius:20,color:histFilter===f?'#fff':'#94a3b8',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',textTransform:'capitalize' }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Combined feed */}
            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              {[
                ...((histFilter==='all'||histFilter==='calls') ? callLogs.map(c => ({ type:'call' as const, data:c, date:c.created_at })) : []),
                ...((histFilter==='all'||histFilter==='sms') ? smsLogs.map(s => ({ type:'sms' as const, data:s, date:s.created_at })) : []),
                ...((histFilter==='all'||histFilter==='fax') ? faxLogs.map(f => ({ type:'fax' as const, data:f, date:f.created_at })) : []),
              ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((entry, i) => (
                <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'#1e293b',borderRadius:10 }}>
                  <span style={{ fontSize:20,flexShrink:0 }}>
                    {entry.type==='call' ? ((entry.data as CallLog).direction==='inbound'?'📲':'📞') :
                     entry.type==='sms' ? '💬' : '📠'}
                  </span>
                  <div style={{ flex:1,minWidth:0 }}>
                    <p style={{ margin:'0 0 2px',fontSize:13,fontWeight:600 }}>
                      {entry.type==='call'
                        ? `${(entry.data as CallLog).direction==='inbound'?'Inbound call from':'Outbound call to'} ${formatPhone((entry.data as CallLog).direction==='inbound'?(entry.data as CallLog).from_number:(entry.data as CallLog).to_number)}`
                        : entry.type==='sms'
                        ? `SMS ${(entry.data as SmsLog).direction==='inbound'?'from':'to'} ${formatPhone((entry.data as SmsLog).direction==='inbound'?(entry.data as SmsLog).from_number:(entry.data as SmsLog).to_number)}`
                        : `Fax ${(entry.data as FaxLog).direction==='inbound'?'from':'to'} ${formatPhone((entry.data as FaxLog).direction==='inbound'?(entry.data as FaxLog).from_number:(entry.data as FaxLog).to_number)}`
                      }
                    </p>
                    {entry.type==='sms' && <p style={{ margin:'0 0 2px',fontSize:12,color:'#64748b',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{(entry.data as SmsLog).message}</p>}
                    {entry.type==='call' && (entry.data as CallLog).duration_seconds && (
                      <p style={{ margin:'0 0 2px',fontSize:12,color:'#64748b' }}>Duration: {formatDuration((entry.data as CallLog).duration_seconds!)}</p>
                    )}
                    <p style={{ margin:0,fontSize:11,color:'#475569' }}>{new Date(entry.date).toLocaleString()}</p>
                  </div>
                  <span style={{ fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:12,background:'#0d1526',color:statusColor((entry.data as any).status) }}>
                    {(entry.data as any).status}
                  </span>
                </div>
              ))}
              {(histFilter==='all' ? callLogs.length+smsLogs.length+faxLogs.length : 0) === 0 &&
               (histFilter==='calls' ? callLogs.length : 0) === 0 &&
               (histFilter==='sms' ? smsLogs.length : 0) === 0 &&
               (histFilter==='fax' ? faxLogs.length : 0) === 0 && (
                <div style={{ textAlign:'center',padding:'3rem',color:'#475569' }}>
                  <p style={{ fontSize:32 }}>📋</p>
                  <p style={{ margin:0 }}>No history yet</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
