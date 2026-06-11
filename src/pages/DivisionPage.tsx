import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface DivisionConfig {
  id: string
  label: string
  icon: string
  color: string
  description: string
  services: string[]
}

const DIVISIONS: DivisionConfig[] = [
  { id: 'div-lawn',         label: 'Lawn & Tree',   icon: '🌿', color: '#4ade80', description: 'Lawn mowing, trimming, tree service, and landscaping',        services: ['Lawn Mowing','Tree Trimming','Hedge Trimming','Yard Clean Up','Landscape Design','Mulching','Sod Installation'] },
  { id: 'div-irrigation',   label: 'Irrigation',    icon: '💧', color: '#60a5fa', description: 'Irrigation installation, repair, and maintenance',             services: ['System Installation','Leak Repair','Head Replacement','Timer Programming','Backflow Testing','Winterization','Spring Startup'] },
  { id: 'div-extermination',label: 'Extermination', icon: '🐛', color: '#f59e0b', description: 'Pest control, extermination, and prevention services',         services: ['General Pest Control','Termite Treatment','Mosquito Control','Rodent Control','Fire Ant Treatment','Bed Bug Treatment','Annual Contract'] },
  { id: 'div-nursery',      label: 'Nursery',       icon: '🌱', color: '#a78bfa', description: 'Plant sales, deliveries, and landscape installation',          services: ['Plant Sales','Delivery & Install','Seasonal Color','Palms','Shrubs','Sod','Custom Planting'] },
  { id: 'div-farm',         label: 'Farm',          icon: '🐓', color: '#fb923c', description: 'Livestock, poultry, eggs, and farm produce operations',        services: ['Chicken Care','Turkey Care','Goat Care','Egg Collection & Sales','Feed & Supplies','Livestock Health Checks','Farm Produce'] },
  { id: 'div-hardscape',    label: 'Hardscape',     icon: '🪨', color: '#94a3b8', description: 'Pavers, concrete, driveways, patios, and retaining walls',    services: ['Paver Installation','Concrete Work','Driveways','Patios & Walkways','Retaining Walls','Pool Decks','Edging & Borders'] },
]

interface DivisionStats {
  clients: number
  jobs: number
  revenue: number
  activeJobs: number
}

interface RecentJob {
  id: string
  title: string
  client_name: string
  status: string
  amount: number
  scheduled_start: string
}

interface Props {
  divisionId: string
}

