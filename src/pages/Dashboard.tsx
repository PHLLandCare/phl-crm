import { useEffect, useState } from 'react'
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

export default function Dashboard() {
  const [page, setPage] = useState('dashboard')
  const [counts, setCounts] = useState({clients:0,requests:0,quotes:0,jobs:0,invoices:0})
  const [userName, setUserName] = useState('')
  const [userInitials, setUserInitials] = useState('')
  const [recentClients, setRecentClients] = useState<any[]>([])

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).single()
        if (profile?.full_name) {
          setUserName(profile.full_name)
          setUserInitials(profile.full_name.split(' ').map((n:string)=>n[0]).slice(0,2).join('').toUpperCase())
        }
      }
      const [c,q,j,i,rc] = await Promise.all([
        supabase.from('clients').select('*',{count:'exact',head:true}).is('deleted_at',null),
        supabase.from('quotes').select('*',{count:'exact',head:true}).is('deleted_at',null),
        supabase.from('jobs').select('*',{count:'exact',head:true}).is('deleted_at',null),
        supabase.from('invoices').select('*',{count:'exact',head:true}).is('deleted_at',null),
        supabase.from('clients').select('first_name,last_name,division,status').is('deleted_at',null).order('created_at',{ascending:false}).limit(5),
      ])
      setCounts({clients:c.count??0,requests:0,quotes:q.count??0,jobs:j.count??0,invoices:i.count??0})
      setRecentClients(rc.data??[])
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

  const NavItem = ({label,id,count}:{label:string,id:string,count?:number}) => (
    <button onClick={()=>setPage(id)} style={{
      width:'100%',textAlign:'left',padding:'9px 20px',
      background:page===id?'rgba(22,163,74,0.15)':'transparent',
      border:'none',borderLeft:page===id?'3px solid #4ade80':'3px solid transparent',
      cursor:'pointer',fontSize:13.5,
      color:page===id?'#fff':'#94a3b8',
      display:'flex',alignItems:'center',justifyContent:'space-between',
      fontWeight:page===id?600:400,fontFamily:'inherit',
    }}>
      <span>{label}</span>
      {count!==undefined && <span style={{fontSize:11,background:'rgba(255,255,255,0.12)',padding:'1px 8px',borderRadius:20,color:'#cbd5e1'}}>{count}</span>}
    </button>
  )

  const SectionLabel = ({title}:{title:string}) => (
    <p style={{fontSize:10.5,fontWeight:700,color:'#475569',textTransform:'uppercase',letterSpacing:'0.08em',margin:'20px 20px 6px',fontFamily:'inherit'}}>{title}</p>
  )

  const statusColor: Record<string,string> = {
    active:'#dcfce7', lead:'#fef9c3', inactive:'#f3f4f6', overdue:'#fef2f2'
  }

  const renderPage = () => {
    switch(page) {
      case 'clients': return <ClientsPage />
      case 'jobs': return <JobsPage />
      case 'invoices': return <InvoicesPage />
      case 'quotes': return <QuotesPage />
      case 'schedule': return <SchedulePage />
      case 'payroll': return <PayrollPage />
      case 'expenses': return <ExpensesPage />
      case 'inventory': return <InventoryPage />
      case 'team': return <TeamPage />
      case 'settings': return <SettingsPage />
      default: return (
        <div style={{padding:'2rem'}}>

          {/* Header */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem'}}>
            <h1 style={{fontSize:22,fontWeight:700,color:'#0f172a',margin:0}}>Dashboard</h1>
            <button style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,padding:'7px 14px',fontSize:13,cursor:'pointer',color:'#475569',display:'flex',alignItems:'center',gap:6}}>
              🔄 Refresh
            </button>
          </div>

          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:'1.5rem'}}>
            {[
              {label:'Clients',value:counts.clients,bg:'#eff6ff',border:'#bfdbfe',color:'#1d4ed8',click:'clients'},
              {label:'Open requests',value:counts.requests,bg:'#fefce8',border:'#fde68a',color:'#b45309',click:''},
              {label:'Active jobs',value:counts.jobs,bg:'#f0fdf4',border:'#bbf7d0',color:'#15803d',click:'jobs'},
              {label:'Unpaid invoices',value:counts.invoices,bg:'#fef2f2',border:'#fecaca',color:'#dc2626',click:'invoices'},
            ].map(s=>(
              <div key={s.label} onClick={()=>s.click&&setPage(s.click)} style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:14,padding:'1.25rem 1.5rem',cursor:s.click?'pointer':'default',transition:'transform 0.1s'}}>
                <p style={{fontSize:12,color:'#64748b',margin:'0 0 8px',fontWeight:500}}>{s.label}</p>
                <p style={{fontSize:32,fontWeight:800,color:s.color,margin:0,lineHeight:1}}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Recent clients + Revenue */}
          <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:14,marginBottom:14}}>

            {/* Recent clients */}
            <div style={{background:'#fff',borderRadius:14,border:'1px solid #e2e8f0',overflow:'hidden'}}>
              <div style={{padding:'14px 18px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:14,fontWeight:600,color:'#0f172a'}}>Recent clients</span>
                <button onClick={()=>setPage('clients')} style={{fontSize:12,color:'#16a34a',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>View all →</button>
              </div>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'#f8fafc'}}>
                    {['Client','Division','Status'].map(h=>(
                      <th key={h} style={{padding:'9px 18px',textAlign:'left',fontSize:11,fontWeight:600,color:'#64748b',borderBottom:'1px solid #f1f5f9'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentClients.length===0 ? (
                    <tr><td colSpan={3} style={{padding:'2rem',textAlign:'center',color:'#94a3b8',fontSize:13}}>No clients yet</td></tr>
                  ) : recentClients.map((c,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid #f8fafc'}}>
                      <td style={{padding:'10px 18px',fontSize:13,fontWeight:500,color:'#0f172a'}}>{c.first_name} {c.last_name}</td>
                      <td style={{padding:'10px 18px',fontSize:13,color:'#64748b'}}>{c.division||'—'}</td>
                      <td style={{padding:'10px 18px'}}>
                        <span style={{background:statusColor[c.status]||'#f3f4f6',padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>{c.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Revenue by division */}
            <div style={{background:'#fff',borderRadius:14,border:'1px solid #e2e8f0',padding:'1.25rem'}}>
              <p style={{fontSize:14,fontWeight:600,color:'#0f172a',margin:'0 0 1rem'}}>Revenue by division</p>
              {['Lawn & Tree','Irrigation','Extermination','Nursery','Farm'].map(d=>(
                <div key={d} style={{marginBottom:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontSize:13,color:'#374151'}}>{d}</span>
                    <span style={{fontSize:13,color:'#6b7280',fontWeight:500}}>$0</span>
                  </div>
                  <div style={{height:6,background:'#f1f5f9',borderRadius:3}}>
                    <div style={{width:'0%',height:'100%',background:'#16a34a',borderRadius:3}} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent activity */}
          <div style={{background:'#fff',borderRadius:14,border:'1px solid #e2e8f0',padding:'1.25rem'}}>
            <p style={{fontSize:14,fontWeight:600,color:'#0f172a',margin:'0 0 1rem'}}>Recent activity</p>
            <p style={{fontSize:13,color:'#94a3b8',textAlign:'center',padding:'1rem 0',margin:0}}>No recent activity yet</p>
          </div>
        </div>
      )
    }
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',background:'#f8fafc'}}>

      {/* ── Sidebar ── */}
      <div style={{
        width:230,flexShrink:0,
        background:'#0f172a',
        display:'flex',flexDirection:'column',
        position:'fixed',top:0,left:0,
        height:'100vh',overflowY:'auto',
        zIndex:200,
      }}>
        {/* Logo */}
        <div style={{padding:'14px 16px',borderBottom:'1px solid rgba(255,255,255,0.08)',display:'flex',alignItems:'center',gap:10}}>
          <img src="https://phllandcare.github.io/phl-crm/phl_logo.jpg" alt="PHL" style={{width:38,height:38,borderRadius:8,objectFit:'cover',flexShrink:0}} />
          <div>
            <p style={{margin:0,fontSize:13,fontWeight:700,color:'#fff',lineHeight:1.2}}>PHL Land Care</p>
            <p style={{margin:0,fontSize:11,color:'#64748b'}}>Field Service CRM</p>
          </div>
        </div>

        {/* User */}
        <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(255,255,255,0.08)',display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,borderRadius:'50%',background:'#16a34a',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',flexShrink:0}}>{userInitials||'?'}</div>
          <p style={{margin:0,fontSize:13,fontWeight:500,color:'#e2e8f0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{userName||'User'}</p>
        </div>

        {/* Navigation */}
        <div style={{flex:1,paddingTop:8}}>
          <SectionLabel title="Main" />
          <NavItem label="Dashboard" id="dashboard" />
          <NavItem label="Clients" id="clients" count={counts.clients} />
          <NavItem label="Requests" id="requests" count={counts.requests} />
          <NavItem label="Quotes" id="quotes" count={counts.quotes} />
          <NavItem label="Jobs" id="jobs" count={counts.jobs} />
          <NavItem label="Invoices" id="invoices" count={counts.invoices} />

          <SectionLabel title="More" />
          <NavItem label="Schedule" id="schedule" />
          <NavItem label="Team Chat" id="chat" />

          <SectionLabel title="Divisions" />
          <NavItem label="Lawn & Tree" id="lawn" />
          <NavItem label="Irrigation" id="irrigation" />
          <NavItem label="Extermination" id="extermination" />
          <NavItem label="Nursery" id="nursery" />
          <NavItem label="Farm" id="farm" />

          <SectionLabel title="Tools" />
          <NavItem label="Time Clock" id="timeclock" />
          <NavItem label="Payroll" id="payroll" />
          <NavItem label="All Employees" id="team" />
          <NavItem label="Expenses" id="expenses" />
          <NavItem label="Inventory" id="inventory" />
          <NavItem label="Reports" id="reports" />
          <NavItem label="Settings" id="settings" />
        </div>

        {/* Sign out */}
        <div style={{padding:'12px 16px',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
          <button onClick={handleSignOut} style={{width:'100%',background:'rgba(255,255,255,0.06)',color:'#94a3b8',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px',fontSize:13,cursor:'pointer',fontFamily:'inherit',transition:'background 0.15s'}}>
            Sign out
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{flex:1,marginLeft:230,minHeight:'100vh',background:'#f8fafc'}}>
        {renderPage()}
      </div>
    </div>
  )
}