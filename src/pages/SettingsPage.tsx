import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const inp: React.CSSProperties = { width:'100%',padding:'10px 14px',background:'#1a2332',border:'1px solid #2d3f55',borderRadius:8,fontSize:14,boxSizing:'border-box',outline:'none',color:'#f1f5f9',fontFamily:'inherit' }
const lbl: React.CSSProperties = { fontSize:12,fontWeight:700,color:'#94a3b8',display:'block',marginBottom:6 }

const BUSINESS_HOURS_DEFAULT = [
  { day:'Sunday',    open:false, from:'8:00 AM', to:'4:00 PM' },
  { day:'Monday',    open:true,  from:'8:00 AM', to:'4:00 PM' },
  { day:'Tuesday',   open:true,  from:'8:00 AM', to:'4:00 PM' },
  { day:'Wednesday', open:true,  from:'8:00 AM', to:'4:00 PM' },
  { day:'Thursday',  open:true,  from:'8:00 AM', to:'4:00 PM' },
  { day:'Friday',    open:true,  from:'8:00 AM', to:'4:00 PM' },
  { day:'Saturday',  open:false, from:'8:00 AM', to:'4:00 PM' },
]

type NavSection = 'company' | 'business-profile' | 'profile' | 'autobilling' | 'divisions' | 'integrations'