export default function DivisionPage({ divisionId }: Props) {
  const navigate = useNavigate()
  const div = DIVISIONS.find(d => d.id === divisionId)
  const [stats, setStats] = useState<DivisionStats>({ clients: 0, jobs: 0, revenue: 0, activeJobs: 0 })
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([])
  const [clientCount, setClientCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1024)
  useEffect(() => {
    const fn = () => { setIsMobile(window.innerWidth < 768); setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024) }
    window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => {
    if (!div) return
    const load = async () => {
      setLoading(true)
      const divLabel = div.label

      const [clientRes, jobRes] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('divisions', divLabel).is('deleted_at', null),
        supabase.from('jobs').select('id,title,client_name,status,total_amount,scheduled_start').eq('division', divLabel).is('deleted_at', null).order('scheduled_start', { ascending: false }).limit(10),
      ])

      const jobs = jobRes.data ?? []
      const totalRev = jobs.filter(j => j.status === 'completed').reduce((a: number, j: any) => a + (j.total_amount || 0), 0)
      const active = jobs.filter(j => j.status === 'in_progress' || j.status === 'scheduled').length

      setClientCount(clientRes.count ?? 0)
      setStats({ clients: clientRes.count ?? 0, jobs: jobs.length, revenue: totalRev, activeJobs: active })
      setRecentJobs(jobs.map((j: any) => ({ id: j.id, title: j.title || 'Untitled Job', client_name: j.client_name || '—', status: j.status, amount: j.total_amount || 0, scheduled_start: j.scheduled_start || '' })))
      setLoading(false)
    }
    load()
    const ch = supabase.channel('division-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'jobs'},load)
      .on('postgres_changes',{event:'*',schema:'public',table:'clients'},load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [divisionId])

  if (!div) return (
    <div style={{ padding: '2rem', color: '#64748b', fontSize: 13 }}>Division not found.</div>
  )

  const fmt = (n: number) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 })
  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  const statusColors: Record<string, { bg: string; color: string }> = {
    draft:       { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
    scheduled:   { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
    in_progress: { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24' },
    completed:   { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' },
    cancelled:   { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  }
  const sc = (s: string) => statusColors[s] || statusColors.draft

  return (
    <div style={{ padding: isMobile?'1rem':isTablet?'1.25rem':'2rem', background: '#0a0f1a', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: `rgba(${hexToRgb(div.color)},0.15)`, border: `1px solid rgba(${hexToRgb(div.color)},0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
            {div.icon}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#f1f5f9' }}>{div.label}</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{div.description}</p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: (isMobile||isTablet)?'1fr 1fr':'repeat(4,1fr)', gap: 12, marginBottom: '2rem' }}>
        {[
          { label: 'Division Clients',  val: stats.clients,    color: div.color,  fmt: (n: number) => String(n), sub: 'Total' },
          { label: 'Active Jobs',       val: stats.activeJobs, color: '#fbbf24',  fmt: (n: number) => String(n), sub: 'Scheduled or in progress' },
          { label: 'Total Jobs',        val: stats.jobs,       color: '#60a5fa',  fmt: (n: number) => String(n), sub: 'All time' },
          { label: 'Division Revenue',  val: stats.revenue,    color: '#4ade80',  fmt,                            sub: 'Completed jobs' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#0f172a', border: '1px solid #1e293b', borderTop: `3px solid ${s.color}`, borderRadius: 14, padding: '1.25rem' }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, color: s.color, fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</p>
            <p style={{ margin: '0 0 2px', fontSize: 28, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>{s.fmt(s.val)}</p>
            <p style={{ margin: 0, fontSize: 11, color: '#475569' }}>{s.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: (isMobile||isTablet)?'1fr':'1fr 260px', gap: 16 }}>

        {/* Recent Jobs */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Recent Jobs — {div.label}</h3>
            <button
              onClick={() => navigate('/jobs', { state: { divisionFilter: div.label } })}
              style={{ padding: '6px 14px', background: '#16a34a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              + New Job
            </button>
          </div>

          {loading ? (
            <p style={{ color: '#475569', fontSize: 13 }}>Loading...</p>
          ) : recentJobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#475569' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>{div.icon}</div>
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#64748b' }}>No {div.label} jobs yet</p>
              <p style={{ margin: '0 0 16px', fontSize: 13 }}>Create your first job for this division</p>
              <button onClick={() => navigate('/jobs', { state: { openCreate: true, division: div.label } })}
                style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                + New Job
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  {['Job', 'Client', 'Scheduled', 'Status', 'Amount'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentJobs.map(j => (
                  <tr key={j.id} onClick={() => navigate('/jobs', { state: { openItem: j.id } })}
                    style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '11px 12px', fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{j.title}</td>
                    <td style={{ padding: '11px 12px', fontSize: 13, color: '#94a3b8' }}>{j.client_name}</td>
                    <td style={{ padding: '11px 12px', fontSize: 12, color: '#64748b' }}>{fmtDate(j.scheduled_start)}</td>
                    <td style={{ padding: '11px 12px' }}>
                      <span style={{ background: sc(j.status).bg, color: sc(j.status).color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
                        {j.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: 13, color: '#4ade80', fontWeight: 700, textAlign: 'right' }}>{fmt(j.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Services + Quick Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Services offered */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Services Offered</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {div.services.map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#1e293b', borderRadius: 8 }}>
                  <span style={{ color: div.color, fontSize: 10 }}>●</span>
                  <span style={{ fontSize: 12, color: '#cbd5e1' }}>{s}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Quick Actions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'View All Clients',  icon: '👥', action: () => navigate('/clients') },
                { label: 'View Schedule',     icon: '📅', action: () => navigate('/schedule') },
                { label: 'New Quote',         icon: '📋', action: () => navigate('/quotes', { state: { openCreate: true, division: div.label } }) },
                { label: 'New Job',           icon: '🔧', action: () => navigate('/jobs',   { state: { openCreate: true, division: div.label } }) },
                { label: 'View Reports',      icon: '📊', action: () => navigate('/reports') },
              ].map(a => (
                <button key={a.label} onClick={a.action}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = div.color }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#334155' }}>
                  <span style={{ fontSize: 16 }}>{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}
