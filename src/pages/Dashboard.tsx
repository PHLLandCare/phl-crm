import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ClientsPage from './ClientsPage'
import ClientPortalPage from './ClientPortalPage'
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
import RoutePage from './RoutePage'
import ReportsPage from './ReportsPage'
import ProductsServicesPage from './ProductsServicesPage'
import DivisionPage from './DivisionPage'

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
  const [showCreate, setShowCreate] = useState(false)

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

  const sidebarRef = React.useRef<HTMLDivElement>(null)
  const sidebarScrollRef = React.useRef(0)

  const NavItem = ({label,id,icon,count,onClick}:{label:string,id:string,icon?:string,count?:number,onClick?:()=>void}) => (
    <button onClick={()=>{ if(sidebarRef.current) sidebarScrollRef.current=sidebarRef.current.scrollTop; if(onClick) onClick(); else navigate('/'+id) }} style={{
      width:'100%',textAlign:'left',padding:'8px 16px',
      background:page===id || (id==='dashboard' && page==='')?'rgba(74,222,128,0.1)':'transparent',
      border:'none',borderLeft:page===id || (id==='dashboard' && page==='')?'2px solid #4ade80':'2px solid transparent',
      cursor:'pointer',fontSize:13,
      color:page===id || (id==='dashboard' && page==='')?'#f1f5f9':'#64748b',
      display:'flex',alignItems:'center',gap:9,
      fontWeight:page===id || (id==='dashboard' && page==='')?600:400,fontFamily:'inherit',
      transition:'all 0.1s',
    }}>
      {icon && <span style={{fontSize:18,width:20,textAlign:'center'}}>{icon}</span>}
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
      case 'requests':  return <RequestsPage />
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
      case 'routes':    return can(userRole,'view_schedule')    ? <RoutePage />     : <AccessDenied />
      case 'reports':   return can(userRole,'view_reports')   ? <ReportsPage />   : <AccessDenied />
      case 'products':         return can(userRole,'view_quotes')    ? <ProductsServicesPage /> : <AccessDenied />
      case 'div-lawn':         return <DivisionPage divisionId="div-lawn" />
      case 'div-irrigation':   return <DivisionPage divisionId="div-irrigation" />
      case 'div-extermination':return <DivisionPage divisionId="div-extermination" />
      case 'div-nursery':      return <DivisionPage divisionId="div-nursery" />
      case 'div-farm':         return <DivisionPage divisionId="div-farm" />
      case 'div-hardscape':    return <DivisionPage divisionId="div-hardscape" />
      case 'portal':           return <ClientPortalPage />
      default: return (
        <div style={{padding:'2rem',maxWidth:1400,margin:'0 auto'}}>
          <div style={{marginBottom:'1.75rem'}}>
            <p style={{margin:'0 0 2px',fontSize:13,color:'#64748b'}}>{dateStr}</p>
            <h1 style={{margin:0,fontSize:26,fontWeight:700,color:'#f1f5f9'}}>{greeting}, {firstName}</h1>
          </div>
          <p style={{fontSize:11,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.08em',margin:'0 0 10px'}}>Workflow</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:1,marginBottom:'2rem',background:'#1e293b',borderRadius:14,overflow:'hidden',border:'1px solid #1e293b'}}>

            {/* REQUESTS */}

            <div onClick={()=>navigate('/requests')} style={{background:'#0f172a',padding:'1.25rem',borderRight:'1px solid #1e293b',borderTop:'3px solid #f59e0b',cursor:'pointer',transition:'background .15s'}}
              onMouseEnter={e=>(e.currentTarget.style.background='#111c2d')} onMouseLeave={e=>(e.currentTarget.style.background='#0f172a')}>
              <p style={{margin:'0 0 4px',fontSize:12,color:'#f59e0b',fontWeight:700,display:'flex',alignItems:'center',gap:5}}>📋 Requests</p>
              <p style={{margin:'0 0 2px',fontSize:30,fontWeight:800,color:'#f1f5f9',lineHeight:1}}>{counts.requests}</p>
              <p style={{margin:'0 0 12px',fontSize:12,color:'#64748b'}}>New</p>
              <div style={{borderTop:'1px solid #1e293b',paddingTop:10}}>
                <div onClick={e=>{e.stopPropagation();navigate('/requests',{state:{filter:'new'}})}} style={{display:'flex',justifyContent:'space-between',margin:'4px 0',padding:'3px 6px',borderRadius:6,cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <span style={{fontSize:12,color:'#64748b'}}>New ({counts.requests})</span>
                </div>
                <div onClick={e=>{e.stopPropagation();navigate('/requests',{state:{filter:'overdue'}})}} style={{display:'flex',justifyContent:'space-between',margin:'4px 0',padding:'3px 6px',borderRadius:6,cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <span style={{fontSize:12,color:'#e87171'}}>Overdue</span>
                </div>
              </div>
            </div>

            {/* QUOTES */}

            {can(userRole,'view_quotes') && (
              <div onClick={()=>navigate('/quotes')} style={{background:'#0f172a',padding:'1.25rem',borderRight:'1px solid #1e293b',borderTop:'3px solid #a855f7',cursor:'pointer',transition:'background .15s'}}
                onMouseEnter={e=>(e.currentTarget.style.background='#111c2d')} onMouseLeave={e=>(e.currentTarget.style.background='#0f172a')}>
                <p style={{margin:'0 0 4px',fontSize:12,color:'#a855f7',fontWeight:700,display:'flex',alignItems:'center',gap:5}}>📄 Quotes</p>
                <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:2}}>
                  <p style={{margin:0,fontSize:30,fontWeight:800,color:'#f1f5f9',lineHeight:1}}>{quoteStats.approved}</p>
                  {can(userRole,'view_pricing') && <p style={{margin:0,fontSize:12,color:'#4ade80',fontWeight:600}}>{fmt(quoteStats.approvedValue)}</p>}
                </div>
                <p style={{margin:'0 0 12px',fontSize:12,color:'#64748b'}}>Approved</p>
                <div style={{borderTop:'1px solid #1e293b',paddingTop:10}}>
                  <div onClick={e=>{e.stopPropagation();navigate('/quotes',{state:{filter:'draft'}})}} style={{display:'flex',justifyContent:'space-between',margin:'4px 0',padding:'3px 6px',borderRadius:6,cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <span style={{fontSize:12,color:'#64748b'}}>Draft ({quoteStats.draft})</span>
                    {can(userRole,'view_pricing') && <span style={{fontSize:12,color:'#64748b'}}>{fmt(quoteStats.draftValue)}</span>}
                  </div>
                  <div onClick={e=>{e.stopPropagation();navigate('/quotes',{state:{filter:'changes_requested'}})}} style={{display:'flex',justifyContent:'space-between',margin:'4px 0',padding:'3px 6px',borderRadius:6,cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <span style={{fontSize:12,color:'#fcd34d'}}>Changes requested</span>
                  </div>
                </div>
              </div>
            )}

            {/* JOBS */}

            {can(userRole,'view_jobs') && (
              <div onClick={()=>navigate('/jobs')} style={{background:'#0f172a',padding:'1.25rem',borderRight:'1px solid #1e293b',borderTop:'3px solid #3b82f6',cursor:'pointer',transition:'background .15s'}}
                onMouseEnter={e=>(e.currentTarget.style.background='#111c2d')} onMouseLeave={e=>(e.currentTarget.style.background='#0f172a')}>
                <p style={{margin:'0 0 4px',fontSize:12,color:'#3b82f6',fontWeight:700,display:'flex',alignItems:'center',gap:5}}>🔧 Jobs</p>
                <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:2}}>
                  <p style={{margin:0,fontSize:30,fontWeight:800,color:'#f1f5f9',lineHeight:1}}>{jobStats.requiresInvoicing}</p>
                  {can(userRole,'view_pricing') && <p style={{margin:0,fontSize:12,color:'#4ade80',fontWeight:600}}>{fmt(jobStats.totalValue)}</p>}
                </div>
                <p style={{margin:'0 0 12px',fontSize:12,color:'#64748b'}}>Requires invoicing</p>
                <div style={{borderTop:'1px solid #1e293b',paddingTop:10}}>
                  <div onClick={e=>{e.stopPropagation();navigate('/jobs',{state:{filter:'in_progress'}})}} style={{display:'flex',justifyContent:'space-between',margin:'4px 0',padding:'3px 6px',borderRadius:6,cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <span style={{fontSize:12,color:'#64748b'}}>Active ({jobStats.active})</span>
                    {can(userRole,'view_pricing') && <span style={{fontSize:12,color:'#64748b'}}>{fmt(jobStats.totalValue)}</span>}
                  </div>
                  <div onClick={e=>{e.stopPropagation();navigate('/jobs',{state:{filter:'action_required'}})}} style={{display:'flex',justifyContent:'space-between',margin:'4px 0',padding:'3px 6px',borderRadius:6,cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <span style={{fontSize:12,color:'#fcd34d'}}>Action required ({jobStats.actionRequired})</span>
                  </div>
                </div>
              </div>
            )}

            {/* INVOICES */}

            {can(userRole,'view_invoices') && (
              <div onClick={()=>navigate('/invoices')} style={{background:'#0f172a',padding:'1.25rem',borderTop:'3px solid #22c55e',cursor:'pointer',transition:'background .15s'}}
                onMouseEnter={e=>(e.currentTarget.style.background='#111c2d')} onMouseLeave={e=>(e.currentTarget.style.background='#0f172a')}>
                <p style={{margin:'0 0 4px',fontSize:12,color:'#22c55e',fontWeight:700,display:'flex',alignItems:'center',gap:5}}>💰 Invoices</p>
                <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:2}}>
                  <p style={{margin:0,fontSize:30,fontWeight:800,color:'#f1f5f9',lineHeight:1}}>{invoiceStats.awaitingPayment}</p>
                  <p style={{margin:0,fontSize:12,color:'#4ade80',fontWeight:600}}>{fmt(invoiceStats.totalValue)}</p>
                </div>
                <p style={{margin:'0 0 12px',fontSize:12,color:'#64748b'}}>Awaiting payment</p>
                <div style={{borderTop:'1px solid #1e293b',paddingTop:10}}>
                  <div onClick={e=>{e.stopPropagation();navigate('/invoices',{state:{filter:'draft'}})}} style={{display:'flex',justifyContent:'space-between',margin:'4px 0',padding:'3px 6px',borderRadius:6,cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <span style={{fontSize:12,color:'#64748b'}}>Draft ({invoiceStats.draft})</span>
                    <span style={{fontSize:12,color:'#64748b'}}>{fmt(invoiceStats.draftValue)}</span>
                  </div>
                  <div onClick={e=>{e.stopPropagation();navigate('/invoices',{state:{filter:'Past due'}})}} style={{display:'flex',justifyContent:'space-between',margin:'4px 0',padding:'3px 6px',borderRadius:6,cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.background='#1e293b')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
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
      <div ref={sidebarRef} onScroll={e=>{ sidebarScrollRef.current=(e.currentTarget as HTMLElement).scrollTop }} className="phl-sidebar" style={{width:220,flexShrink:0,background:'#0d1526',display:'flex',flexDirection:'column',position:'fixed',top:0,left:0,height:'100vh',overflowY:'auto',zIndex:200,borderRight:'1px solid #1e293b'}} ref={(el)=>{ if(el&&sidebarRef){(sidebarRef as any).current=el; el.scrollTop=sidebarScrollRef.current} }}>
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
        {/* CREATE BUTTON */}
        <div style={{padding:'10px 14px',borderBottom:'1px solid #1e293b'}}>
          <button
            onClick={()=>setShowCreate(v=>!v)}
            style={{width:'100%',display:'flex',alignItems:'center',gap:8,padding:'9px 14px',background:showCreate?'#1e293b':'#052e16',border:`1px solid ${showCreate?'#334155':'#16a34a'}`,borderRadius:10,cursor:'pointer',fontFamily:'inherit',transition:'all .15s'}}>
            <span style={{fontSize:16,fontWeight:700,color:showCreate?'#94a3b8':'#4ade80',lineHeight:1}}>{showCreate?'✕':'+​'}</span>
            <span style={{fontSize:14,fontWeight:700,color:showCreate?'#94a3b8':'#4ade80'}}>Create</span>
          </button>
          {showCreate && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:8}}>
              {[
                {label:'Client',  icon:'👤', color:'#f59e0b', path:'clients'},
                {label:'Request', icon:'📋', color:'#f59e0b', path:'requests'},
                {label:'Quote',   icon:'📄', color:'#a855f7', path:'quotes'},
                {label:'Job',     icon:'🔧', color:'#4ade80', path:'jobs'},
                {label:'Invoice', icon:'💰', color:'#3b82f6', path:'invoices'},
              ].map(item=>(
                <button key={item.label} onClick={()=>{setShowCreate(false);navigate('/'+item.path,{state:{openCreate:true}})}}
                  style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5,padding:'10px 6px',background:'#0f172a',border:`1px solid #1e293b`,borderRadius:10,cursor:'pointer',fontFamily:'inherit',transition:'all .15s'}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='#1e293b';(e.currentTarget as HTMLElement).style.borderColor=item.color}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='#0f172a';(e.currentTarget as HTMLElement).style.borderColor='#1e293b'}}>
                  <span style={{fontSize:20}}>{item.icon}</span>
                  <span style={{fontSize:11,fontWeight:600,color:'#94a3b8'}}>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{flex:1,paddingTop:4}}>
          {/* Jobber order: Home, Schedule, Clients, Requests, Quotes, Jobs, Invoices, Team Chat, Routes */}
          <NavItem label="Home"     id="dashboard" icon="🏠" />
          {can(userRole,'view_schedule') && <NavItem label="Schedule"  id="schedule"  icon="📅" />}
          {can(userRole,'view_clients')  && <NavItem label="Clients"   id="clients"   icon="👥" count={counts.clients} />}
          <NavItem label="Requests" id="requests"  icon="📬" count={counts.requests} />
          {can(userRole,'view_quotes')   && <NavItem label="Quotes"    id="quotes"    icon="📋" count={counts.quotes} />}
          {can(userRole,'view_jobs')     && <NavItem label="Jobs"      id="jobs"      icon="🔧" count={counts.jobs} />}
          {can(userRole,'view_invoices') && <NavItem label="Invoices"  id="invoices"  icon="💰" count={counts.invoices} />}
          {can(userRole,'manage_users')   && <NavItem label="Team Chat"         id="teamchat"  icon="💬" />}
          {can(userRole,'view_schedule') && <NavItem label="Routes"    id="routes"    icon="🗺️" />}

          <SectionLabel title="Divisions" />
          <NavItem label="Lawn & Tree"    id="div-lawn"          icon="🌿" />
          <NavItem label="Irrigation"     id="div-irrigation"    icon="💧" />
          <NavItem label="Extermination"  id="div-extermination" icon="🐛" />
          <NavItem label="Nursery"        id="div-nursery"       icon="🌱" />
          <NavItem label="Farm"           id="div-farm"          icon="🚜" />
          <NavItem label="Hardscape"      id="div-hardscape"     icon="🪨" />

          <SectionLabel title="Tools" />
          <NavItem label="Time Clock"    id="timeclock"  icon="⏰" onClick={()=>window.open('https://phllandcare.github.io/phl-crm/PHL_TimeClock_Secure.html','_self')} />
          {can(userRole,'view_payroll')   && <NavItem label="Payroll"           id="payroll"   icon="💵" />}
          {can(userRole,'view_team')      && <NavItem label="All Employees"     id="team"      icon="👤" />}
          {can(userRole,'view_expenses')  && <NavItem label="Expenses"          id="expenses"  icon="🧾" />}
          {can(userRole,'view_inventory') && <NavItem label="Inventory"         id="inventory" icon="📦" />}
          {can(userRole,'view_quotes')    && <NavItem label="Products & Services" id="products" icon="🛒" />}
          {can(userRole,'view_reports')   && <NavItem label="Reports"           id="reports"   icon="📊" />}
          {can(userRole,'view_settings')  && <NavItem label="Settings"          id="settings"  icon="⚙️" />}
        </div>
        <div style={{padding:'10px 14px',borderTop:'1px solid #1e293b'}}>
          <button onClick={handleSignOut} style={{width:'100%',background:'rgba(255,255,255,0.05)',color:'#64748b',border:'1px solid #1e293b',borderRadius:8,padding:'7px',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
            Sign out
          </button>
        </div>
      </div>
      <div style={{flex:1,marginLeft:220,height:'100vh',overflowY:'auto',background:'#0a0f1a'}} key={page} ref={(el)=>{if(el)el.scrollTop=0}}>
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

// ── Requests Page ────────────────────────────────────────────────────────────
function RequestsPage() {
  const [showNew, setShowNew] = React.useState(false)
  const [requests, setRequests] = React.useState<any[]>([])
  const [form, setForm] = React.useState({ client_name:'', phone:'', email:'', service:'', notes:'', status:'New' })
  const navigate = useNavigate()

  const inp: React.CSSProperties = { width:'100%',padding:'9px 11px',border:'1px solid #1e293b',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',background:'#0f172a',color:'#f1f5f9',boxSizing:'border-box' }
  const lbl: React.CSSProperties = { fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,display:'block' }

  const handleSave = () => {
    if (!form.client_name) return
    setRequests([...requests, { ...form, id: Date.now(), created_at: new Date().toISOString() }])
    setShowNew(false)
    setForm({ client_name:'', phone:'', email:'', service:'', notes:'', status:'New' })
  }

  const statusColors: Record<string,{bg:string;color:string}> = {
    'New':      { bg:'rgba(251,191,36,0.15)',  color:'#fbbf24' },
    'In Progress':{ bg:'rgba(96,165,250,0.15)', color:'#60a5fa' },
    'Completed':{ bg:'rgba(74,222,128,0.15)',  color:'#4ade80' },
    'Archived': { bg:'rgba(100,116,139,0.15)', color:'#94a3b8' },
  }
  const sc = (s:string) => statusColors[s] || statusColors['New']

  return (
    <div style={{padding:'2rem',background:'#0a0f1a',minHeight:'100vh'}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:28,fontWeight:800,color:'#f1f5f9',margin:'0 0 2px'}}>Requests</h1>
          <p style={{fontSize:13,color:'#64748b',margin:0}}>{requests.length} total requests</p>
        </div>
        <button onClick={()=>setShowNew(true)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:9,padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ New Request</button>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:'1.5rem'}}>
        {[
          { label:'New',         val:requests.filter(r=>r.status==='New').length,          color:'#fbbf24' },
          { label:'In Progress', val:requests.filter(r=>r.status==='In Progress').length,  color:'#60a5fa' },
          { label:'Completed',   val:requests.filter(r=>r.status==='Completed').length,    color:'#4ade80' },
          { label:'Total',       val:requests.length,                                       color:'#94a3b8' },
        ].map((s,i)=>(
          <div key={i} style={{background:'#0f172a',border:'1px solid #1e293b',borderTop:`3px solid ${s.color}`,borderRadius:14,padding:'1rem 1.25rem'}}>
            <p style={{margin:'0 0 4px',fontSize:11,color:s.color,fontWeight:700,textTransform:'uppercase'}}>{s.label}</p>
            <span style={{fontSize:28,fontWeight:800,color:'#f1f5f9'}}>{s.val}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{borderBottom:'1px solid #1e293b',background:'#0d1526'}}>
              {['Client','Phone','Email','Service','Status','Date',''].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.05em'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr><td colSpan={7} style={{padding:'3rem',textAlign:'center',color:'#475569',fontSize:13}}>
                <div style={{fontSize:40,marginBottom:12}}>📬</div>
                <p style={{margin:'0 0 4px',fontSize:15,fontWeight:600,color:'#64748b'}}>No requests yet</p>
                <p style={{margin:'0 0 16px',fontSize:13}}>Click "New Request" to add your first service request</p>
                <button onClick={()=>setShowNew(true)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'9px 20px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ New Request</button>
              </td></tr>
            ) : requests.map(r=>(
              <tr key={r.id} style={{borderBottom:'1px solid #1e293b'}}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.03)')}
                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                <td style={{padding:'12px 14px',fontSize:13,color:'#f1f5f9',fontWeight:600}}>{r.client_name}</td>
                <td style={{padding:'12px 14px',fontSize:13,color:'#64748b'}}>{r.phone||'—'}</td>
                <td style={{padding:'12px 14px',fontSize:13,color:'#64748b'}}>{r.email||'—'}</td>
                <td style={{padding:'12px 14px',fontSize:13,color:'#cbd5e1'}}>{r.service||'—'}</td>
                <td style={{padding:'12px 14px'}}>
                  <span style={{background:sc(r.status).bg,color:sc(r.status).color,padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:700}}>{r.status}</span>
                </td>
                <td style={{padding:'12px 14px',fontSize:12,color:'#64748b'}}>{new Date(r.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                <td style={{padding:'12px 14px'}}>
                  <button onClick={()=>navigate('/quotes',{state:{openCreate:true,clientName:r.client_name}})} style={{background:'rgba(74,222,128,0.1)',color:'#4ade80',border:'1px solid rgba(74,222,128,0.2)',borderRadius:6,padding:'4px 10px',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>→ Quote</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Request Modal */}
      {showNew && (
        <>
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:500}} onClick={()=>setShowNew(false)} />
          <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:500,maxHeight:'90vh',overflowY:'auto',background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:501,padding:24}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
              <h2 style={{margin:0,fontSize:17,fontWeight:700,color:'#f1f5f9'}}>📬 New Request</h2>
              <button onClick={()=>setShowNew(false)} style={{background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer'}}>×</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              <div style={{gridColumn:'1/-1'}}><label style={lbl}>Client Name *</label><input style={inp} value={form.client_name} onChange={e=>setForm({...form,client_name:e.target.value})} placeholder="Full name or company" /></div>
              <div><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="(561) 000-0000" /></div>
              <div><label style={lbl}>Email</label><input style={inp} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email@example.com" /></div>
              <div style={{gridColumn:'1/-1'}}><label style={lbl}>Service Requested</label>
                <select style={inp} value={form.service} onChange={e=>setForm({...form,service:e.target.value})}>
                  <option value="">— Select service —</option>
                  {['Lawn Mowing','Irrigation','Pest Control','Tree Trimming','Landscape','Yard Clean Up','Free Assessment','Other'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Status</label>
                <select style={inp} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                  <option>New</option><option>In Progress</option><option>Completed</option>
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}><label style={lbl}>Notes</label><textarea style={{...inp,height:80,resize:'vertical'} as React.CSSProperties} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Additional details..." /></div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowNew(false)} style={{padding:'10px 20px',border:'1px solid #1e293b',borderRadius:9,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>Cancel</button>
              <button onClick={handleSave} style={{padding:'10px 20px',border:'none',borderRadius:9,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>Save Request</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
