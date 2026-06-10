import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

type Tab = 'overview' | 'revenue' | 'labor' | 'expenses' | 'jobs' | 'tags'
type Range = '7d' | '30d' | '90d' | 'ytd'

const DIVS = ['All Divisions','Lawn & Tree','Irrigation','Extermination','Nursery','Farm','Hardscape']

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('overview')
  const [range, setRange] = useState<Range>('30d')
  const [division, setDivision] = useState('All Divisions')
  const [stats, setStats] = useState({ revenue: 0, receivables: 0, expenses: 0, jobs: 0, clients: 0, labor: 0 })
  const [invoices, setInvoices] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [clockEvents, setClockEvents] = useState<any[]>([])
  // Tags report state
  const [allClients, setAllClients] = useState<any[]>([])
  const [allJobsForTags, setAllJobsForTags] = useState<any[]>([])
  const [allInvoicesForTags, setAllInvoicesForTags] = useState<any[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagSearch, setTagSearch] = useState('')
  const [tagLogic, setTagLogic] = useState<'AND'|'OR'>('OR')
  const [tagSubTab, setTagSubTab] = useState<'clients'|'jobs'|'invoices'>('clients')

  useEffect(() => {
    const load = async () => {
      const now = new Date()
      const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : Math.floor((now.getTime() - new Date(now.getFullYear(),0,1).getTime()) / 86400000)
      const since = new Date(now.getTime() - days * 86400000).toISOString()

      const [invRes, jobRes, expRes, clientRes, clockRes] = await Promise.all([
        supabase.from('invoices').select('*').gte('created_at', since),
        supabase.from('jobs').select('*').gte('created_at', since),
        supabase.from('expenses').select('*').gte('created_at', since),
        supabase.from('clients').select('id', {count:'exact',head:true}).is('deleted_at',null),
        supabase.from('clock_events').select('*').gte('clock_in', since),
      ])

      const invData = invRes.data ?? []
      const jobData = jobRes.data ?? []
      const expData = expRes.data ?? []

      const filteredInv = division === 'All Divisions' ? invData : invData.filter(i => i.division === division)
      const filteredJob = division === 'All Divisions' ? jobData : jobData.filter(j => j.division === division)

      const clockData = clockRes.data ?? []
      setInvoices(filteredInv)
      setJobs(filteredJob)
      setExpenses(expData)
      setClockEvents(clockData)
      setStats({
        revenue: filteredInv.filter(i=>i.status==='paid').reduce((a,i)=>a+(i.amount||0),0),
        receivables: filteredInv.filter(i=>i.status==='sent'||i.status==='overdue').reduce((a,i)=>a+(i.amount||0),0),
        expenses: expData.reduce((a,e)=>a+(e.amount||0),0),
        jobs: filteredJob.length,
        clients: clientRes.count ?? 0,
        labor: (clockRes.data ?? []).reduce((a:number,c:any)=>{ if(c.clock_in&&c.clock_out){ const h=(new Date(c.clock_out).getTime()-new Date(c.clock_in).getTime())/3600000; return a+h } return a },0),
      })
    }
    load()
  }, [range, division])

  // Load all clients, jobs, invoices for tag report
  useEffect(() => {
    supabase.from('clients').select('id,first_name,last_name,company,tags,status,divisions,email,phone,created_at').is('deleted_at',null)
      .then(({ data }) => setAllClients(data ?? []))
    supabase.from('jobs').select('id,title,client_name,client_id,status,total_amount,division,created_at,scheduled_start').is('deleted_at',null)
      .then(({ data }) => setAllJobsForTags(data ?? []))
    supabase.from('invoices').select('id,invoice_number,client_name,client_id,status,amount,created_at').is('deleted_at',null)
      .then(({ data }) => setAllInvoicesForTags(data ?? []))
  }, [])

  const fmt = (n:number) => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toFixed(0)}`

  const tabs: {id:Tab, label:string}[] = [
    {id:'overview',label:'Overview'},
    {id:'revenue',label:'Revenue'},
    {id:'labor',label:'Labor'},
    {id:'expenses',label:'Expenses'},
    {id:'jobs',label:'Jobs'},
    {id:'tags',label:'🏷️ Tag Report'},
  ]

  return (
    <div style={{padding:'2rem',maxWidth:1200,margin:'0 auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',background:'#0a0f1a',minHeight:'100vh'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'#f1f5f9',margin:'0 0 4px'}}>Reports</h1>
          <p style={{fontSize:14,color:'#64748b',margin:0}}>Business performance & analytics</p>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <button onClick={()=>{
            const rows = [['Type','Date','Client','Amount','Status']]
            invoices.forEach(i=>rows.push(['Invoice',i.created_at?.slice(0,10)||'',i.client_name||'',String(i.amount||0),i.status||'']))
            expenses.forEach(e=>rows.push(['Expense',e.created_at?.slice(0,10)||'',e.description||'',String(e.amount||0),e.category||'']))
            jobs.forEach(j=>rows.push(['Job',j.created_at?.slice(0,10)||'',j.client_name||j.title||'',String(j.amount||0),j.status||'']))
            const csv=rows.map(r=>r.join(',')).join('\n')
            const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='phl_report.csv';a.click()
          }} style={{padding:'8px 14px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9',cursor:'pointer',fontSize:13,fontFamily:'inherit',fontWeight:600}}>
            📥 Export CSV
          </button>
          <select value={division} onChange={e=>setDivision(e.target.value)} style={{padding:'8px 12px',background:'#0f172a',border:'1px solid #1e293b',borderRadius:8,color:'#f1f5f9',fontSize:13,fontFamily:'inherit',cursor:'pointer'}}>
            {DIVS.map(d=><option key={d}>{d}</option>)}
          </select>
          <div style={{display:'flex',background:'#0f172a',borderRadius:8,border:'1px solid #1e293b',overflow:'hidden'}}>
            {(['7d','30d','90d','ytd'] as Range[]).map(r=>(
              <button key={r} onClick={()=>setRange(r)} style={{padding:'8px 14px',border:'none',background:range===r?'#16a34a':'transparent',color:range===r?'#fff':'#64748b',cursor:'pointer',fontSize:13,fontWeight:range===r?600:400,fontFamily:'inherit'}}>
                {r === 'ytd' ? 'YTD' : r.replace('d',' days')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:'1.5rem',borderBottom:'1px solid #1e293b',paddingBottom:0}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'10px 20px',border:'none',background:'transparent',color:tab===t.id?'#4ade80':'#64748b',fontWeight:tab===t.id?700:400,fontSize:14,cursor:'pointer',fontFamily:'inherit',borderBottom:tab===t.id?'2px solid #4ade80':'2px solid transparent',marginBottom:-1}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:'1.5rem'}}>
        {[
          {label:'Revenue',value:fmt(stats.revenue),sub:'Paid invoices',color:'#4ade80'},
          {label:'Receivables',value:fmt(stats.receivables),sub:'Outstanding',color:'#fbbf24'},
          {label:'Expenses',value:fmt(stats.expenses),sub:'Total spend',color:'#f87171'},
          {label:'Net',value:fmt(stats.revenue-stats.expenses),sub:'Revenue - Expenses',color:'#60a5fa'},
          {label:'Jobs',value:String(stats.jobs),sub:'Completed',color:'#a78bfa'},
          {label:'Active Clients',value:String(stats.clients),sub:'Total in CRM',color:'#34d399'},
          {label:'Labor Hours',value:stats.labor.toFixed(1)+'h',sub:'Total clocked in',color:'#fb923c'},
        ].map(s=>(
          <div key={s.label} style={{background:'#0f172a',borderRadius:12,padding:'1.1rem 1rem',border:'1px solid #1e293b',borderTop:`3px solid ${s.color}`,minHeight:90}}>
            <p style={{margin:'0 0 4px',fontSize:12,color:'#64748b'}}>{s.label}</p>
            <p style={{margin:'0 0 2px',fontSize:22,fontWeight:800,color:s.color}}>{s.value}</p>
            <p style={{margin:0,fontSize:11,color:'#475569'}}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>

          {/* P&L Summary */}
          <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',padding:'1.25rem'}}>
            <p style={{margin:'0 0 1rem',fontSize:15,fontWeight:700,color:'#f1f5f9'}}>Profit & Loss Summary <span style={{fontSize:12,color:'#64748b',fontWeight:400}}>— {range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : range === '90d' ? 'Last 90 days' : 'Year to date'}</span></p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,marginBottom:16}}>
              {[
                {label:'Revenue',     value:stats.revenue,                          color:'#4ade80',  sign:'+'},
                {label:'Receivables', value:stats.receivables,                       color:'#fbbf24',  sign:''},
                {label:'Expenses',    value:stats.expenses,                          color:'#f87171',  sign:'-'},
                {label:'Labor Cost',  value:stats.labor * 15,                        color:'#f87171',  sign:'-', note:'est. @$15/hr'},
                {label:'Gross Profit',value:stats.revenue - stats.expenses - (stats.labor*15), color: (stats.revenue - stats.expenses - stats.labor*15) >= 0 ? '#4ade80' : '#f87171', sign:''},
                {label:'Jobs',        value:stats.jobs,                              color:'#60a5fa',  sign:'', isCnt:true},
              ].map(s=>(
                <div key={s.label} style={{background:'#0a0f1a',borderRadius:10,padding:'12px 14px',borderTop:`3px solid ${s.color}`}}>
                  <p style={{margin:'0 0 2px',fontSize:10,fontWeight:700,color:'#475569',textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>{s.label}</p>
                  {(s as any).note && <p style={{margin:'0 0 4px',fontSize:9,color:'#334155'}}>{(s as any).note}</p>}
                  <p style={{margin:0,fontSize:18,fontWeight:800,color:s.color}}>
                    {(s as any).isCnt ? s.value : `${s.sign}${fmt(Math.abs(s.value))}`}
                  </p>
                </div>
              ))}
            </div>
            {/* Profit bar */}
            {stats.revenue > 0 && (() => {
              const costs = stats.expenses + stats.labor * 15
              const profitPct = Math.max(0, Math.min(100, ((stats.revenue - costs) / stats.revenue) * 100))
              const expPct = Math.min(100, (costs / stats.revenue) * 100)
              return (
                <div>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontSize:11,color:'#64748b'}}>Profit margin</span>
                    <span style={{fontSize:12,fontWeight:700,color: profitPct >= 20 ? '#4ade80' : '#fbbf24'}}>{profitPct.toFixed(1)}%</span>
                  </div>
                  <div style={{height:8,background:'#1e293b',borderRadius:99,overflow:'hidden',display:'flex'}}>
                    <div style={{width:`${expPct}%`,background:'#f87171',transition:'width .4s'}} />
                    <div style={{width:`${profitPct}%`,background:'#4ade80',transition:'width .4s'}} />
                  </div>
                  <div style={{display:'flex',gap:16,marginTop:6}}>
                    <span style={{fontSize:10,color:'#f87171'}}>■ Costs {fmt(costs)}</span>
                    <span style={{fontSize:10,color:'#4ade80'}}>■ Profit {fmt(Math.max(0,stats.revenue-costs))}</span>
                  </div>
                </div>
              )
            })()}
          </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          {/* Invoice status pie chart */}
          <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',padding:'1.25rem'}}>
            <p style={{margin:'0 0 1rem',fontSize:15,fontWeight:600,color:'#f1f5f9'}}>Invoice Status</p>
            {(() => {
              const data = [
                {name:'Paid', value:invoices.filter(i=>i.status==='paid').reduce((a,i)=>a+(i.amount||0),0), color:'#4ade80'},
                {name:'Awaiting', value:invoices.filter(i=>i.status==='sent').reduce((a,i)=>a+(i.amount||0),0), color:'#fbbf24'},
                {name:'Overdue', value:invoices.filter(i=>i.status==='overdue').reduce((a,i)=>a+(i.amount||0),0), color:'#f87171'},
                {name:'Draft', value:invoices.filter(i=>i.status==='draft').reduce((a,i)=>a+(i.amount||0),0), color:'#64748b'},
              ].filter(d=>d.value>0)
              return data.length === 0 ? (
                <p style={{color:'#475569',fontSize:13,textAlign:'center',padding:'2rem'}}>No invoice data yet</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                        {data.map((entry,i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v:any) => fmt(Number(v))} contentStyle={{background:'#0d1526',border:'1px solid #1e293b',borderRadius:8,color:'#f1f5f9'}} />
                      <Legend formatter={(v) => <span style={{color:'#94a3b8',fontSize:12}}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                  {data.map(d => (
                    <div key={d.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #0d1526'}}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:d.color}} />
                        <span style={{fontSize:12,color:'#94a3b8'}}>{d.name} ({invoices.filter(i=>i.status===(d.name==='Awaiting'?'sent':d.name.toLowerCase())).length})</span>
                      </div>
                      <span style={{fontSize:13,fontWeight:600,color:d.color}}>{fmt(d.value)}</span>
                    </div>
                  ))}
                </>
              )
            })()}
          </div>

          {/* Jobs status bar chart */}
          <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',padding:'1.25rem'}}>
            <p style={{margin:'0 0 1rem',fontSize:15,fontWeight:600,color:'#f1f5f9'}}>Jobs by Status</p>
            {(() => {
              const data = [
                {name:'Completed', count:jobs.filter(j=>j.status==='completed').length, fill:'#4ade80'},
                {name:'In Progress', count:jobs.filter(j=>j.status==='in_progress').length, fill:'#60a5fa'},
                {name:'Scheduled', count:jobs.filter(j=>j.status==='scheduled').length, fill:'#fbbf24'},
                {name:'Cancelled', count:jobs.filter(j=>j.status==='cancelled').length, fill:'#f87171'},
              ].filter(d=>d.count>0)
              return data.length === 0 ? (
                <p style={{color:'#475569',fontSize:13,textAlign:'center',padding:'2rem'}}>No job data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data} margin={{top:5,right:10,left:-20,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:11}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fill:'#64748b',fontSize:11}} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{background:'#0d1526',border:'1px solid #1e293b',borderRadius:8,color:'#f1f5f9'}} cursor={{fill:'rgba(255,255,255,0.04)'}} />
                    <Bar dataKey="count" radius={[6,6,0,0]}>
                      {data.map((entry,i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            })()}
          </div>

          {/* Revenue by Division bar chart */}
          <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',padding:'1.25rem',gridColumn:'1/-1'}}>
            <p style={{margin:'0 0 1rem',fontSize:15,fontWeight:600,color:'#f1f5f9'}}>Revenue by Division</p>
            {(() => {
              const divColors: Record<string,string> = {'Lawn & Tree':'#4ade80','Irrigation':'#60a5fa','Extermination':'#f59e0b','Nursery':'#a78bfa','Farm':'#fb923c','Hardscape':'#94a3b8'}
              const data = ['Lawn & Tree','Irrigation','Extermination','Nursery','Farm','Hardscape'].map(div => ({
                name: div,
                revenue: invoices.filter((i:any)=>i.division===div&&i.status==='paid').reduce((a:number,i:any)=>a+(i.amount||0),0),
                jobs: jobs.filter((j:any)=>j.division===div).length,
                fill: divColors[div]
              })).filter(d => d.jobs > 0 || d.revenue > 0)
              return data.length === 0 ? (
                <p style={{color:'#475569',fontSize:13}}>No division data yet — set division on jobs and invoices to see breakdown</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data} margin={{top:5,right:20,left:0,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:11}} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{fill:'#64748b',fontSize:11}} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v:any) => fmt(Number(v))} contentStyle={{background:'#0d1526',border:'1px solid #1e293b',borderRadius:8,color:'#f1f5f9'}} cursor={{fill:'rgba(255,255,255,0.04)'}} />
                    <Bar dataKey="revenue" radius={[6,6,0,0]}>
                      {data.map((entry,i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            })()}
          </div>
        </div>
        </div>
      )}

      {tab === 'revenue' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {/* Revenue trend line chart */}
          <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',padding:'1.25rem'}}>
            <p style={{margin:'0 0 1rem',fontSize:15,fontWeight:600,color:'#f1f5f9'}}>Revenue Trend</p>
            {(() => {
              // Build daily revenue data from paid invoices
              const byDay: Record<string,{date:string,revenue:number,invoiced:number}> = {}
              invoices.forEach((inv:any) => {
                const d = inv.created_at?.slice(0,10)
                if (!d) return
                if (!byDay[d]) byDay[d] = {date:d, revenue:0, invoiced:0}
                byDay[d].invoiced += inv.amount||0
                if (inv.status==='paid') byDay[d].revenue += inv.amount||0
              })
              const data = Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date)).slice(-30).map(d=>({
                ...d, date: new Date(d.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})
              }))
              return data.length < 2 ? (
                <p style={{color:'#475569',fontSize:13,textAlign:'center',padding:'2rem'}}>Not enough data — invoices will appear here once recorded</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data} margin={{top:5,right:20,left:0,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={{fill:'#64748b',fontSize:11}} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{fill:'#64748b',fontSize:11}} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v:any) => fmt(Number(v))} contentStyle={{background:'#0d1526',border:'1px solid #1e293b',borderRadius:8,color:'#f1f5f9'}} />
                    <Legend formatter={(v) => <span style={{color:'#94a3b8',fontSize:12}}>{v}</span>} />
                    <Line type="monotone" dataKey="invoiced" stroke="#60a5fa" strokeWidth={2} dot={false} name="Invoiced" />
                    <Line type="monotone" dataKey="revenue" stroke="#4ade80" strokeWidth={2} dot={false} name="Collected" />
                  </LineChart>
                </ResponsiveContainer>
              )
            })()}
          </div>
          <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',overflow:'hidden'}}>
            <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid #1e293b'}}>
              <p style={{margin:0,fontSize:15,fontWeight:600,color:'#f1f5f9'}}>Invoice History</p>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'#0a0f1a'}}>
                  {['Invoice #','Client','Amount','Status','Date'].map(h=>(
                    <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:'#475569',borderBottom:'1px solid #1e293b'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan={5} style={{padding:'2rem',textAlign:'center',color:'#475569',fontSize:13}}>No invoices in this period</td></tr>
                ) : invoices.slice(0,50).map((inv,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid #1e293b'}}>
                    <td style={{padding:'10px 16px',fontSize:13,color:'#f1f5f9'}}>{inv.invoice_number||'—'}</td>
                    <td style={{padding:'10px 16px',fontSize:13,color:'#cbd5e1'}}>{inv.client_name||inv.client||'—'}</td>
                    <td style={{padding:'10px 16px',fontSize:13,fontWeight:600,color:'#4ade80'}}>${(inv.amount||0).toLocaleString()}</td>
                    <td style={{padding:'10px 16px'}}>
                      <span style={{background:inv.status==='paid'?'rgba(74,222,128,0.15)':inv.status==='overdue'?'rgba(248,113,113,0.15)':'rgba(251,191,36,0.15)',color:inv.status==='paid'?'#4ade80':inv.status==='overdue'?'#f87171':'#fbbf24',padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>{inv.status}</span>
                    </td>
                    <td style={{padding:'10px 16px',fontSize:13,color:'#64748b'}}>{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'expenses' && (
        <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',overflow:'hidden'}}>
          <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid #1e293b'}}>
            <p style={{margin:0,fontSize:15,fontWeight:600,color:'#f1f5f9'}}>Expense History</p>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'#0a0f1a'}}>
                {['Category','Description','Amount','Date','Approved By'].map(h=>(
                  <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:'#475569',borderBottom:'1px solid #1e293b'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr><td colSpan={5} style={{padding:'2rem',textAlign:'center',color:'#475569',fontSize:13}}>No expenses in this period</td></tr>
              ) : expenses.slice(0,50).map((exp,i)=>(
                <tr key={i} style={{borderBottom:'1px solid #1e293b'}}>
                  <td style={{padding:'10px 16px',fontSize:13,color:'#f1f5f9'}}>{exp.category||'—'}</td>
                  <td style={{padding:'10px 16px',fontSize:13,color:'#cbd5e1'}}>{exp.description||'—'}</td>
                  <td style={{padding:'10px 16px',fontSize:13,fontWeight:600,color:'#f87171'}}>${(exp.amount||0).toLocaleString()}</td>
                  <td style={{padding:'10px 16px',fontSize:13,color:'#64748b'}}>{exp.created_at ? new Date(exp.created_at).toLocaleDateString() : '—'}</td>
                  <td style={{padding:'10px 16px',fontSize:13,color:'#64748b'}}>{exp.approved_by||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'jobs' && (
        <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',overflow:'hidden'}}>
          <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid #1e293b'}}>
            <p style={{margin:0,fontSize:15,fontWeight:600,color:'#f1f5f9'}}>Job History</p>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'#0a0f1a'}}>
                {['Job Title','Client','Division','Status','Value','Date'].map(h=>(
                  <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:'#475569',borderBottom:'1px solid #1e293b'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr><td colSpan={6} style={{padding:'2rem',textAlign:'center',color:'#475569',fontSize:13}}>No jobs in this period</td></tr>
              ) : jobs.slice(0,50).map((job,i)=>(
                <tr key={i} style={{borderBottom:'1px solid #1e293b'}}>
                  <td style={{padding:'10px 16px',fontSize:13,color:'#f1f5f9'}}>{job.title||'—'}</td>
                  <td style={{padding:'10px 16px',fontSize:13,color:'#cbd5e1'}}>{job.client_name||'—'}</td>
                  <td style={{padding:'10px 16px',fontSize:13,color:'#64748b'}}>{job.division||'—'}</td>
                  <td style={{padding:'10px 16px'}}>
                    <span style={{background:job.status==='completed'?'rgba(74,222,128,0.15)':'rgba(100,116,139,0.15)',color:job.status==='completed'?'#4ade80':'#94a3b8',padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:600}}>{job.status}</span>
                  </td>
                  <td style={{padding:'10px 16px',fontSize:13,fontWeight:600,color:'#f1f5f9'}}>${(job.amount||0).toLocaleString()}</td>
                  <td style={{padding:'10px 16px',fontSize:13,color:'#64748b'}}>{job.created_at ? new Date(job.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'labor' && (
        <div>
          {/* Labor by employee */}
          <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',overflow:'hidden',marginBottom:16}}>
            <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid #1e293b',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <p style={{margin:0,fontSize:15,fontWeight:600,color:'#f1f5f9'}}>Hours by Employee</p>
              <p style={{margin:0,fontSize:13,color:'#64748b'}}>Total: {stats.labor.toFixed(1)}h clocked</p>
            </div>
            {clockEvents.length === 0 ? (
              <div style={{padding:'2rem',textAlign:'center',color:'#475569',fontSize:13}}>No clock events in this period</div>
            ) : (() => {
              const byEmp: Record<string,{name:string;hours:number;events:number}> = {}
              clockEvents.forEach((c:any) => {
                const k = c.employee_name || c.employee_id || 'Unknown'
                if (!byEmp[k]) byEmp[k] = {name:k, hours:0, events:0}
                byEmp[k].events++
                if (c.clock_in && c.clock_out) {
                  byEmp[k].hours += (new Date(c.clock_out).getTime()-new Date(c.clock_in).getTime())/3600000
                }
              })
              const sorted = Object.values(byEmp).sort((a,b)=>b.hours-a.hours)
              const maxH = sorted[0]?.hours || 1
              return (
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr style={{background:'#0a0f1a'}}>{['Employee','Events','Hours','% of Total'].map(h=><th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:'#475569',borderBottom:'1px solid #1e293b'}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {sorted.map((emp,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid #1e293b'}}>
                        <td style={{padding:'12px 16px',fontSize:14,fontWeight:600,color:'#f1f5f9'}}>{emp.name}</td>
                        <td style={{padding:'12px 16px',fontSize:13,color:'#64748b'}}>{emp.events}</td>
                        <td style={{padding:'12px 16px',fontSize:14,fontWeight:700,color:'#fb923c'}}>{emp.hours.toFixed(1)}h</td>
                        <td style={{padding:'12px 16px',minWidth:160}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div style={{flex:1,height:8,background:'#1e293b',borderRadius:4,overflow:'hidden'}}>
                              <div style={{height:'100%',background:'#fb923c',borderRadius:4,width:`${(emp.hours/maxH)*100}%`,transition:'width .3s'}} />
                            </div>
                            <span style={{fontSize:11,color:'#64748b',minWidth:32}}>{((emp.hours/stats.labor)*100).toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}
          </div>
          {/* Clock events table */}
          <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',overflow:'hidden'}}>
            <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid #1e293b'}}><p style={{margin:0,fontSize:15,fontWeight:600,color:'#f1f5f9'}}>Clock Event Log</p></div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'#0a0f1a'}}>{['Employee','Clock In','Clock Out','Hours','Division'].map(h=><th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:'#475569',borderBottom:'1px solid #1e293b'}}>{h}</th>)}</tr></thead>
              <tbody>
                {clockEvents.slice(0,50).map((c:any,i:number)=>{
                  const hours = c.clock_in&&c.clock_out ? ((new Date(c.clock_out).getTime()-new Date(c.clock_in).getTime())/3600000).toFixed(1) : '—'
                  return (
                    <tr key={i} style={{borderBottom:'1px solid #1e293b'}}>
                      <td style={{padding:'10px 16px',fontSize:13,color:'#f1f5f9',fontWeight:600}}>{c.employee_name||c.employee_id||'—'}</td>
                      <td style={{padding:'10px 16px',fontSize:12,color:'#64748b'}}>{c.clock_in?new Date(c.clock_in).toLocaleString():'—'}</td>
                      <td style={{padding:'10px 16px',fontSize:12,color:'#64748b'}}>{c.clock_out?new Date(c.clock_out).toLocaleString():'—'}</td>
                      <td style={{padding:'10px 16px',fontSize:13,fontWeight:700,color:'#fb923c'}}>{hours === '—' ? hours : hours+'h'}</td>
                      <td style={{padding:'10px 16px',fontSize:12,color:'#64748b'}}>{c.division||'—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {tab === 'tags' && (() => {
        // Gather all unique tags from clients
        const allTags = Array.from(new Set(
          allClients.flatMap(c => (c.tags||'').split(',').map((t:string)=>t.trim()).filter(Boolean))
        )).sort()

        // Tagged clients
        const taggedClients = selectedTags.length === 0 ? allClients : allClients.filter(c => {
          const ct = (c.tags||'').split(',').map((t:string)=>t.trim()).filter(Boolean)
          return tagLogic === 'AND' ? selectedTags.every(t=>ct.includes(t)) : selectedTags.some(t=>ct.includes(t))
        })

        // Tagged jobs — match via client name
        const taggedClientNames = new Set(taggedClients.map((c:any)=>`${c.first_name} ${c.last_name}`))
        const taggedJobs = selectedTags.length === 0 ? allJobsForTags : allJobsForTags.filter(j => taggedClientNames.has(j.client_name))
        const taggedInvoices = selectedTags.length === 0 ? allInvoicesForTags : allInvoicesForTags.filter(i => taggedClientNames.has(i.client_name))

        const exportAll = () => {
          const rows = [['Type','Name/Number','Client','Status','Amount/Division','Date']]
          taggedClients.forEach(c=>rows.push(['Client',`${c.first_name} ${c.last_name}`,c.company||'',c.status||'',c.divisions||'',c.created_at?.slice(0,10)||'']))
          taggedJobs.forEach(j=>rows.push(['Job',j.title||'',j.client_name||'',j.status||'',String(j.total_amount||0),j.scheduled_start?.slice(0,10)||j.created_at?.slice(0,10)||'']))
          taggedInvoices.forEach(i=>rows.push(['Invoice',i.invoice_number||'',i.client_name||'',i.status||'',String(i.amount||0),i.created_at?.slice(0,10)||'']))
          const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n')
          const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='tag_report.csv';a.click()
        }

        const fmtMoney = (n:number) => '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
        const fmtD = (d:string) => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'

        return (
          <div>
            {/* Tag selector */}
            <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',padding:'1.25rem',marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
                <h3 style={{margin:0,fontSize:14,fontWeight:700,color:'#f1f5f9'}}>Filter by Tags</h3>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:12,color:'#64748b'}}>Logic:</span>
                  {(['OR','AND'] as const).map(l=>(
                    <button key={l} onClick={()=>setTagLogic(l)} style={{padding:'4px 12px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',
                      background:tagLogic===l?'rgba(74,222,128,0.15)':'#1e293b',color:tagLogic===l?'#4ade80':'#64748b',
                      border:tagLogic===l?'1px solid rgba(74,222,128,0.3)':'1px solid #334155'}}>
                      {l} {l==='OR'?'(any)':'(all)'}
                    </button>
                  ))}
                  {selectedTags.length>0&&<button onClick={()=>setSelectedTags([])} style={{padding:'4px 10px',borderRadius:8,fontSize:12,color:'#f87171',background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.2)',cursor:'pointer',fontFamily:'inherit'}}>Clear</button>}
                  <button onClick={exportAll} style={{padding:'4px 12px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9',cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:600}}>📥 Export All</button>
                </div>
              </div>
              <input placeholder="Search tags..." value={tagSearch} onChange={e=>setTagSearch(e.target.value)}
                style={{width:'100%',padding:'8px 12px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,fontSize:13,color:'#f1f5f9',outline:'none',fontFamily:'inherit',boxSizing:'border-box' as any,marginBottom:10}}/>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {allTags.filter(t=>!tagSearch||t.toLowerCase().includes(tagSearch.toLowerCase())).map(t=>{
                  const active=selectedTags.includes(t)
                  return(
                    <button key={t} onClick={()=>setSelectedTags(prev=>active?prev.filter(x=>x!==t):[...prev,t])}
                      style={{padding:'5px 12px',borderRadius:99,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                        background:active?'rgba(74,222,128,0.2)':'#1e293b',color:active?'#4ade80':'#94a3b8',
                        border:active?'1px solid rgba(74,222,128,0.4)':'1px solid #334155',transition:'all .15s'}}>
                      {active?'✓ ':''}{t}
                    </button>
                  )
                })}
                {allTags.length===0&&<span style={{fontSize:13,color:'#475569'}}>No tags yet — add tags to client records first</span>}
              </div>
            </div>

            {/* Summary KPIs */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
              {[
                {label:'Tagged Clients',val:String(taggedClients.length),color:'#4ade80'},
                {label:'Related Jobs',val:String(taggedJobs.length),color:'#60a5fa'},
                {label:'Related Invoices',val:String(taggedInvoices.length)+` (${fmtMoney(taggedInvoices.reduce((a:number,i:any)=>a+(i.amount||0),0))})`,color:'#fbbf24'},
              ].map(s=>(
                <div key={s.label} style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:'1rem',borderTop:`3px solid ${s.color}`}}>
                  <p style={{margin:'0 0 4px',fontSize:11,color:s.color,fontWeight:700,textTransform:'uppercase'}}>{s.label}</p>
                  <p style={{margin:0,fontSize:20,fontWeight:800,color:'#f1f5f9'}}>{s.val}</p>
                </div>
              ))}
            </div>

            {/* Sub-tabs */}
            <div style={{display:'flex',gap:4,marginBottom:12,borderBottom:'1px solid #1e293b',paddingBottom:0}}>
              {([['clients','👥 Clients'],['jobs','🔧 Jobs'],['invoices','💰 Invoices']] as const).map(([id,label])=>(
                <button key={id} onClick={()=>setTagSubTab(id as any)}
                  style={{padding:'8px 16px',border:'none',background:'transparent',color:tagSubTab===id?'#4ade80':'#64748b',fontWeight:tagSubTab===id?700:400,fontSize:13,cursor:'pointer',fontFamily:'inherit',borderBottom:tagSubTab===id?'2px solid #4ade80':'2px solid transparent',marginBottom:-1}}>
                  {label}
                </button>
              ))}
            </div>

            {/* Clients table */}
            {tagSubTab==='clients'&&(
              <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',overflow:'hidden'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr style={{background:'#0a0f1a'}}>
                    {['Client','Division','Tags','Status','Phone','Email'].map(h=>(
                      <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:'#475569',borderBottom:'1px solid #1e293b'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {taggedClients.length===0?(<tr><td colSpan={6} style={{padding:'2rem',textAlign:'center',color:'#475569',fontSize:13}}>No clients match</td></tr>)
                    :taggedClients.map((c:any,i:number)=>{
                      const tags=(c.tags||'').split(',').map((t:string)=>t.trim()).filter(Boolean)
                      return(<tr key={i} style={{borderBottom:'1px solid #1e293b'}}>
                        <td style={{padding:'11px 16px'}}><p style={{margin:'0 0 1px',fontSize:13,fontWeight:600,color:'#f1f5f9'}}>{c.first_name} {c.last_name}</p>{c.company&&<p style={{margin:0,fontSize:11,color:'#64748b'}}>{c.company}</p>}</td>
                        <td style={{padding:'11px 16px',fontSize:13,color:'#64748b'}}>{c.divisions||'—'}</td>
                        <td style={{padding:'11px 16px'}}><div style={{display:'flex',flexWrap:'wrap',gap:4}}>{tags.map((t:string,j:number)=>(<span key={j} style={{padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600,background:selectedTags.includes(t)?'rgba(74,222,128,0.2)':'rgba(100,116,139,0.15)',color:selectedTags.includes(t)?'#4ade80':'#94a3b8'}}>{t}</span>))}</div></td>
                        <td style={{padding:'11px 16px'}}><span style={{background:c.status==='active'?'rgba(74,222,128,0.15)':'rgba(100,116,139,0.15)',color:c.status==='active'?'#4ade80':'#94a3b8',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600,textTransform:'capitalize'}}>{c.status}</span></td>
                        <td style={{padding:'11px 16px',fontSize:12,color:'#64748b'}}>{c.phone||'—'}</td>
                        <td style={{padding:'11px 16px',fontSize:12,color:'#64748b'}}>{c.email||'—'}</td>
                      </tr>)
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Jobs table */}
            {tagSubTab==='jobs'&&(
              <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',overflow:'hidden'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr style={{background:'#0a0f1a'}}>
                    {['Job Title','Client','Division','Status','Amount','Date'].map(h=>(
                      <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:'#475569',borderBottom:'1px solid #1e293b'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {taggedJobs.length===0?(<tr><td colSpan={6} style={{padding:'2rem',textAlign:'center',color:'#475569',fontSize:13}}>No jobs found for selected tags</td></tr>)
                    :taggedJobs.map((j:any,i:number)=>(
                      <tr key={i} style={{borderBottom:'1px solid #1e293b'}}>
                        <td style={{padding:'11px 16px',fontSize:13,fontWeight:600,color:'#f1f5f9'}}>{j.title||'—'}</td>
                        <td style={{padding:'11px 16px',fontSize:13,color:'#94a3b8'}}>{j.client_name||'—'}</td>
                        <td style={{padding:'11px 16px',fontSize:12,color:'#64748b'}}>{j.division||'—'}</td>
                        <td style={{padding:'11px 16px'}}><span style={{background:j.status==='completed'?'rgba(74,222,128,0.15)':'rgba(100,116,139,0.15)',color:j.status==='completed'?'#4ade80':'#94a3b8',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600,textTransform:'capitalize'}}>{j.status}</span></td>
                        <td style={{padding:'11px 16px',fontSize:13,fontWeight:700,color:'#4ade80'}}>{fmtMoney(j.total_amount||0)}</td>
                        <td style={{padding:'11px 16px',fontSize:12,color:'#64748b'}}>{fmtD(j.scheduled_start||j.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Invoices table */}
            {tagSubTab==='invoices'&&(
              <div style={{background:'#0f172a',borderRadius:14,border:'1px solid #1e293b',overflow:'hidden'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr style={{background:'#0a0f1a'}}>
                    {['Invoice #','Client','Status','Amount','Date'].map(h=>(
                      <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:'#475569',borderBottom:'1px solid #1e293b'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {taggedInvoices.length===0?(<tr><td colSpan={5} style={{padding:'2rem',textAlign:'center',color:'#475569',fontSize:13}}>No invoices found for selected tags</td></tr>)
                    :taggedInvoices.map((inv:any,i:number)=>(
                      <tr key={i} style={{borderBottom:'1px solid #1e293b'}}>
                        <td style={{padding:'11px 16px',fontSize:13,fontWeight:600,color:'#f1f5f9'}}>#{inv.invoice_number||inv.id}</td>
                        <td style={{padding:'11px 16px',fontSize:13,color:'#94a3b8'}}>{inv.client_name||'—'}</td>
                        <td style={{padding:'11px 16px'}}><span style={{background:inv.status==='paid'?'rgba(74,222,128,0.15)':inv.status==='overdue'?'rgba(248,113,113,0.15)':'rgba(251,191,36,0.15)',color:inv.status==='paid'?'#4ade80':inv.status==='overdue'?'#f87171':'#fbbf24',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600,textTransform:'capitalize'}}>{inv.status}</span></td>
                        <td style={{padding:'11px 16px',fontSize:13,fontWeight:700,color:'#4ade80'}}>{fmtMoney(inv.amount||0)}</td>
                        <td style={{padding:'11px 16px',fontSize:12,color:'#64748b'}}>{fmtD(inv.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