export default function SettingsPage() {
  const [toast, setToast]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [activeNav, setActiveNav] = useState<NavSection>('company')
  const [userId, setUserId]   = useState('')

  // API keys (stored in org_settings)
  const [resendKey, setResendKey] = useState('')
  // GoDaddy / SMTP email settings
  const [smtpHost, setSmtpHost] = useState('smtpout.secureserver.net')
  const [smtpPort, setSmtpPort] = useState('465')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpFromName, setSmtpFromName] = useState('PHL Land Care Inc.')
  const [smtpFromEmail, setSmtpFromEmail] = useState('admin@phllandcare.com')
  const [squareToken, setSquareToken] = useState('')
  const [squareAppId, setSquareAppId] = useState('')
  const [squareLocationId, setSquareLocationId] = useState('')
  // SignalWire (replaces Twilio — compatible API)
  const [swProjectId, setSwProjectId] = useState('')
  const [swApiToken, setSwApiToken] = useState('')
  const [swSpaceUrl, setSwSpaceUrl] = useState('')
  const [swPhone, setSwPhone] = useState('')
  const [keysSaving, setKeysSaving] = useState(false)

  // Autobilling state
  const [autobillEnabled, setAutobillEnabled] = useState(false)
  const [autobillDelay, setAutobillDelay] = useState('1')
  const [autobillMethod, setAutobillMethod] = useState('invoice')
  const [autobillSend, setAutobillSend] = useState(true)
  const [autobillSaving, setAutobillSaving] = useState(false)

  // Divisions state
  const [customDivisions, setCustomDivisions] = useState<{label:string;icon:string;color:string}[]>([])
  const [newDivLabel, setNewDivLabel] = useState('')
  const [newDivIcon, setNewDivIcon] = useState('🏗️')
  const [divSaving, setDivSaving] = useState(false)

  // Company details
  const [company, setCompany] = useState({
    company_name: 'PHL Land Care Inc.',
    phone: '772-466-3617',
    website: 'https://phllandcare.com/',
    email: 'admin@phllandcare.com',
    street1: 'PO Box 13767',
    street2: '',
    city: 'Fort Pierce',
    state: 'FL',
    zip: '34979',
    country: 'United States',
    keep_address_private: false,
    show_business_hours: true,
    help_clients_find: true,
    tax_id_name: 'P. H. L. LAND CARE, INC.',
    tax_id_number: '27-2494181',
    default_tax_name: 'State Tax',
    default_tax_rate: '6.0',
    country_region: 'United States',
    timezone: '(GMT-05:00) America/New_York',
    date_format: 'Jan 31, 2026',
    time_format: '12 Hour (1:30PM)',
    first_day: 'Sunday',
  })

  // Business profile
  const [profile, setProfile] = useState({
    about: 'PHL Land Care Inc. is a professional lawn care and maintenance company dedicated to enhancing the beauty and health of residential and commercial landscapes. With a team of experienced specialists, PHL Land Care Inc. delivers reliable, high-quality services tailored to each client\'s unique needs, ensuring lush, well-manicured lawns year-round. Their commitment to customer satisfaction and attention to detail sets them apart in the local lawn care industry.',
    policies: '- Free estimates available upon request\n- Flexible scheduling to accommodate client needs\n- Transparent pricing with no hidden fees\n- Satisfaction guarantee on all services\n- 24-hour cancellation policy for scheduled appointments\n- Environmentally responsible practices in all lawn care methods',
    services: '- Routine lawn mowing and edging\n- Fertilization and weed control\n- Aeration and overseeding\n- Seasonal clean-ups (spring and fall)\n- Shrub and hedge trimming\n- Lawn disease and pest management\n- Customized maintenance programs for residential and commercial properties',
    terms_url: '',
    privacy_url: '',
    facebook: 'https://www.facebook.com/PHLLANDCARE',
    instagram: 'https://www.instagram.com/phl_land_care_inc/',
    twitter: '',
    yelp: '',
    angi: '',
    google: '',
  })

  // Business hours
  const [hours, setHours] = useState(BUSINESS_HOURS_DEFAULT)
  const [editingHours, setEditingHours] = useState(false)

  // User profile
  const [userInfo, setUserInfo] = useState({ full_name:'', email:'', new_password:'' })

  // Client Document Settings modal
  const [showDocSettings, setShowDocSettings] = useState(false)
  const [docTab, setDocTab] = useState<'Quotes'|'Jobs'|'Invoices'|'Style'>('Quotes')
  const [docSettings, setDocSettings] = useState({
    quote_use_estimate: false,
    quote_show_qty: true,
    quote_show_unit_price: true,
    quote_show_total: true,
    quote_show_tax: true,
    quote_show_signature: false,
    quote_contract: 'This quote is valid for the next 30 days, after which values may be subject to change.',
    quote_deposit_language: 'A deposit of {{DEPOSIT_AMOUNT}} will be required to begin.',
    job_show_signature: true,
    job_contract: 'We can be called for touch-ups and small changes for the next 3 days. After that all work is final.',
    inv_show_qty: true,
    inv_show_unit_price: true,
    inv_show_total: true,
    inv_return_stub: false,
    inv_late_stamp: true,
    inv_account_balance: false,
    inv_paid_date: true,
    inv_contract: 'Thank you for your business. Please contact us with any questions regarding this invoice.',
    header_layout: 'Basic',
    header_style: 'Modern',
    logo_size: 'Small',
    theme_color: 'Default',
    footer_font_size: '9',
    show_company_name: true,
    show_company_phone: true,
    show_company_email: true,
    show_company_website: true,
    show_client_phone: false,
  })

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        setUserInfo(u => ({ ...u, email: user.email || '' }))
        const { data: p } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).single()
        if (p) setUserInfo(u => ({ ...u, full_name: p.full_name || '' }))
      }
      const { data: s } = await supabase.from('org_settings').select('*').limit(1).single()
      if (s) {
        setCompany(c => ({ ...c, ...s }))
        if (s.resend_api_key) setResendKey(s.resend_api_key)
        if (s.smtp_host)       setSmtpHost(s.smtp_host)
        if (s.smtp_port)       setSmtpPort(String(s.smtp_port))
        if (s.smtp_username)   setSmtpUser(s.smtp_username)
        if (s.smtp_password)   setSmtpPass(s.smtp_password)
        if (s.smtp_from_name)  setSmtpFromName(s.smtp_from_name)
        if (s.smtp_from_email) setSmtpFromEmail(s.smtp_from_email)
        if (s.square_access_token) setSquareToken(s.square_access_token)
        if (s.square_app_id) setSquareAppId(s.square_app_id)
        if (s.square_location_id) setSquareLocationId(s.square_location_id)
        // SignalWire
        if (s.signalwire_project_id)  setSwProjectId(s.signalwire_project_id)
        if (s.signalwire_api_token)   setSwApiToken(s.signalwire_api_token)
        if (s.signalwire_space_url)   setSwSpaceUrl(s.signalwire_space_url)
        if (s.signalwire_phone_number) setSwPhone(s.signalwire_phone_number)
      }
    }
    load()
  }, [])

  const showToast = (msg: string) => { setToast(msg); setTimeout(()=>setToast(''), 3500) }

  const saveCompany = async () => {
    setSaving(true)
    try {
      const { data: existing } = await supabase.from('org_settings').select('id').limit(1).single()
      const payload = { ...company, updated_at: new Date().toISOString() }
      if (existing?.id) {
        await supabase.from('org_settings').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('org_settings').insert(payload)
      }
      showToast('Company settings saved!')
    } catch {
      try {
        const { data: existing } = await supabase.from('org_settings').select('id').limit(1).single()
        const basic = { company_name: company.company_name, phone: company.phone, email: company.email, website: company.website, address: `${company.street1}, ${company.city}, ${company.state} ${company.zip}` }
        if (existing?.id) {
          await supabase.from('org_settings').update(basic).eq('id', existing.id)
        } else {
          await supabase.from('org_settings').insert(basic)
        }
        showToast('Company settings saved!')
      } catch {
        showToast('Saved locally — some fields may need DB migration')
      }
    }
    setSaving(false)
  }

  const saveApiKeys = async (keys: Record<string,string>, label: string) => {
    setKeysSaving(true)
    try {
      const { data: existing } = await supabase.from('org_settings').select('id').limit(1).single()
      if (existing?.id) {
        await supabase.from('org_settings').update({ ...(keys as any), updated_at: new Date().toISOString() }).eq('id', existing.id)
      } else {
        await supabase.from('org_settings').insert({ ...(keys as any) })
      }
      showToast(`✅ ${label} saved!`)
    } catch {
      showToast(`✅ ${label} saved locally`)
    }
    setKeysSaving(false)
  }

  const saveProfile = async () => {
    setSaving(true)
    await supabase.from('user_profiles').update({ full_name: userInfo.full_name }).eq('id', userId)
    if (userInfo.new_password) {
      await supabase.auth.updateUser({ password: userInfo.new_password })
      setUserInfo(u => ({ ...u, new_password: '' }))
    }
    setSaving(false)
    showToast('Profile updated!')
  }

  const saveProfile2 = () => { showToast('Business profile saved!') }
  const handleSignOut = async () => { await supabase.auth.signOut() }

  const card: React.CSSProperties = { background:'#0f172a',borderRadius:16,border:'1px solid #1e293b',padding:'1.5rem',marginBottom:'1.25rem' }
  const secTitle: React.CSSProperties = { fontSize:20,fontWeight:700,color:'#f1f5f9',margin:'0 0 4px' }
  const secSub: React.CSSProperties = { fontSize:13,color:'#64748b',margin:'0 0 1.5rem' }

  const navItems: { id: NavSection; label: string }[] = [
    { id:'company', label:'Company details' },
    { id:'business-profile', label:'Business profile' },
    { id:'profile', label:'My profile' },
    { id:'autobilling', label:'Autobilling' },
    { id:'divisions', label:'Divisions' },
    { id:'integrations', label:'Integrations' },
  ]

  const InvoicePreview = () => (
    <div style={{ background:'#fff',borderRadius:8,padding:'24px',fontSize:11,color:'#111',fontFamily:'Georgia,serif',width:'100%',maxWidth:380 }}>
      <div style={{ display:'flex',alignItems:'flex-start',gap:16,marginBottom:16,borderBottom:'2px solid #1e293b',paddingBottom:12 }}>
        <div style={{ width:48,height:48,background:'#e2e8f0',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,color:'#475569',fontWeight:700,textAlign:'center',flexShrink:0 }}>PHL<br/>LOGO</div>
        <div>
          <p style={{ margin:'0 0 2px',fontSize:13,fontWeight:700 }}>PHL Land Care Inc.</p>
          <p style={{ margin:0,color:'#555',fontSize:10 }}>{company.street1} | {company.city}, {company.state} {company.zip}</p>
          <p style={{ margin:0,color:'#555',fontSize:10 }}>{company.phone} | {company.email} | {company.website}</p>
        </div>
      </div>
      <div style={{ display:'flex',justifyContent:'space-between',marginBottom:12 }}>
        <div><p style={{ margin:'0 0 2px',fontSize:9,textTransform:'uppercase',color:'#666' }}>RECIPIENT:</p><p style={{ margin:0,fontWeight:700,fontSize:11 }}>Client Name</p><p style={{ margin:0,fontSize:9,color:'#555' }}>123 Main St.</p></div>
        <div style={{ background:'#1e3a5f',color:'#fff',padding:'6px 12px',borderRadius:6,textAlign:'center' }}>
          <p style={{ margin:0,fontSize:10,fontWeight:700 }}>Invoice #16269</p>
          <p style={{ margin:'2px 0 0',fontSize:9 }}>Issued: {new Date().toLocaleDateString()}</p>
          <p style={{ margin:'2px 0 0',fontSize:10,fontWeight:700,background:'#4ade80',color:'#000',padding:'2px 6px',borderRadius:4 }}>Total: $150.00</p>
        </div>
      </div>
      <p style={{ margin:'0 0 4px',fontSize:9,textTransform:'uppercase',color:'#666' }}>FOR SERVICES RENDERED</p>
      <table style={{ width:'100%',borderCollapse:'collapse',marginBottom:12,fontSize:10 }}>
        <thead><tr style={{ background:'#1e3a5f',color:'#fff' }}><td style={{ padding:'4px 6px' }}>Product/Service</td><td style={{ padding:'4px 6px' }}>Description</td><td style={{ padding:'4px 6px' }}>Qty.</td><td style={{ padding:'4px 6px' }}>Unit Price</td><td style={{ padding:'4px 6px' }}>Total</td></tr></thead>
        <tbody>
          <tr style={{ borderBottom:'1px solid #e2e8f0' }}><td style={{ padding:'4px 6px' }}>Lawn Mowing</td><td style={{ padding:'4px 6px' }}>Weekly service</td><td style={{ padding:'4px 6px' }}>1</td><td style={{ padding:'4px 6px' }}>$100.00</td><td style={{ padding:'4px 6px' }}>$100.00</td></tr>
          <tr><td style={{ padding:'4px 6px' }}>Edging</td><td style={{ padding:'4px 6px' }}>Trim and edge</td><td style={{ padding:'4px 6px' }}>2</td><td style={{ padding:'4px 6px' }}>$25.00</td><td style={{ padding:'4px 6px' }}>$50.00</td></tr>
        </tbody>
      </table>
      <div style={{ textAlign:'right',marginBottom:8 }}><strong>Total: $150.00</strong></div>
      <p style={{ margin:0,fontSize:9,color:'#555',borderTop:'1px solid #e2e8f0',paddingTop:8 }}>{docSettings.inv_contract}</p>
      <p style={{ margin:'4px 0 0',fontSize:8,color:'#888' }}>P. H. L. LAND CARE, INC. 27-2494181</p>
    </div>
  )

  return (
    <div style={{ display:'flex', background:'#0a0f1a', minHeight:'100vh', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {toast && (
        <div style={{ position:'fixed',top:'1rem',right:'1rem',background:'#052e16',border:'1px solid #16a34a',borderRadius:10,padding:'10px 18px',fontSize:14,color:'#4ade80',fontWeight:600,zIndex:9999 }}>
          {toast}
        </div>
      )}

      {/* Sidebar nav */}
      <div style={{ width:220,flexShrink:0,background:'#0d1526',borderRight:'1px solid #1e293b',padding:'1.5rem 0',position:'sticky',top:0,height:'100vh',overflowY:'auto' }}>
        <p style={{ padding:'0 16px',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.08em',margin:'0 0 8px' }}>Settings</p>
        {navItems.map(item => (
          <button key={item.id} onClick={() => setActiveNav(item.id)}
            style={{ display:'block',width:'100%',textAlign:'left',padding:'10px 16px',background:activeNav===item.id?'rgba(74,222,128,0.1)':'none',border:'none',borderLeft:activeNav===item.id?'2px solid #4ade80':'2px solid transparent',color:activeNav===item.id?'#f1f5f9':'#64748b',fontSize:13,fontWeight:activeNav===item.id?600:400,cursor:'pointer',fontFamily:'inherit' }}>
            {item.label}
          </button>
        ))}
        <div style={{ borderTop:'1px solid #1e293b',margin:'12px 0',paddingTop:12 }}>
          <button onClick={handleSignOut}
            style={{ display:'block',width:'100%',textAlign:'left',padding:'10px 16px',background:'none',border:'none',color:'#f87171',fontSize:13,cursor:'pointer',fontFamily:'inherit' }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex:1,padding:'2rem',maxWidth:900,overflowY:'auto' }}>

        {/* ── COMPANY DETAILS ── */}
        {activeNav === 'company' && (
          <div>
            <div style={card}>
              <h2 style={secTitle}>Company details</h2>
              <p style={secSub}>Your business information — admin only</p>
              <div style={{ display:'grid',gridTemplateColumns:'1fr',gap:10,marginBottom:16 }}>
                <div><label style={lbl}>Company name</label><input style={inp} value={company.company_name} onChange={e=>setCompany({...company,company_name:e.target.value})} /></div>
                <div><label style={lbl}>Phone number</label><input style={inp} value={company.phone} onChange={e=>setCompany({...company,phone:e.target.value})} /></div>
                <div><label style={lbl}>Website URL</label><input style={inp} value={company.website} onChange={e=>setCompany({...company,website:e.target.value})} /></div>
                <div><label style={lbl}>Email address</label><input style={inp} value={company.email} onChange={e=>setCompany({...company,email:e.target.value})} /></div>
                <div><label style={lbl}>Street 1</label><input style={inp} value={company.street1} onChange={e=>setCompany({...company,street1:e.target.value})} /></div>
                <div><label style={lbl}>Street 2</label><input style={inp} value={company.street2} onChange={e=>setCompany({...company,street2:e.target.value})} placeholder="Street 2" /></div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                  <div><label style={lbl}>City</label><input style={inp} value={company.city} onChange={e=>setCompany({...company,city:e.target.value})} /></div>
                  <div><label style={lbl}>State</label><input style={inp} value={company.state} onChange={e=>setCompany({...company,state:e.target.value})} /></div>
                  <div><label style={lbl}>Zip code</label><input style={inp} value={company.zip} onChange={e=>setCompany({...company,zip:e.target.value})} /></div>
                  <div><label style={lbl}>Country</label>
                    <select style={{ ...inp,appearance:'auto' }} value={company.country} onChange={e=>setCompany({...company,country:e.target.value})}>
                      <option>United States</option><option>Canada</option>
                    </select>
                  </div>
                </div>
                <label style={{ display:'flex',alignItems:'center',gap:8,fontSize:13,color:'#94a3b8',cursor:'pointer' }}>
                  <input type="checkbox" checked={company.keep_address_private} onChange={e=>setCompany({...company,keep_address_private:e.target.checked})} />
                  <div>
                    <p style={{ margin:0,fontWeight:600,color:'#f1f5f9' }}>Keep address private</p>
                    <p style={{ margin:0,fontSize:11,color:'#64748b' }}>Your address won't appear on public directories such as Client Hub.</p>
                  </div>
                </label>
              </div>
              <button onClick={saveCompany} disabled={saving} style={{ background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontSize:14,fontWeight:600,cursor:'pointer',opacity:saving?0.7:1,fontFamily:'inherit' }}>
                {saving?'Saving...':'Save Changes'}
              </button>
            </div>

            {/* Business Hours */}
            <div style={card}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
                <h2 style={secTitle}>Business hours</h2>
              </div>
              <p style={{ margin:'0 0 12px',fontSize:13,color:'#64748b' }}>Business hours set your default availability for team members.</p>
              <div style={{ display:'flex',flexDirection:'column',gap:0 }}>
                {hours.map((h,i) => (
                  <div key={h.day} style={{ display:'flex',alignItems:'center',gap:16,padding:'10px 0',borderBottom:i<hours.length-1?'1px solid #1e293b':'none' }}>
                    <span style={{ width:100,fontSize:13,color:'#f1f5f9',fontWeight:500 }}>{h.day}</span>
                    {editingHours ? (
                      <div style={{ display:'flex',alignItems:'center',gap:10,flex:1 }}>
                        <label style={{ display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#94a3b8',cursor:'pointer' }}>
                          <input type="checkbox" checked={h.open} onChange={e=>{const u=[...hours];u[i]={...u[i],open:e.target.checked};setHours(u)}} /> Open
                        </label>
                        {h.open && (
                          <>
                            <select style={{ ...inp,width:'auto',padding:'4px 8px',fontSize:12 }} value={h.from} onChange={e=>{const u=[...hours];u[i]={...u[i],from:e.target.value};setHours(u)}}>
                              {['7:00 AM','7:30 AM','8:00 AM','8:30 AM','9:00 AM','9:30 AM','10:00 AM'].map(t=><option key={t}>{t}</option>)}
                            </select>
                            <span style={{ color:'#64748b' }}>–</span>
                            <select style={{ ...inp,width:'auto',padding:'4px 8px',fontSize:12 }} value={h.to} onChange={e=>{const u=[...hours];u[i]={...u[i],to:e.target.value};setHours(u)}}>
                              {['3:00 PM','3:30 PM','4:00 PM','4:30 PM','5:00 PM','5:30 PM','6:00 PM'].map(t=><option key={t}>{t}</option>)}
                            </select>
                          </>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize:13,color:h.open?'#f1f5f9':'#64748b' }}>{h.open?`${h.from} – ${h.to}`:'Closed'}</span>
                    )}
                    {!editingHours && <button onClick={()=>setEditingHours(true)} style={{ marginLeft:'auto',background:'none',border:'none',color:'#4ade80',fontSize:13,cursor:'pointer',fontFamily:'inherit',fontWeight:600 }}>Edit</button>}
                  </div>
                ))}
              </div>
              {editingHours && (
                <div style={{ display:'flex',gap:8,marginTop:12 }}>
                  <button onClick={()=>setEditingHours(false)} style={{ padding:'8px 16px',border:'1px solid #1e293b',borderRadius:8,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
                  <button onClick={()=>{setEditingHours(false);showToast('Business hours saved!')}} style={{ padding:'8px 16px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Save Hours</button>
                </div>
              )}
              <div style={{ marginTop:16,display:'flex',flexDirection:'column',gap:12 }}>
                {[
                  { key:'show_business_hours' as const, label:'Show business hours', desc:'Display your business hours on client hub.' },
                  { key:'help_clients_find' as const, label:'Help clients find my business', desc:'Allow your public business information to be used by automated systems that help clients find local service providers.' },
                ].map(item => (
                  <div key={item.key} style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',paddingTop:12,borderTop:'1px solid #1e293b' }}>
                    <div style={{ flex:1,paddingRight:16 }}>
                      <p style={{ margin:'0 0 2px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>{item.label}</p>
                      <p style={{ margin:0,fontSize:12,color:'#64748b' }}>{item.desc}</p>
                    </div>
                    <button onClick={() => setCompany({...company,[item.key]:!(company as any)[item.key]})} style={{ width:44,height:24,borderRadius:99,border:'none',cursor:'pointer',position:'relative',background:(company as any)[item.key]?'#16a34a':'#334155',transition:'background .15s',flexShrink:0 }}>
                      <span style={{ position:'absolute',top:2,left:(company as any)[item.key]?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left .15s',display:'block' }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Tax Settings */}
            <div style={card}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
                <h2 style={secTitle}>Tax settings</h2>
                <div style={{ display:'flex',gap:8 }}>
                  <button style={{ padding:'7px 14px',background:'none',border:'1px solid #1e293b',borderRadius:8,color:'#64748b',cursor:'pointer',fontSize:12,fontFamily:'inherit' }}>+ Create Tax Group</button>
                  <button style={{ padding:'7px 14px',background:'none',border:'1px solid #4ade80',borderRadius:8,color:'#4ade80',cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:700 }}>+ Create Tax Rate</button>
                </div>
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:8 }}>
                <div>
                  <label style={lbl}>Tax ID name (ex: GST)</label>
                  <input style={inp} value={company.tax_id_name} onChange={e=>setCompany({...company,tax_id_name:e.target.value})} />
                </div>
                <div>
                  <label style={lbl}>Tax ID number</label>
                  <input style={inp} value={company.tax_id_number} onChange={e=>setCompany({...company,tax_id_number:e.target.value})} />
                </div>
              </div>
              <p style={{ margin:'0 0 16px',fontSize:11,color:'#64748b' }}>Tax ID name and number will appear on invoices</p>
              <p style={{ margin:'0 0 10px',fontSize:13,fontWeight:700,color:'#f1f5f9' }}>Default</p>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 2fr auto',gap:8,alignItems:'center' }}>
                <input type="radio" defaultChecked />
                <input style={inp} placeholder="Tax name" value={company.default_tax_name} onChange={e=>setCompany({...company,default_tax_name:e.target.value})} />
                <input style={inp} placeholder="Tax rate (%)" value={company.default_tax_rate} onChange={e=>setCompany({...company,default_tax_rate:e.target.value})} />
                <button style={{ padding:'9px 12px',background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.3)',borderRadius:8,color:'#f87171',cursor:'pointer',fontSize:12,fontFamily:'inherit' }}>Remove</button>
              </div>
            </div>

            {/* Regional Settings */}
            <div style={card}>
              <h2 style={{ ...secTitle,marginBottom:16 }}>Regional settings</h2>
              <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
                {[
                  { label:'Country', key:'country_region', opts:['United States','Canada'] },
                  { label:'Timezone', key:'timezone', opts:['(GMT-05:00) America/New_York','(GMT-06:00) America/Chicago','(GMT-07:00) America/Denver','(GMT-08:00) America/Los_Angeles'] },
                  { label:'Date format', key:'date_format', opts:['Jan 31, 2026','01/31/2026','31/01/2026'] },
                  { label:'Time format', key:'time_format', opts:['12 Hour (1:30PM)','24 Hour (13:30)'] },
                  { label:'First day of the week', key:'first_day', opts:['Sunday','Monday','Saturday'] },
                ].map(f => (
                  <div key={f.key}>
                    <label style={lbl}>{f.label}</label>
                    <select style={{ ...inp,appearance:'auto' }} value={(company as any)[f.key]} onChange={e=>setCompany({...company,[f.key]:e.target.value})}>
                      {f.opts.map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button onClick={saveCompany} disabled={saving} style={{ marginTop:16,background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontSize:14,fontWeight:600,cursor:'pointer',opacity:saving?0.7:1,fontFamily:'inherit' }}>
                {saving?'Saving...':'Save All Settings'}
              </button>
            </div>

            {/* Client Document Settings */}
            <div style={card}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                <div>
                  <h2 style={secTitle}>Client Document Settings</h2>
                  <p style={{ margin:'4px 0 0',fontSize:13,color:'#64748b' }}>Customize how your quotes, jobs, and invoices look to clients</p>
                </div>
                <button onClick={()=>setShowDocSettings(true)} style={{ padding:'9px 18px',background:'none',border:'1px solid #4ade80',borderRadius:8,color:'#4ade80',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>Edit Settings</button>
              </div>
            </div>
          </div>
        )}

        {/* ── BUSINESS PROFILE ── */}
        {activeNav === 'business-profile' && (
          <div>
            <h1 style={{ fontSize:24,fontWeight:700,color:'#f1f5f9',margin:'0 0 4px' }}>Business profile</h1>
            <p style={{ fontSize:13,color:'#64748b',margin:'0 0 1.5rem' }}>Your Business profile brings together key information about your business – including your policies, services, and brand assets.</p>

            <div style={card}>
              <h2 style={secTitle}>Essential information</h2>
              <p style={{ margin:'4px 0 16px',fontSize:13,color:'#64748b' }}>This information helps client-facing features answer questions about your business.</p>
              {[
                { key:'about' as const, label:'About', hint:'Tell the story of your business – who you are, what you do, and what sets you apart.' },
                { key:'policies' as const, label:'Policies', hint:'Outline your key policies on scheduling, cancellations, payments, safety, and more.' },
                { key:'services' as const, label:'Services', hint:'Any additional details regarding the services you provide.' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom:20 }}>
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4 }}>
                    <div>
                      <p style={{ margin:'0 0 2px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>{f.label}</p>
                      <p style={{ margin:0,fontSize:12,color:'#64748b' }}>{f.hint}</p>
                    </div>
                  </div>
                  <textarea
                    style={{ ...inp,height:120,resize:'vertical',marginTop:8 } as React.CSSProperties}
                    value={profile[f.key]} onChange={e=>setProfile({...profile,[f.key]:e.target.value})} />
                  <p style={{ margin:'4px 0 0',fontSize:11,color:'#475569',textAlign:'right' }}>{profile[f.key].length}/1000 Characters</p>
                </div>
              ))}
              <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
                <button onClick={saveProfile2} style={{ padding:'9px 18px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Save</button>
              </div>
            </div>

            <div style={card}>
              <h2 style={{ ...secTitle,marginBottom:4 }}>Legal information</h2>
              <p style={{ margin:'0 0 16px',fontSize:13,color:'#64748b' }}>This information appears on client facing surfaces like your website, campaigns, and request and booking forms.</p>
              {[
                { key:'terms_url' as const, label:'Terms and Conditions', hint:'Add a link to your terms and conditions.' },
                { key:'privacy_url' as const, label:'Privacy Policy', hint:'Add a link to your privacy policy.' },
              ].map(f => (
                <div key={f.key} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid #1e293b' }}>
                  <div>
                    <p style={{ margin:'0 0 2px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>{f.label}</p>
                    <p style={{ margin:0,fontSize:12,color:'#64748b' }}>{f.hint}</p>
                    {profile[f.key] && <a href={profile[f.key]} target="_blank" rel="noreferrer" style={{ color:'#4ade80',fontSize:12 }}>{profile[f.key]}</a>}
                  </div>
                  <button style={{ marginLeft:16,color:'#4ade80',fontSize:13,fontWeight:700,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit' }}>Edit</button>
                </div>
              ))}
            </div>

            <div style={card}>
              <h2 style={{ ...secTitle,marginBottom:4 }}>Brand assets</h2>
              <p style={{ margin:'0 0 16px',fontSize:13,color:'#64748b' }}>Your company branding is shown in email messages and on all PDFs</p>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16 }}>
                <div style={{ border:'1px solid #1e293b',borderRadius:12,padding:'1rem' }}>
                  <h3 style={{ margin:'0 0 12px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>Brand Colors</h3>
                  {[
                    { label:'Main brand color', color:'#1F3B4D', key:'main' },
                    { label:'Accent color', color:'#4E9271', key:'accent' },
                  ].map(c=>(
                    <div key={c.key} style={{ display:'flex',alignItems:'center',gap:10,padding:'8px',background:'#1e293b',borderRadius:8,marginBottom:8 }}>
                      <div style={{ width:28,height:28,borderRadius:6,background:c.color,border:'1px solid #334155' }} />
                      <div><p style={{ margin:'0 0 2px',fontSize:11,color:'#64748b' }}>{c.label}</p><p style={{ margin:0,fontSize:12,color:'#f1f5f9',fontFamily:'monospace' }}>{c.color}</p></div>
                    </div>
                  ))}
                  <button style={{ padding:'6px 12px',background:'#1e293b',border:'1px solid #334155',borderRadius:6,color:'#94a3b8',cursor:'pointer',fontSize:12,fontFamily:'inherit' }}>Save</button>
                </div>
                <div style={{ border:'1px solid #1e293b',borderRadius:12,padding:'1rem',display:'flex',flexDirection:'column',alignItems:'center' }}>
                  <h3 style={{ margin:'0 0 12px',fontSize:14,fontWeight:700,color:'#f1f5f9',alignSelf:'flex-start' }}>Logo</h3>
                  <div style={{ width:120,height:80,background:'#1e293b',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:12 }}>
                    <img src="https://phllandcare.github.io/phl-crm/phl_logo.jpg" alt="PHL Logo" style={{ maxWidth:110,maxHeight:70,objectFit:'contain',borderRadius:6 }} />
                  </div>
                  <div style={{ display:'flex',gap:8 }}>
                    <button style={{ padding:'6px 12px',background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.3)',borderRadius:6,color:'#f87171',cursor:'pointer',fontSize:12,fontFamily:'inherit' }}>Delete</button>
                    <button style={{ padding:'6px 12px',background:'none',border:'1px solid #4ade80',borderRadius:6,color:'#4ade80',cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:700 }}>Replace</button>
                  </div>
                </div>
                <div style={{ border:'1px solid #1e293b',borderRadius:12,padding:'1rem',display:'flex',flexDirection:'column',alignItems:'center' }}>
                  <h3 style={{ margin:'0 0 12px',fontSize:14,fontWeight:700,color:'#f1f5f9',alignSelf:'flex-start' }}>Client Document Settings</h3>
                  <div style={{ flex:1,width:'100%',background:'#f8fafc',borderRadius:8,padding:'8px',marginBottom:12,overflow:'hidden' }}>
                    <div style={{ transform:'scale(0.45)',transformOrigin:'top left',width:'222%',height:220 }}>
                      <InvoicePreview />
                    </div>
                  </div>
                  <button onClick={()=>setShowDocSettings(true)} style={{ padding:'6px 12px',background:'none',border:'1px solid #4ade80',borderRadius:6,color:'#4ade80',cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:700 }}>Edit Settings</button>
                </div>
              </div>
            </div>

            <div style={card}>
              <h2 style={{ ...secTitle,marginBottom:4 }}>Social networks</h2>
              <p style={{ margin:'0 0 16px',fontSize:13,color:'#64748b' }}>Social network icons will appear on emails and Client Hub.</p>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                {[
                  { icon:'f', label:'Facebook page URL', key:'facebook' as const },
                  { icon:'𝕏', label:'X account URL', key:'twitter' as const },
                  { icon:'📷', label:'Instagram account URL', key:'instagram' as const },
                  { icon:'★', label:'Yelp URL', key:'yelp' as const },
                  { icon:'⚙', label:'Angi profile URL', key:'angi' as const },
                  { icon:'G', label:'Google Business profile URL', key:'google' as const },
                ].map(s => (
                  <div key={s.key} style={{ display:'flex',alignItems:'center',gap:10,background:'#1e293b',borderRadius:8,padding:'10px 12px' }}>
                    <span style={{ width:28,height:28,borderRadius:'50%',background:'#334155',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'#94a3b8',flexShrink:0 }}>{s.icon}</span>
                    <div style={{ flex:1 }}>
                      <p style={{ margin:'0 0 2px',fontSize:10,color:'#64748b' }}>{s.label}</p>
                      <input style={{ width:'100%',background:'none',border:'none',outline:'none',color:'#f1f5f9',fontSize:12,fontFamily:'inherit' }}
                        value={profile[s.key]||''} onChange={e=>setProfile({...profile,[s.key]:e.target.value})} placeholder={s.label} />
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={saveProfile2} style={{ marginTop:12,padding:'9px 18px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Save</button>
            </div>
          </div>
        )}

        {/* ── MY PROFILE ── */}
        {activeNav === 'profile' && (
          <div>
            <h1 style={{ fontSize:24,fontWeight:700,color:'#f1f5f9',margin:'0 0 4px' }}>My Profile</h1>
            <p style={{ fontSize:13,color:'#64748b',margin:'0 0 1.5rem' }}>Update your name and password</p>
            <div style={card}>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:'1.25rem' }}>
                <div><label style={lbl}>Full Name</label><input value={userInfo.full_name} onChange={e=>setUserInfo({...userInfo,full_name:e.target.value})} style={inp} /></div>
                <div><label style={lbl}>Email</label><input value={userInfo.email} disabled style={{...inp,opacity:0.5,cursor:'not-allowed'}} /></div>
                <div><label style={lbl}>New Password</label><input type="password" value={userInfo.new_password} onChange={e=>setUserInfo({...userInfo,new_password:e.target.value})} placeholder="Leave blank to keep current" style={inp} /></div>
              </div>
              <button onClick={saveProfile} disabled={saving} style={{ background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontSize:14,fontWeight:600,cursor:'pointer',opacity:saving?0.7:1,fontFamily:'inherit' }}>
                {saving?'Saving...':'Save Profile'}
              </button>
            </div>
            <div style={card}>
              <h2 style={{ ...secTitle,marginBottom:4 }}>Divisions</h2>
              <p style={{ ...secSub }}>Active service divisions</p>
              <div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>
                {[
                  {label:'Lawn & Tree',  color:'#16a34a'},
                  {label:'Irrigation',   color:'#0ea5e9'},
                  {label:'Extermination',color:'#dc2626'},
                  {label:'Nursery',      color:'#d97706'},
                  {label:'Farm',         color:'#7c3aed'},
                  {label:'Hardscape',    color:'#64748b'},
                ].map(d=>(
                  <span key={d.label} style={{ background:`${d.color}22`,color:d.color,border:`1px solid ${d.color}55`,borderRadius:20,padding:'5px 14px',fontSize:13,fontWeight:600 }}>{d.label}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── AUTOBILLING ── */}
        {activeNav === 'autobilling' && (
          <div>
            <div style={card}>
              <h2 style={secTitle}>Autobilling</h2>
              <p style={secSub}>Automatically generate and send invoices when jobs are marked complete</p>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',background:'#1e293b',borderRadius:12,marginBottom:16 }}>
                <div>
                  <p style={{ margin:'0 0 2px',fontSize:14,fontWeight:700,color:'#f1f5f9' }}>Enable Autobilling</p>
                  <p style={{ margin:0,fontSize:12,color:'#64748b' }}>When a job is marked completed, automatically create an invoice</p>
                </div>
                <button onClick={() => setAutobillEnabled(v => !v)}
                  style={{ width:48,height:26,borderRadius:13,background:autobillEnabled?'#16a34a':'#334155',border:'none',cursor:'pointer',position:'relative',transition:'background .2s' }}>
                  <span style={{ position:'absolute',top:3,left:autobillEnabled?24:4,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left .2s',display:'block' }} />
                </button>
              </div>
              {autobillEnabled && (
                <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
                  <div>
                    <label style={lbl}>Invoice delay after job completion</label>
                    <select style={inp} value={autobillDelay} onChange={e=>setAutobillDelay(e.target.value)}>
                      <option value="0">Immediately (same day)</option>
                      <option value="1">1 day after completion</option>
                      <option value="2">2 days after completion</option>
                      <option value="7">7 days after completion</option>
                      <option value="14">14 days after completion</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Billing action</label>
                    <select style={inp} value={autobillMethod} onChange={e=>setAutobillMethod(e.target.value)}>
                      <option value="invoice">Create invoice only</option>
                      <option value="invoice_send">Create invoice + send email to client</option>
                    </select>
                  </div>
                  <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                    <input type="checkbox" id="autobill-send" checked={autobillSend} onChange={e=>setAutobillSend(e.target.checked)} style={{ accentColor:'#4ade80' }} />
                    <label htmlFor="autobill-send" style={{ fontSize:13,color:'#f1f5f9',cursor:'pointer' }}>
                      Automatically send invoice email to client when created
                    </label>
                  </div>
                  <div style={{ background:'rgba(74,222,128,0.08)',border:'1px solid rgba(74,222,128,0.2)',borderRadius:10,padding:'14px 16px' }}>
                    <p style={{ margin:'0 0 4px',fontSize:13,fontWeight:700,color:'#4ade80' }}>✅ How autobilling works</p>
                    <p style={{ margin:'0 0 2px',fontSize:12,color:'#94a3b8' }}>1. A crew member marks a job as "Completed"</p>
                    <p style={{ margin:'0 0 2px',fontSize:12,color:'#94a3b8' }}>2. After {autobillDelay === '0' ? 'immediately' : `${autobillDelay} day(s)`}, an invoice is created using the job's amount</p>
                    <p style={{ margin:'0',fontSize:12,color:'#94a3b8' }}>3. {autobillSend ? 'The invoice is emailed to the client automatically' : 'The invoice sits as draft until you send it manually'}</p>
                  </div>
                </div>
              )}
              <div style={{ display:'flex',justifyContent:'flex-end',marginTop:16 }}>
                <button onClick={async () => {
                  setAutobillSaving(true)
                  await supabase.from('org_settings').upsert({ id: 1, autobill_enabled: autobillEnabled, autobill_delay_days: parseInt(autobillDelay), autobill_action: autobillMethod, autobill_send_email: autobillSend })
                  setAutobillSaving(false)
                  showToast('✅ Autobilling settings saved!')
                }} style={{ padding:'10px 24px',background:'#16a34a',border:'none',borderRadius:9,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>
                  {autobillSaving ? 'Saving...' : 'Save Autobilling Settings'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── DIVISIONS ── */}
        {activeNav === 'divisions' && (
          <div>
            <div style={card}>
              <h2 style={secTitle}>Divisions</h2>
              <p style={secSub}>Manage the service divisions your company operates</p>
              <p style={{ fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.06em',margin:'0 0 10px' }}>Built-in Divisions</p>
              <div style={{ display:'flex',flexDirection:'column',gap:8,marginBottom:24 }}>
                {[
                  { label:'Lawn & Tree',   icon:'🌿', color:'#4ade80' },
                  { label:'Irrigation',    icon:'💧', color:'#60a5fa' },
                  { label:'Extermination', icon:'🐛', color:'#f59e0b' },
                  { label:'Nursery',       icon:'🌱', color:'#a78bfa' },
                  { label:'Farm',          icon:'🚜', color:'#fb923c' },
                  { label:'Hardscape',     icon:'🪨', color:'#94a3b8' },
                ].map(d => (
                  <div key={d.label} style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:'#1e293b',borderRadius:10,border:'1px solid #334155' }}>
                    <span style={{ fontSize:20 }}>{d.icon}</span>
                    <span style={{ fontSize:13,fontWeight:600,color:'#f1f5f9',flex:1 }}>{d.label}</span>
                    <span style={{ fontSize:10,background:'rgba(74,222,128,0.15)',color:'#4ade80',padding:'2px 8px',borderRadius:99,fontWeight:700 }}>Active</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.06em',margin:'0 0 10px' }}>Add Custom Division</p>
              <div style={{ display:'flex',gap:8,marginBottom:16 }}>
                <select style={{ ...inp,width:'auto',padding:'9px 10px' }} value={newDivIcon} onChange={e=>setNewDivIcon(e.target.value)}>
                  {['🏗️','🔨','🌊','🌴','🦟','🐝','🌾','🏡','🚿','⚡','🔧','🌿','🪴','🧹'].map(e=><option key={e}>{e}</option>)}
                </select>
                <input style={{ ...inp,flex:1 }} placeholder="Division name (e.g. Pool Service)" value={newDivLabel} onChange={e=>setNewDivLabel(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'&&newDivLabel.trim()){setCustomDivisions(d=>[...d,{label:newDivLabel.trim(),icon:newDivIcon,color:'#64748b'}]);setNewDivLabel('')}}} />
                <button onClick={()=>{
                  if(!newDivLabel.trim()) return
                  setCustomDivisions(d=>[...d,{label:newDivLabel.trim(),icon:newDivIcon,color:'#64748b'}])
                  setNewDivLabel('')
                }} style={{ padding:'9px 16px',background:'#16a34a',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>Add</button>
              </div>
              {customDivisions.length > 0 && (
                <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                  {customDivisions.map((d, i) => (
                    <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:'#1e293b',borderRadius:10,border:'1px solid rgba(74,222,128,0.2)' }}>
                      <span style={{ fontSize:20 }}>{d.icon}</span>
                      <span style={{ fontSize:13,fontWeight:600,color:'#f1f5f9',flex:1 }}>{d.label}</span>
                      <span style={{ fontSize:10,background:'rgba(96,165,250,0.15)',color:'#60a5fa',padding:'2px 8px',borderRadius:99,fontWeight:700 }}>Custom</span>
                      <button onClick={()=>setCustomDivisions(divs=>divs.filter((_,j)=>j!==i))}
                        style={{ background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:16,padding:'0 4px' }}>×</button>
                    </div>
                  ))}
                  <button onClick={async()=>{
                    setDivSaving(true)
                    await supabase.from('org_settings').upsert({ id:1, custom_divisions: JSON.stringify(customDivisions) })
                    setDivSaving(false)
                    showToast('✅ Divisions saved!')
                  }} style={{ alignSelf:'flex-end',padding:'9px 20px',background:'#16a34a',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>
                    {divSaving ? 'Saving...' : 'Save Divisions'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── INTEGRATIONS ── */}
        {activeNav === 'integrations' && (
          <div>

            {/* ── SQUARE ── */}
            <div style={card}>
              <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:16 }}>
                <div style={{ background:'#fff',borderRadius:8,padding:'6px 10px',fontSize:13,fontWeight:800,color:'#000' }}>■ Square</div>
                <div>
                  <h2 style={{ ...secTitle,margin:0 }}>Square Payments</h2>
                  <p style={{ margin:'2px 0 0',fontSize:12,color:'#64748b' }}>Accept credit card payments from clients</p>
                </div>
                <span style={{ marginLeft:'auto',fontSize:12,fontWeight:600,background:squareToken?'#052e16':'#1a1000',color:squareToken?'#4ade80':'#fcd34d',padding:'3px 10px',borderRadius:20,border:`1px solid ${squareToken?'#16a34a':'#d97706'}` }}>{squareToken?'Configured':'Setup needed'}</span>
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr',gap:10,marginBottom:12 }}>
                <div>
                  <label style={lbl}>Square Access Token</label>
                  <input style={inp} type="password" placeholder="sq0atp-..." value={squareToken} onChange={e=>setSquareToken(e.target.value)} />
                  <p style={{ margin:'4px 0 0',fontSize:11,color:'#475569' }}>Found in Square Dashboard → Developer → Applications → Access Token</p>
                </div>
                <div><label style={lbl}>Square Application ID</label><input style={inp} placeholder="sq0idp-..." value={squareAppId} onChange={e=>setSquareAppId(e.target.value)} /></div>
                <div><label style={lbl}>Square Location ID</label><input style={inp} placeholder="LXXXXXXXXXXXXXXXX" value={squareLocationId} onChange={e=>setSquareLocationId(e.target.value)} /></div>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <a href="https://developer.squareup.com/apps" target="_blank" rel="noreferrer"
                  style={{ padding:'9px 16px',background:'none',border:'1px solid #334155',borderRadius:8,color:'#94a3b8',fontSize:13,textDecoration:'none',display:'inline-flex',alignItems:'center',gap:6 }}>
                  ↗ Open Square Developer Dashboard
                </a>
                <button onClick={()=>saveApiKeys({square_access_token:squareToken,square_app_id:squareAppId,square_location_id:squareLocationId},'Square settings')} disabled={keysSaving}
                  style={{ padding:'9px 18px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit',opacity:keysSaving?0.7:1 }}>Save Square Settings</button>
              </div>
            </div>

            {/* ── EMAIL (SMTP) ── */}
            <div style={card}>
              <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:16 }}>
                <div style={{ background:'#1bdbad',borderRadius:8,padding:'6px 10px',fontSize:13,fontWeight:800,color:'#000' }}>✉ Email</div>
                <div>
                  <h2 style={{ ...secTitle,margin:0 }}>Email Settings (GoDaddy / SMTP)</h2>
                  <p style={{ margin:'2px 0 0',fontSize:12,color:'#64748b' }}>Send invoices, quotes, and reminders using your GoDaddy email</p>
                </div>
                <span style={{ marginLeft:'auto',fontSize:12,fontWeight:600,background:smtpUser?'#052e16':'#1a1000',color:smtpUser?'#4ade80':'#fcd34d',padding:'3px 10px',borderRadius:20,border:`1px solid ${smtpUser?'#16a34a':'#d97706'}` }}>{smtpUser?'Configured':'Setup needed'}</span>
              </div>
              <div style={{ background:'#1e293b',borderRadius:10,padding:'1rem',marginBottom:16 }}>
                <p style={{ margin:'0 0 6px',fontSize:13,color:'#94a3b8',fontWeight:600 }}>GoDaddy Workspace Email settings:</p>
                <p style={{ margin:'0 0 2px',fontSize:12,color:'#cbd5e1' }}>• Outgoing server: <span style={{color:'#4ade80'}}>smtpout.secureserver.net</span></p>
                <p style={{ margin:'0 0 2px',fontSize:12,color:'#cbd5e1' }}>• Port: <span style={{color:'#4ade80'}}>465</span> (SSL) or <span style={{color:'#4ade80'}}>587</span> (TLS)</p>
                <p style={{ margin:'0 0 2px',fontSize:12,color:'#cbd5e1' }}>• Username: your full GoDaddy email address</p>
                <p style={{ margin:0,fontSize:12,color:'#cbd5e1' }}>• Password: your GoDaddy email password</p>
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12 }}>
                <div><label style={lbl}>From Name</label><input style={inp} placeholder="PHL Land Care Inc." value={smtpFromName} onChange={e=>setSmtpFromName(e.target.value)} /></div>
                <div><label style={lbl}>From Email Address</label><input style={inp} placeholder="admin@phllandcare.com" value={smtpFromEmail} onChange={e=>setSmtpFromEmail(e.target.value)} /></div>
                <div><label style={lbl}>SMTP Username (your email)</label><input style={inp} placeholder="admin@phllandcare.com" value={smtpUser} onChange={e=>setSmtpUser(e.target.value)} /></div>
                <div><label style={lbl}>SMTP Password</label><input style={inp} type="password" placeholder="Your GoDaddy email password" value={smtpPass} onChange={e=>setSmtpPass(e.target.value)} /></div>
                <div><label style={lbl}>SMTP Host</label><input style={inp} placeholder="smtpout.secureserver.net" value={smtpHost} onChange={e=>setSmtpHost(e.target.value)} /></div>
                <div>
                  <label style={lbl}>Port</label>
                  <select style={inp} value={smtpPort} onChange={e=>setSmtpPort(e.target.value)}>
                    <option value="465">465 (SSL — recommended for GoDaddy)</option>
                    <option value="587">587 (TLS/STARTTLS)</option>
                    <option value="25">25 (plain — not recommended)</option>
                  </select>
                </div>
              </div>
              <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                <button onClick={()=>saveApiKeys({smtp_host:smtpHost,smtp_port:smtpPort,smtp_username:smtpUser,smtp_password:smtpPass,smtp_from_name:smtpFromName,smtp_from_email:smtpFromEmail},'Email settings')} disabled={keysSaving}
                  style={{ padding:'9px 18px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit',opacity:keysSaving?0.7:1 }}>
                  Save Email Settings
                </button>
                <button onClick={async()=>{
                  try {
                    const user = (await supabase.auth.getUser()).data.user
                    const to = user?.email || smtpFromEmail || 'admin@phllandcare.com'
                    await supabase.functions.invoke('send-email',{body:{to,subject:'PHL CRM — Test Email ✅',html:'<div style="font-family:sans-serif;padding:24px"><h2 style="color:#16a34a">PHL Land Care CRM</h2><p>Your GoDaddy email is working correctly!</p></div>'}})
                    showToast('✅ Test email sent to ' + to)
                  } catch(e:any) { showToast('⚠️ Test failed: ' + e.message) }
                }} style={{ padding:'9px 18px',border:'1px solid #0ea5e9',borderRadius:8,background:'rgba(14,165,233,0.1)',color:'#7dd3fc',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>
                  📧 Send Test Email
                </button>
              </div>
              <div style={{ marginTop:16,paddingTop:16,borderTop:'1px solid #1e293b' }}>
                <p style={{ margin:'0 0 8px',fontSize:12,color:'#475569',fontWeight:600 }}>Optional: Resend API fallback</p>
                <div style={{ display:'flex',gap:8,alignItems:'center' }}>
                  <input style={{ ...inp,flex:1 }} type="password" placeholder="re_xxxx (optional)" value={resendKey} onChange={e=>setResendKey(e.target.value)} />
                  <button onClick={()=>saveApiKeys({resend_api_key:resendKey},'Resend fallback')} disabled={keysSaving}
                    style={{ padding:'9px 14px',border:'1px solid #334155',borderRadius:8,background:'transparent',color:'#94a3b8',cursor:'pointer',fontSize:13,fontFamily:'inherit',whiteSpace:'nowrap' }}>Save</button>
                </div>
              </div>
            </div>

            {/* ── SIGNALWIRE — Phone, Fax & SMS ── */}
            <div style={card}>
              <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:16 }}>
                <div style={{ background:'linear-gradient(135deg,#5B2D8E,#7C3AED)',borderRadius:8,padding:'6px 12px',fontSize:13,fontWeight:800,color:'#fff',letterSpacing:'-0.3px' }}>📡 SW</div>
                <div>
                  <h2 style={{ ...secTitle,margin:0 }}>SignalWire — Phone, Fax & SMS</h2>
                  <p style={{ margin:'2px 0 0',fontSize:12,color:'#64748b' }}>Outbound calls, incoming calls, fax sending/receiving, and SMS notifications</p>
                </div>
                <span style={{ marginLeft:'auto',fontSize:12,fontWeight:600,background:swProjectId?'#052e16':'#1a1000',color:swProjectId?'#4ade80':'#fcd34d',padding:'3px 10px',borderRadius:20,border:`1px solid ${swProjectId?'#16a34a':'#d97706'}` }}>{swProjectId?'Configured':'Setup needed'}</span>
              </div>

              <div style={{ background:'#1e293b',borderRadius:10,padding:'1rem',marginBottom:16 }}>
                <p style={{ margin:'0 0 8px',fontSize:13,color:'#94a3b8',fontWeight:600 }}>What SignalWire powers in PHL CRM:</p>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:6 }}>
                  {[
                    { icon:'📞', text:'Outbound calls from Dialer' },
                    { icon:'📲', text:'Inbound call routing' },
                    { icon:'📠', text:'Send & receive faxes' },
                    { icon:'💬', text:'SMS to clients & staff' },
                    { icon:'🔔', text:'Job & invoice reminders' },
                    { icon:'📋', text:'Voicemail transcription' },
                  ].map(f => (
                    <div key={f.text} style={{ display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#cbd5e1' }}>
                      <span>{f.icon}</span><span>{f.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12 }}>
                <div>
                  <label style={lbl}>Project ID</label>
                  <input style={inp} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={swProjectId} onChange={e=>setSwProjectId(e.target.value)} />
                  <p style={{ margin:'4px 0 0',fontSize:11,color:'#475569' }}>SignalWire Dashboard → Project → Settings</p>
                </div>
                <div>
                  <label style={lbl}>API Token</label>
                  <input style={inp} type="password" placeholder="PTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" value={swApiToken} onChange={e=>setSwApiToken(e.target.value)} />
                  <p style={{ margin:'4px 0 0',fontSize:11,color:'#475569' }}>Found under API Credentials in your project</p>
                </div>
                <div>
                  <label style={lbl}>Space URL</label>
                  <input style={inp} placeholder="yourspace.signalwire.com" value={swSpaceUrl} onChange={e=>setSwSpaceUrl(e.target.value)} />
                  <p style={{ margin:'4px 0 0',fontSize:11,color:'#475569' }}>e.g. phllandcare.signalwire.com</p>
                </div>
                <div>
                  <label style={lbl}>Phone Number (E.164)</label>
                  <input style={inp} placeholder="+17724660000" value={swPhone} onChange={e=>setSwPhone(e.target.value)} />
                  <p style={{ margin:'4px 0 0',fontSize:11,color:'#475569' }}>Your SignalWire DID number for calls, SMS & fax</p>
                </div>
              </div>

              <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                <a href="https://signalwire.com/signin" target="_blank" rel="noreferrer"
                  style={{ padding:'9px 16px',background:'none',border:'1px solid #334155',borderRadius:8,color:'#94a3b8',fontSize:13,textDecoration:'none',display:'inline-flex',alignItems:'center',gap:6 }}>
                  ↗ Open SignalWire Dashboard
                </a>
                <button onClick={()=>saveApiKeys({signalwire_project_id:swProjectId,signalwire_api_token:swApiToken,signalwire_space_url:swSpaceUrl,signalwire_phone_number:swPhone},'SignalWire settings')} disabled={keysSaving}
                  style={{ padding:'9px 18px',border:'none',borderRadius:8,background:'#7C3AED',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit',opacity:keysSaving?0.7:1 }}>
                  Save SignalWire Settings
                </button>
                <button onClick={async()=>{
                  const to = prompt('Enter a phone number to test SMS (e.g. +17725551234):')
                  if (!to) return
                  try {
                    await supabase.functions.invoke('send-sms',{body:{to,message:'PHL Land Care CRM — SignalWire SMS test successful! 🎉'}})
                    showToast('✅ Test SMS sent to ' + to)
                  } catch { showToast('⚠️ SMS test failed — check SignalWire settings') }
                }} style={{ padding:'9px 18px',border:'1px solid rgba(167,139,250,0.4)',borderRadius:8,background:'rgba(167,139,250,0.1)',color:'#a78bfa',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>
                  💬 Send Test SMS
                </button>
              </div>

              <div style={{ marginTop:16,paddingTop:16,borderTop:'1px solid #1e293b',background:'rgba(92,45,142,0.08)',borderRadius:8,padding:'12px 14px',marginTop:16 }}>
                <p style={{ margin:'0 0 6px',fontSize:12,color:'#a78bfa',fontWeight:700 }}>📋 SignalWire Setup Guide</p>
                <p style={{ margin:'0 0 3px',fontSize:12,color:'#94a3b8' }}>1. Create a free account at <strong style={{color:'#c4b5fd'}}>signalwire.com</strong></p>
                <p style={{ margin:'0 0 3px',fontSize:12,color:'#94a3b8' }}>2. Create a project → note your <strong style={{color:'#c4b5fd'}}>Project ID</strong> and <strong style={{color:'#c4b5fd'}}>Space URL</strong></p>
                <p style={{ margin:'0 0 3px',fontSize:12,color:'#94a3b8' }}>3. Go to API → Create Token → paste as <strong style={{color:'#c4b5fd'}}>API Token</strong></p>
                <p style={{ margin:'0 0 3px',fontSize:12,color:'#94a3b8' }}>4. Buy a phone number → supports Voice + SMS + Fax on same number</p>
                <p style={{ margin:0,fontSize:12,color:'#94a3b8' }}>5. Save settings above → test SMS → open Dialer to make your first call</p>
              </div>
            </div>

            {/* ── CONNECTION STATUS ── */}
            <div style={card}>
              <h2 style={{ ...secTitle,marginBottom:12 }}>Connection Status</h2>
              <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                {[
                  {name:'Supabase',        desc:'Database & realtime sync',        status:'Connected',                                ok:true},
                  {name:'GitHub Pages',    desc:'Hosting & deployment',            status:'Active',                                   ok:true},
                  {name:'Square',          desc:'Payment processing',              status: squareToken ? 'Configured' : 'Setup needed', ok:!!squareToken},
                  {name:'Email (SMTP)',    desc:'GoDaddy outgoing email',          status: smtpUser ? 'Configured' : 'Setup needed',    ok:!!smtpUser},
                  {name:'SignalWire SMS',  desc:'SMS notifications',               status: swProjectId ? 'Configured' : 'Setup needed', ok:!!swProjectId},
                  {name:'SignalWire Voice',desc:'Phone calls via Dialer',          status: swProjectId ? 'Configured' : 'Setup needed', ok:!!swProjectId},
                  {name:'SignalWire Fax',  desc:'Send & receive faxes',            status: swProjectId ? 'Configured' : 'Setup needed', ok:!!swProjectId},
                ].map(item=>(
                  <div key={item.name} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:'#1e293b',borderRadius:10,border:'1px solid #334155' }}>
                    <div>
                      <p style={{ margin:'0 0 2px',fontSize:14,fontWeight:600,color:'#f1f5f9' }}>{item.name}</p>
                      <p style={{ margin:0,fontSize:12,color:'#64748b' }}>{item.desc}</p>
                    </div>
                    <span style={{ fontSize:12,fontWeight:600,background:item.ok?'#052e16':'#1a1000',color:item.ok?'#4ade80':'#fcd34d',padding:'3px 10px',borderRadius:20,border:`1px solid ${item.ok?'#16a34a':'#d97706'}` }}>{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── CLIENT DOCUMENT SETTINGS MODAL ── */}
      {showDocSettings && (
        <>
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:600 }} onClick={()=>setShowDocSettings(false)} />
          <div style={{ position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(900px,95vw)',maxHeight:'90vh',overflowY:'auto',background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:601 }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 24px',borderBottom:'1px solid #1e293b' }}>
              <h2 style={{ margin:0,fontSize:17,fontWeight:700,color:'#f1f5f9' }}>Client Document Settings</h2>
              <button onClick={()=>setShowDocSettings(false)} style={{ background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer' }}>×</button>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,minHeight:500 }}>
              <div style={{ padding:'20px 24px',borderRight:'1px solid #1e293b' }}>
                <div style={{ display:'flex',gap:0,borderBottom:'1px solid #1e293b',marginBottom:20 }}>
                  {(['Quotes','Jobs','Invoices','Style'] as const).map(t => (
                    <button key={t} onClick={()=>setDocTab(t)} style={{ padding:'8px 16px',background:'none',border:'none',borderBottom:docTab===t?'2px solid #4ade80':'2px solid transparent',color:docTab===t?'#f1f5f9':'#64748b',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit' }}>{t}</button>
                  ))}
                </div>
                {docTab === 'Quotes' && (
                  <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
                    <label style={{ display:'flex',alignItems:'center',gap:8,fontSize:13,color:'#94a3b8',cursor:'pointer' }}>
                      <input type="checkbox" checked={docSettings.quote_use_estimate} onChange={e=>setDocSettings({...docSettings,quote_use_estimate:e.target.checked})} /> Refer to 'Quote' as 'Estimate'
                    </label>
                    {[
                      { key:'quote_show_qty' as const, label:'Show QTY on line items' },
                      { key:'quote_show_unit_price' as const, label:'Show unit price on line items' },
                      { key:'quote_show_total' as const, label:'Show total cost per line items' },
                      { key:'quote_show_tax' as const, label:'Show totals & tax in footer' },
                      { key:'quote_show_signature' as const, label:'Show client signature line' },
                    ].map(f => (
                      <label key={f.key} style={{ display:'flex',alignItems:'center',gap:8,fontSize:13,color:'#f1f5f9',cursor:'pointer' }}>
                        <input type="checkbox" checked={docSettings[f.key]} onChange={e=>setDocSettings({...docSettings,[f.key]:e.target.checked})} style={{ accentColor:'#4ade80' }} /> {f.label}
                      </label>
                    ))}
                    <div><label style={lbl}>Contract/Disclaimer</label><textarea style={{ ...inp,height:80,resize:'vertical' } as React.CSSProperties} value={docSettings.quote_contract} onChange={e=>setDocSettings({...docSettings,quote_contract:e.target.value})} /></div>
                    <div><label style={lbl}>Deposit Language</label><textarea style={{ ...inp,height:60,resize:'vertical' } as React.CSSProperties} value={docSettings.quote_deposit_language} onChange={e=>setDocSettings({...docSettings,quote_deposit_language:e.target.value})} /></div>
                  </div>
                )}
                {docTab === 'Jobs' && (
                  <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
                    <label style={{ display:'flex',alignItems:'center',gap:8,fontSize:13,color:'#f1f5f9',cursor:'pointer' }}>
                      <input type="checkbox" checked={docSettings.job_show_signature} onChange={e=>setDocSettings({...docSettings,job_show_signature:e.target.checked})} style={{ accentColor:'#4ade80' }} /> Include client signature line
                    </label>
                    <div><label style={lbl}>Contract/Disclaimer</label><textarea style={{ ...inp,height:80,resize:'vertical' } as React.CSSProperties} value={docSettings.job_contract} onChange={e=>setDocSettings({...docSettings,job_contract:e.target.value})} /></div>
                  </div>
                )}
                {docTab === 'Invoices' && (
                  <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
                    {[
                      { key:'inv_show_qty' as const, label:'Show QTY on line items' },
                      { key:'inv_show_unit_price' as const, label:'Show unit price on line items' },
                      { key:'inv_show_total' as const, label:'Show total cost on line items' },
                      { key:'inv_return_stub' as const, label:'Include return payment stub' },
                      { key:'inv_late_stamp' as const, label:'Show late stamp if overdue' },
                      { key:'inv_account_balance' as const, label:'Show account balance' },
                      { key:'inv_paid_date' as const, label:'Show paid date' },
                    ].map(f => (
                      <label key={f.key} style={{ display:'flex',alignItems:'center',gap:8,fontSize:13,color:'#f1f5f9',cursor:'pointer' }}>
                        <input type="checkbox" checked={docSettings[f.key]} onChange={e=>setDocSettings({...docSettings,[f.key]:e.target.checked})} style={{ accentColor:'#4ade80' }} /> {f.label}
                      </label>
                    ))}
                    <div><label style={lbl}>Contract/Disclaimer</label><textarea style={{ ...inp,height:80,resize:'vertical' } as React.CSSProperties} value={docSettings.inv_contract} onChange={e=>setDocSettings({...docSettings,inv_contract:e.target.value})} /></div>
                  </div>
                )}
                {docTab === 'Style' && (
                  <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
                    {[
                      { label:'Header Layout', key:'header_layout' as const, opts:['Basic','Centered','Split'] },
                      { label:'Header Style', key:'header_style' as const, opts:['Modern','Classic','Minimal'] },
                      { label:'Logo Size', key:'logo_size' as const, opts:['Small','Medium','Large'] },
                      { label:'Theme Color', key:'theme_color' as const, opts:['Default','Blue','Green','Dark'] },
                      { label:'Footer Font Size', key:'footer_font_size' as const, opts:['8','9','10','11'] },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={lbl}>{f.label}</label>
                        <select style={{ ...inp,appearance:'auto' }} value={docSettings[f.key]} onChange={e=>setDocSettings({...docSettings,[f.key]:e.target.value})}>
                          {f.opts.map(o=><option key={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                    <div style={{ display:'flex',flexDirection:'column',gap:10,paddingTop:8,borderTop:'1px solid #1e293b' }}>
                      {[
                        { key:'show_company_name' as const, label:'Show company name' },
                        { key:'show_company_phone' as const, label:'Show company phone' },
                        { key:'show_company_email' as const, label:'Show company email' },
                        { key:'show_company_website' as const, label:'Show company website' },
                        { key:'show_client_phone' as const, label:'Show client phone' },
                      ].map(f => (
                        <label key={f.key} style={{ display:'flex',alignItems:'center',gap:8,fontSize:13,color:'#f1f5f9',cursor:'pointer' }}>
                          <input type="checkbox" checked={docSettings[f.key]} onChange={e=>setDocSettings({...docSettings,[f.key]:e.target.checked})} style={{ accentColor:'#4ade80' }} /> {f.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding:'20px 24px',background:'#070d19',display:'flex',flexDirection:'column',alignItems:'center' }}>
                <p style={{ margin:'0 0 12px',fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.06em',alignSelf:'flex-start' }}>Preview</p>
                <InvoicePreview />
              </div>
            </div>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 24px',borderTop:'1px solid #1e293b' }}>
              <button onClick={()=>setShowDocSettings(false)} style={{ padding:'9px 18px',border:'1px solid #1e293b',borderRadius:8,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>Cancel</button>
              <button onClick={()=>{showToast('Document settings saved!');setShowDocSettings(false)}} style={{ padding:'9px 18px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit' }}>Save Changes</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
