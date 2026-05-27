import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Quote {
  id: string
  title: string
  description: string
  amount: number
  status: string
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({title:'',description:'',amount:'',status:'draft'})

  const loadQuotes = async () => {
    setLoading(true)
    const { data } = await supabase.from('quotes').select('*').is('deleted_at',null).order('created_at',{ascending:false})
    setQuotes(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadQuotes()
    const channel = supabase.channel('quotes')
      .on('postgres_changes',{event:'*',schema:'public',table:'quotes'},loadQuotes)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleAdd = async () => {
    if (!form.title) return
    await supabase.from('quotes').insert({...form,amount:parseFloat(form.amount)||0})
    setShowAdd(false)
    setForm({title:'',description:'',amount:'',status:'draft'})
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this quote?')) return
    await supabase.from('quotes').update({deleted_at:new Date().toISOString()}).eq('id',id)
  }

  const filtered = quotes.filter(q =>
    `${q.title} ${q.status}`.toLowerCase().includes(search.toLowerCase())
  )

  const statusColor: Record<string,string> = {
    draft:'#f3f4f6', sent:'#dbeafe', approved:'#dcfce7', declined:'#fef2f2'
  }

  return (
    <div style={{padding:'2rem',maxWidth:1200,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'#111827',margin:'0 0 4px'}}>Quotes</h1>
          <p style={{fontSize:14,color:'#6b7280',margin:0}}>{quotes.length} total quotes</p>
        </div>
        <button onClick={()=>setShowAdd(true)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:'pointer'}}>+ New Quote</button>
      </div>
      <input placeholder="Search quotes..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none',marginBottom:'1rem'}} />
      {loading ? <p>Loading...</p> : (
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #e5e7eb',overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'#f9fafb',borderBottom:'1px solid #e5e7eb'}}>
                {['Title','Description','Amount','Status',''].map(h=>(
                  <th key={h} style={{padding:'12px 16px',textAlign:'left',fontSize:12,fontWeight:600,color:'#6b7280'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={5} style={{padding:'2rem',textAlign:'center',color:'#9ca3af'}}>No quotes found</td></tr>
              ) : filtered.map(q=>(
                <tr key={q.id} style={{borderBottom:'1px solid #f3f4f6'}}>
                  <td style={{padding:'12px 16px',fontSize:14,fontWeight:500}}>{q.title}</td>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>{q.description||'—'}</td>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>${q.amount||0}</td>
                  <td style={{padding:'12px 16px'}}>
                    <span style={{background:statusColor[q.status]||'#f3f4f6',padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:500}}>{q.status}</span>
                  </td>
                  <td style={{padding:'12px 16px'}}>
                    <button onClick={()=>handleDelete(q.id)} style={{background:'#fef2f2',color:'#991b1b',border:'none',borderRadius:6,padding:'4px 10px',fontSize:12,cursor:'pointer'}}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'1rem'}}>
          <div style={{background:'#fff',borderRadius:20,padding:'2rem',width:'100%',maxWidth:500}}>
            <h2 style={{fontSize:18,fontWeight:700,margin:'0 0 1.5rem'}}>New Quote</h2>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Title *</label>
              <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Description</label>
              <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{width:'100%',padding:'10px 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none',minHeight:80,resize:'vertical'}} />
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Amount ($)</label>
              <input type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1.5rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Status</label>
              <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}}>
                {['draft','sent','approved','declined'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowAdd(false)} style={{padding:'10px 20px',border:'1.5px solid #e5e7eb',borderRadius:10,background:'#fff',cursor:'pointer',fontSize:14}}>Cancel</button>
              <button onClick={handleAdd} style={{padding:'10px 20px',border:'none',borderRadius:10,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:600}}>Save Quote</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}