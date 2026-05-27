import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Invoice {
  id: string
  title: string
  amount: number
  due_date: string
  status: string
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({title:'',amount:'',due_date:'',status:'draft'})

  const loadInvoices = async () => {
    setLoading(true)
    const { data } = await supabase.from('invoices').select('*').is('deleted_at',null).order('created_at',{ascending:false})
    setInvoices(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadInvoices()
    const channel = supabase.channel('invoices')
      .on('postgres_changes',{event:'*',schema:'public',table:'invoices'},loadInvoices)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleAdd = async () => {
    if (!form.title || !form.amount) return
    await supabase.from('invoices').insert({...form,amount:parseFloat(form.amount)||0})
    setShowAdd(false)
    setForm({title:'',amount:'',due_date:'',status:'draft'})
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this invoice?')) return
    await supabase.from('invoices').update({deleted_at:new Date().toISOString()}).eq('id',id)
  }

  const filtered = invoices.filter(i =>
    `${i.title} ${i.status}`.toLowerCase().includes(search.toLowerCase())
  )

  const statusColor: Record<string,string> = {
    draft:'#f3f4f6', sent:'#dbeafe', paid:'#dcfce7', overdue:'#fef2f2', void:'#f3f4f6'
  }

  const total = invoices.reduce((sum,i) => sum + (i.amount||0), 0)
  const paid = invoices.filter(i=>i.status==='paid').reduce((sum,i) => sum + (i.amount||0), 0)
  const overdue = invoices.filter(i=>i.status==='overdue').reduce((sum,i) => sum + (i.amount||0), 0)

  return (
    <div style={{padding:'2rem',maxWidth:1200,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'#111827',margin:'0 0 4px'}}>Invoices</h1>
          <p style={{fontSize:14,color:'#6b7280',margin:0}}>{invoices.length} total invoices</p>
        </div>
        <button onClick={()=>setShowAdd(true)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:'pointer'}}>+ New Invoice</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginBottom:'1.5rem'}}>
        {[{label:'Total',value:`$${total.toLocaleString()}`,color:'#f9fafb'},{label:'Paid',value:`$${paid.toLocaleString()}`,color:'#dcfce7'},{label:'Overdue',value:`$${overdue.toLocaleString()}`,color:'#fef2f2'}].map(s=>(
          <div key={s.label} style={{background:s.color,borderRadius:12,padding:'1rem',border:'1px solid #e5e7eb'}}>
            <p style={{fontSize:12,color:'#6b7280',margin:'0 0 4px'}}>{s.label}</p>
            <p style={{fontSize:20,fontWeight:700,color:'#111827',margin:0}}>{s.value}</p>
          </div>
        ))}
      </div>

      <input placeholder="Search invoices..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none',marginBottom:'1rem'}} />

      {loading ? <p>Loading...</p> : (
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #e5e7eb',overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'#f9fafb',borderBottom:'1px solid #e5e7eb'}}>
                {['Title','Amount','Due Date','Status',''].map(h=>(
                  <th key={h} style={{padding:'12px 16px',textAlign:'left',fontSize:12,fontWeight:600,color:'#6b7280'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={5} style={{padding:'2rem',textAlign:'center',color:'#9ca3af'}}>No invoices found</td></tr>
              ) : filtered.map(i=>(
                <tr key={i.id} style={{borderBottom:'1px solid #f3f4f6'}}>
                  <td style={{padding:'12px 16px',fontSize:14,fontWeight:500}}>{i.title}</td>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>${i.amount||0}</td>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>{i.due_date||'—'}</td>
                  <td style={{padding:'12px 16px'}}>
                    <span style={{background:statusColor[i.status]||'#f3f4f6',padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:500}}>{i.status}</span>
                  </td>
                  <td style={{padding:'12px 16px'}}>
                    <button onClick={()=>handleDelete(i.id)} style={{background:'#fef2f2',color:'#991b1b',border:'none',borderRadius:6,padding:'4px 10px',fontSize:12,cursor:'pointer'}}>Delete</button>
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
            <h2 style={{fontSize:18,fontWeight:700,margin:'0 0 1.5rem'}}>New Invoice</h2>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Title *</label>
              <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Amount ($) *</label>
              <input type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1.5rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Status</label>
              <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}}>
                {['draft','sent','paid','overdue','void'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowAdd(false)} style={{padding:'10px 20px',border:'1.5px solid #e5e7eb',borderRadius:10,background:'#fff',cursor:'pointer',fontSize:14}}>Cancel</button>
              <button onClick={handleAdd} style={{padding:'10px 20px',border:'none',borderRadius:10,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:600}}>Save Invoice</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}