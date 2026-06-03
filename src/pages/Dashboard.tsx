import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ClientsPage from './ClientsPage'
import JobsPage from './JobsPage'
import InvoicesPage from './InvoicesPage'
import QuotesPage from './QuotesPage'
import SchedulePage from './SchedulePage'
import PayrollPage from './PayrollPage'
import ExpensesPage from './ExpensesPage'
import InventoryPage from './InventoryPage'
import TeamPage from './TeamPage'
import SettingsPage from './SettingsPage'
import TeamChatPage from './TeamChatPage'
import ReportsPage from './ReportsPage'
import ProductsServicesPage from './ProductsServicesPage'

type UserRole = 'superadmin' | 'manager' | 'dispatcher' | 'worker' | 'worker_limited'

// ── Permission helpers ──────────────────────────────────────────────────────
const can = (role: UserRole, action: string): boolean => {
  const perms: Record<string, UserRole[]> = {
    view_clients:        ['superadmin','manager','dispatcher','worker'],
    edit_clients:        ['superadmin','manager','dispatcher'],
    view_quotes:         ['superadmin','manager','dispatcher','worker'],
    edit_quotes:         ['superadmin','manager','dispatcher'],
    view_jobs:           ['superadmin','manager','dispatcher','worker','worker_limited'],
    edit_jobs:           ['superadmin','manager','dispatcher'],
    view_invoices:       ['superadmin','manager'],
    edit_invoices:       ['superadmin','manager'],
    view_schedule:       ['superadmin','manager','dispatcher','worker','worker_limited'],
    edit_schedule:       ['superadmin','manager','dispatcher'],
    view_payroll:        ['superadmin','manager'],
    view_expenses:       ['superadmin','manager','dispatcher','worker'],
    edit_expenses:       ['superadmin','manager'],
    view_team:           ['superadmin','manager'],
    view_reports:        ['superadmin','manager'],
    view_settings:       ['superadmin'],
    view_inventory:      ['superadmin','manager','dispatcher'],
    view_pricing:        ['superadmin','manager'],
    manage_users:        ['superadmin'],
  }
  return (perms[action] || []).includes(role)
}

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const page = location.pathname.replace('/', '') || 'dashboard'
  const [counts, setCounts] = useState({clients:0,requests:0,quotes:0,jobs:0,invoices:0})
  const [userName, setUserName] = useState('')
  const [userInitials, setUserInitials] = useState('')
  const [userRole, setUserRole] = useState<UserRole>('worker_limited')
  const [recentClients, setRecentClients] = useState<any[]>([])
  const [jobStats, setJobStats] = useState({active:0,requiresInvoicing:0,actionRequired:0,totalValue:0})
  const [invoiceStats, setInvoiceStats] = useState({awaitingPayment:0,draft:0,pastDue:0,totalValue:0,draftValue:0,pastDueValue:0})
  const [quoteStats, setQuoteStats] = useState({approved:0,draft:0,changesRequested:0,approvedValue:0,draftValue:0,changesValue:0})
  const [revenue, setRevenue] = useState({monthly:0,receivables:0})

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})
  const firstName = userName.split(' ')[0] || 'there'

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('user_profiles').select('full_name, role').eq('id', user.id).single()
        if (profile?.full_name) {
          setUserName(profile.full_name)
          setUserInitials(profile.full_name.split(' ').map((n:string)=>n[0]).slice(0,2).join('').toUpperCase())
        }
        if (profile?.role) setUserRole(profile.role as UserRole)
      }

      const [c,q,j,i,rc,allJobs,allInvoices,allQuotes] = await Promise.all([
        supabase.from('clients').select('*',{count:'exact',head:true}).is('deleted_at',null),
        supabase.from('quotes').select('*',{count:'exact',head:true}).is('deleted_at',null),
        supabase.from('jobs').select('*',{count:'exact',head:true}).is('deleted_at',null),
        supabase.from('invoices').select('*',{count:'exact',head:true}).is('deleted_at',null),
        supabase.from('clients').select('first_name,last_name,divisions,status').is('deleted_at',null).order('created_at',{ascending:false}).limit(5),
        supabase.from('jobs').select('status,amount').is('deleted_at',null),
        supabase.from('invoices').select('status,amount').is('deleted_at',null),
        supabase.from('quotes').select('status,amount').is('deleted_at',null),
      ])

      setCounts({clients:c.count??0,requests:0,quotes:q.count??0,jobs:j.count??0,invoices:i.count??0})
      setRecentClients(rc.data??[])

      const jobs = allJobs.data ?? []
      const invoices = allInvoices.data ?? []
      const quotes = allQuotes.data ?? []

      setJobStats({
        active: jobs.filter(j=>j.status==='in_progress'||j.status==='scheduled').length,
        requiresInvoicing: jobs.filter(j=>j.status==='completed').length,
        actionRequired: jobs.filter(j=>j.status==='scheduled').length,
        totalValue: jobs.reduce((a,j)=>a+(j.amount||0),0),
      })
      setInvoiceStats({
        awaitingPayment: invoices.filter(i=>i.status==='sent').length,
        draft: invoices.filter(i=>i.status==='draft').length,
        pastDue: invoices.filter(i=>i.status==='overdue').length,
        totalValue: invoices.filter(i=>i.status==='sent').reduce((a,i)=>a+(i.amount||0),0),
        draftValue: invoices.filter(i=>i.status==='draft').reduce((a,i)=>a+(i.amount||0),0),
        pastDueValue: invoices.filter(i=>i.status==='overdue').reduce((a,i)=>a+(i.amount||0),0),
      })
      setQuoteStats({
        approved: quotes.filter(q=>q.status==='approved').length,
        draft: quotes.filter(q=>q.status==='draft').length,
        changesRequested: quotes.filter(q=>q.status==='sent').length,
        approvedValue: quotes.filter(q=>q.status==='approved').reduce((a,q)=>a+(q.amount||0),0),
        draftValue: quotes.filter(q=>q.status==='draft').reduce((a,q)=>a+(q.amount||0),0),
        changesValue: quotes.filter(q=>q.status==='sent').reduce((a,q)=>a+(q.amount||0),0),
      })
      setRevenue({
        monthly: invoices.filter(i=>i.status==='paid').reduce((a,i)=>a+(i.amount||0),0),
        receivables: invoices.filter(i=>i.status==='sent'||i.status==='overdue').reduce((a,i)=>a+(i.amount||0),0),
      })
    }
    loadData()
    const channel = supabase.channel('dashboard')
      .on('postgres_changes',{event:'*',schema:'public',table:'clients'},loadData)
      .on('postgres_changes',{event:'*',schema:'public',table:'jobs'},loadData)
      .on('postgres_changes',{event:'*',schema:'public',table:'invoices'},loadData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleSignOut = async () => { await supabase.auth.signOut() }

  const fmt = (n:number) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n}`

  const roleBadgeColor: Record<UserRole, string> = {
    superadmin:     '#4ade80',
    manager:        '#60a5fa',
    dispatcher:     '#fb923c',
    worker:         '#a78bfa',
    worker_limited: '#94a3b8',
  }
  const roleLabel: Record<UserRole, string> = {
    superadmin:     'Superadmin',
    manager:        'Manager',
    dispatcher:     'Dispatcher',
    worker:         'Worker',
    worker_limited: 'Worker (Limited)',
  }

  const NavItem = ({label,id,icon,count,onClick}:{label:string,id:string,icon?:string,count?:number,onClick?:()=>void}) => (
    <button onClick={onClick||(()=>navigate('/'+id))} style={{
      width:'100%',textAlign:'left',padding:'8px 16px',
      background:page===id || (id==='dashboard' && page==='')?'rgba(74,222,128,0.1)':'transparent',
      border:'none',borderLeft:page===id || (id==='dashboard' && page==='')?'2px solid #4ade80':'2px solid transparent',
      cursor:'pointer',fontSize:13,
      color:page===id || (id==='dashboard' && page==='')?'#f1f5f9':'#64748b',
      display:'flex',alignItems:'center',gap:9,
      fontWeight:page===id || (id==='dashboard' && page==='')?600:400,fontFamily:'inherit',
      transition:'all 0.1s',
    }}>
      {icon && <span style={{fontSize:14,width:16,textAlign:'center'}}>{icon}</span>}
      <span style={{flex:1}}>{label}</span>
      {count!==undefined && count>0 && <span style={{fontSize:10,background:'rgba(255,255,255,0.1)',padding:'1px 7px',borderRadius:20,color:'#94a3b8'}}>{count}</span>}
    </button>
  )

  const SectionLabel = ({title}:{title:string}) => (
    <p style={{fontSize:10,fontWeight:700,color:'#334155',textTransform:'uppercase',letterSpacing:'0.1em',margin:'16px 16px 4px',fontFamily:'inherit'}}>{title}</p>
  )

  const renderPage = () => {
    switch(page) {
      case 'clients':   return can(userRole,'view_clients')   ? <ClientsPage />   : <AccessDenied />
      case 'jobs':      return can(userRole,'view_jobs')      ? <JobsPage />      : <AccessDenied />
      case 'invoices':  return can(userRole,'view_invoices')  ? <InvoicesPage />  : <AccessDenied />
      case 'quotes':    return can(userRole,'view_quotes')    ? <QuotesPage />    : <AccessDenied />
      case 'schedule':  return can(userRole,'view_schedule')  ? <SchedulePage />  : <AccessDenied />
      case 'payroll':   return can(userRole,'view_payroll')   ? <PayrollPage />   : <AccessDenied />
      case 'expenses':  return can(userRole,'view_expenses')  ? <ExpensesPage />  : <AccessDenied />
      case 'inventory': return can(userRole,'view_inventory') ? <InventoryPage /> : <AccessDenied />
      case 'team':      return can(userRole,'view_team')      ? <TeamPage />      : <AccessDenied />
      case 'settings':  return can(userRole,'view_settings')  ? <SettingsPage />  : <AccessDenied />
      case 'timeclock': { window.open('https://phllandcare.github.io/phl-crm/PHL_TimeClock_Secure.html','_blank'); navigate('/'); return null; }
      case 'teamchat':  return can(userRole,'manage_users')   ? <TeamChatPage />  : <AccessDenied />
      case 'reports':   return can(userRole,'view_reports')   ? <ReportsPage />   : <AccessDenied />
      case 'products':  return can(userRole,'view_quotes')    ? <ProductsServicesPage /> : <AccessDenied />
      default: return (
        <div style={{padding:'2rem',maxWidth:1400,margin:'0 auto'}}>
          <div style={{marginBottom:'1.75rem'}}>
            <p style={{margin:'0 0 2px',fontSize:13,color:'#64748b'}}>{dateStr}</p>
            <h1 style={{margin:0,fontSize:26,fontWeight:700,color:'#f1f5f9'}}>{greeting}, {firstName}</h1>
          </div>
          <p style={{fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.08em',margin:'0 0 10px'}}>Workflow</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:1,marginBottom:'2rem',background:'#1e293b',borderRadius:14,overflow:'hidden',border:'1px solid #1e293b'}}>
            <div style={{background:'#0f172a',padding:'1.25rem',borderRight:'1px solid #1e293b'}}>
              <p style={{margin:'0 0 4px',fontSize:12,color:'#64748b',fontWeight:600}}>Requests</p>
              <p style={{margin:'0 0 2px',fontSize:30,fontWeight:800,color:'#f1f5f9',lineHeight:1}}>{counts.requests}</p>
              <p style={{margin:0,fontSize:12,color:'#64748b'}}>New</p>
            </div>
            {can(userRole,'view_quotes') && (
              <div style={{background:'#0f172a',padding:'1.25rem',borderRight:'1px solid #1e293b'}}>
                <p style={{margin:'0 0 4px',fontSize:12,color:'#64748b',fontWeight:600}}>Quotes</p>
                <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:2}}>
                  <p style={{margin:0,fontSize:30,fontWeight:800,color:'#f1f5f9',lineHeight:1}}>{quoteStats.approved}</p>
                  {can(userRole,'view_pricing') && <p style={{margin:0,fontSize:12,color:'#4ade80',fontWeight:600}}>{fmt(quoteStats.approvedValue)}</p>}
                </div>
                <p style={{margin:'0 0 12px',fontSize:12,color:'#64748b'}}>Approved</p>
                <div style={{borderTop:'1px solid #1e293b',paddingTop:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',margin:'2px 0'}}>
                    <span style={{fontSize:12,color:'#64748b'}}>Draft ({quoteStats.draft})</span>
                    {can(userRole,'view_pricing') && <span style={{fontSize:12,color:'#64748b'}}>{fmt(quoteStats.draftValue)}</span>}
                  </div>
                </div>
              </div>
            )}
            {can(userRole,'view_jobs') && (
              <div style={{background:'#0f172a',padding:'1.25rem',borderRight:'1px solid #1e293b'}}>
                <p style={{margin:'0 0 4px',fontSize:12,color:'#64748b',fontWeight:600}}>Jobs</p>
                <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:2}}>
                  <p style={{margin:0,fontSize:30,fontWeight:800,color:'#f1f5f9',lineHeight:1}}>{jobStats.requiresInvoicing}</p>
                  {can(userRole,'view_pricing') && <p style={{margin:0,fontSize:12,color:'#4ade80',fontWeight:600}}>{fmt(jobStats.totalValue)}</p>}
                </div>
                <p style={{margin:'0 0 12px',fontSize:12,color:'#64748b'}}>Requires invoicing</p>
                <div style={{borderTop:'1px solid #1e293b',paddingTop:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',margin:'2px 0'}}>
                    <span style={{fontSize:12,color:'#64748b'}}>Active ({jobStats.active})</span>
                  </div>
                </div>
              </div>
            )}
            {can(userRole,'view_invoices') && (
              <div style={{background:'#0f172a',padding:'1.25rem'}}>
                <p style={{margin:'0 0 4px',fontSize:12,color:'#64748b',fontWeight:600}}>Invoices</p>
                <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:2}}>
                  <p style={{margin:0,fontSize:30,fontWeight:800,color:'#f1f5f9',lineHeight:1}}>{invoiceStats.awaitingPayment}</p>
                  <p style={{margin:0,fontSize:12,color:'#4ade80',fontWeight:600}}>{fmt(invoiceStats.totalValue)}</p>
                </div>
                <p style={{margin:'0 0 12px',fontSize:12,color:'#64748b'}}>Awaiting payment</p>
                <div style={{borderTop:'1px solid #1e293b',paddingTop:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',margin:'2px 0'}}>
                    <span style={{fontSize:12,color:'#64748b'}}>Draft ({invoiceStats.draft})</span>
                    <span style={{fontSize:12,color:'#64748b'}}>{fmt(invoiceStats.draftValue)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',margin:'2px 0'}}>
                    <span style={{fontSize:12,color:'#e87171'}}>Past due ({invoiceStats.pastDue})</span>
                    <span style={{fontSize:12,color:'#e87171'}}>{fmt(invoiceStats.pastDueValue)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:16}}>
            {can(userRole,'view_clients') && (
              <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',padding:'1.25rem'}}>
                <p style={{margin:'0 0 1rem',fontSize:15,fontWeight:600,color:'#f1f5f9'}}>Recent Clients</p>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr>{['Client','Division','Status'].map(h=>(<th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:11,fontWeight:600,color:'#475569',borderBottom:'1px solid #1e293b'}}>{h}</th>))}</tr>
                  </thead>
                  <tbody>
                    {recentClients.length===0 ? (
                      <tr><td colSpan={3} style={{padding:'2rem',textAlign:'center',color:'#475569',fontSize:13}}>No clients yet</td></tr>
                    ) : recentClients.map((c,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid #1e293b'}}>
                        <td style={{padding:'10px 12px',fontSize:13,color:'#f1f5f9'}}>{c.first_name} {c.last_name}</td>
                        <td style={{padding:'10px 12px',fontSize:13,color:'#64748b'}}>{c.divisions||'--'}</td>
                        <td style={{padding:'10px 12px'}}>
                          <span style={{background:c.status==='active'?'rgba(74,222,128,0.15)':'rgba(100,116,139,0.2)',color:c.status==='active'?'#4ade80':'#94a3b8',padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>{c.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {can(userRole,'view_pricing') && (
              <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',padding:'1.25rem'}}>
                <p style={{margin:'0 0 1rem',fontSize:15,fontWeight:600,color:'#f1f5f9'}}>Business Performance</p>
                <div style={{background:'#1e293b',borderRadius:10,padding:'1rem',marginBottom:10,cursor:'pointer'}} onClick={()=>navigate('/invoices')}>
                  <p style={{margin:'0 0 4px',fontSize:13,fontWeight:600,color:'#f1f5f9'}}>Receivables</p>
                  <p style={{margin:'0 0 4px',fontSize:12,color:'#64748b'}}>{counts.clients} clients owe you</p>
                  <p style={{margin:0,fontSize:22,fontWeight:800,color:'#4ade80'}}>{fmt(revenue.receivables)}</p>
                </div>
                <div style={{background:'#1e293b',borderRadius:10,padding:'1rem',marginBottom:10,cursor:'pointer'}} onClick={()=>navigate('/jobs')}>
                  <p style={{margin:'0 0 4px',fontSize:13,fontWeight:600,color:'#f1f5f9'}}>Upcoming jobs</p>
                  <p style={{margin:'0 0 4px',fontSize:12,color:'#64748b'}}>This week</p>
                  <p style={{margin:0,fontSize:22,fontWeight:800,color:'#f1f5f9'}}>{fmt(jobStats.totalValue)}</p>
                </div>
                <div style={{background:'#1e293b',borderRadius:10,padding:'1rem',cursor:'pointer'}} onClick={()=>navigate('/invoices')}>
                  <p style={{margin:'0 0 4px',fontSize:13,fontWeight:600,color:'#f1f5f9'}}>Revenue</p>
                  <p style={{margin:'0 0 4px',fontSize:12,color:'#64748b'}}>This month so far</p>
                  <p style={{margin:0,fontSize:22,fontWeight:800,color:'#f1f5f9'}}>{fmt(revenue.monthly)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',background:'#0a0f1a'}}>
      <style>{`
        .phl-sidebar::-webkit-scrollbar { display: none; }
        .phl-sidebar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div className="phl-sidebar" style={{width:220,flexShrink:0,background:'#0d1526',display:'flex',flexDirection:'column',position:'fixed',top:0,left:0,height:'100vh',overflowY:'auto',zIndex:200,borderRight:'1px solid #1e293b'}}>
        <div style={{padding:'12px 14px',borderBottom:'1px solid #1e293b',display:'flex',alignItems:'center',gap:10}}>
          <img src="https://phllandcare.github.io/phl-crm/phl_logo.jpg" alt="PHL" style={{width:36,height:36,borderRadius:8,objectFit:'cover',flexShrink:0,background:'#fff',padding:2}} />
          <div>
            <p style={{margin:0,fontSize:12.5,fontWeight:700,color:'#f1f5f9',lineHeight:1.2}}>PHL Land Care Inc.</p>
            <p style={{margin:0,fontSize:10,color:'#475569'}}>Field Service CRM</p>
          </div>
        </div>
        <div style={{padding:'10px 14px',borderBottom:'1px solid #1e293b',display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:30,height:30,borderRadius:'50%',background:'#16a34a',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#fff',flexShrink:0}}>{userInitials||'?'}</div>
          <div style={{overflow:'hidden'}}>
            <p style={{margin:0,fontSize:12,fontWeight:500,color:'#cbd5e1',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{userName||'User'}</p>
            <p style={{margin:0,fontSize:10,color:roleBadgeColor[userRole]}}>{roleLabel[userRole]}</p>
          </div>
        </div>
        <div style={{flex:1,paddingTop:4}}>
          <SectionLabel title="Main" />
          <NavItem label="Dashboard" id="dashboard" icon="🏠" />
          {can(userRole,'view_clients')  && <NavItem label="Clients"   id="clients"   icon="👥" count={counts.clients} />}
          {can(userRole,'view_quotes')   && <NavItem label="Quotes"    id="quotes"    icon="📋" count={counts.quotes} />}
          {can(userRole,'view_jobs')     && <NavItem label="Jobs"      id="jobs"      icon="🔧" count={counts.jobs} />}
          {can(userRole,'view_invoices') && <NavItem label="Invoices"  id="invoices"  icon="💰" count={counts.invoices} />}
          {can(userRole,'view_schedule') && <NavItem label="Schedule"  id="schedule"  icon="📅" />}

          <SectionLabel title="Divisions" />
          <NavItem label="Lawn & Tree"    id="div-lawn"          icon="🌿" />
          <NavItem label="Irrigation"     id="div-irrigation"    icon="💧" />
          <NavItem label="Extermination"  id="div-extermination" icon="🐛" />
          <NavItem label="Nursery"        id="div-nursery"       icon="🌱" />
          <NavItem label="Farm"           id="div-farm"          icon="🚜" />

          <SectionLabel title="Tools" />
          <NavItem label="Time Clock"    id="timeclock"  icon="⏰" onClick={()=>window.open('https://phllandcare.github.io/phl-crm/PHL_TimeClock_Secure.html','_blank')} />
          {can(userRole,'view_payroll')   && <NavItem label="Payroll"     id="payroll"   icon="💵" />}
          {can(userRole,'view_team')      && <NavItem label="All Employees" id="team"    icon="👤" />}
          {can(userRole,'view_expenses')  && <NavItem label="Expenses"    id="expenses"  icon="🧾" />}
          {can(userRole,'view_inventory') && <NavItem label="Inventory"          id="inventory" icon="📦" />}
          {can(userRole,'view_quotes')    && <NavItem label="Products & Services" id="products"  icon="🛒" />}
          {can(userRole,'view_reports')   && <NavItem label="Reports"             id="reports"   icon="📊" />}
          {can(userRole,'view_settings')  && <NavItem label="Settings"            id="settings"  icon="⚙️" />}
          {can(userRole,'manage_users')   && <NavItem label="Team Chat"           id="teamchat"  icon="💬" />}
        </div>
        <div style={{padding:'10px 14px',borderTop:'1px solid #1e293b'}}>
          <button onClick={handleSignOut} style={{width:'100%',background:'rgba(255,255,255,0.05)',color:'#64748b',border:'1px solid #1e293b',borderRadius:8,padding:'7px',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
            Sign out
          </button>
        </div>
      </div>
      <div style={{flex:1,marginLeft:220,minHeight:'100vh',background:'#0a0f1a'}}>
        {renderPage()}
      </div>
    </div>
  )
}

// ── Access Denied component ──────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'60vh',color:'#64748b'}}>
      <div style={{fontSize:48,marginBottom:16}}>🔒</div>
      <p style={{fontSize:18,fontWeight:700,color:'#f1f5f9',margin:'0 0 8px'}}>Access Restricted</p>
      <p style={{fontSize:13,margin:0}}>You don't have permission to view this page.</p>
    </div>
  )
}
