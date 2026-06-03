import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Expense {
  id: string
  category: string
  description: string
  amount: number
  paid_by: string
  expense_date: string
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({category:'Fuel',description:'',amount:'',paid_by:'',expense_date:''})

  const loadExpenses = async () => {
    setLoading(true)
    const { data } = await supabase.from('expenses').select('*').is('deleted_at',null).order('expense_date',{ascending:false})
    setExpenses(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadExpenses()
    const channel = supabase.channel('expenses')
      .on('postgres_changes',{event:'*',schema:'public',table:'expenses'},loadExpenses)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleAdd = async () => {
    if (!form.description || !form.amount) return
    await supabase.from('expenses').insert({...form,amount:parseFloat(form.amount)||0})
    setShowAdd(false)
    setForm({category:'Fuel',description:'',amount:'',paid_by:'',expense_date:''})
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').update({deleted_at:new Date().toISOString()}).eq('id',id)
  }

  const filtered = expenses.filter(e =>
    `${e.category} ${e.description} ${e.paid_by}`.toLowerCase().includes(search.toLowerCase())
  )

  const total = expenses.reduce((sum,e) => sum + (e.amount||0), 0)

  return (
    <div style={{padding:'2rem',maxWidth:1200,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'#111827',margin:'0 0 4px'}}>Expenses</h1>
          <p style={{fontSize:14,color:'#6b7280',margin:0}}>Total: ${total.toLocaleString()}</p>
        </div>
        <button onClick={()=>setShowAdd(true)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:'pointer'}}>+ Add Expense</button>
      </div>
      <input placeholder="Search expenses..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none',marginBottom:'1rem'}} />
      {loading ? <p>Loading...</p> : (
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #e5e7eb',overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'#f9fafb',borderBottom:'1px solid #e5e7eb'}}>
                {['Date','Category','Description','Amount','Paid By',''].map(h=>(
                  <th key={h} style={{padding:'12px 16px',textAlign:'left',fontSize:12,fontWeight:600,color:'#6b7280'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={6} style={{padding:'2rem',textAlign:'center',color:'#9ca3af'}}>No expenses found</td></tr>
              ) : filtered.map(e=>(
                <tr key={e.id} style={{borderBottom:'1px solid #f3f4f6'}}>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>{e.expense_date||'—'}</td>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>{e.category||'—'}</td>
                  <td style={{padding:'12px 16px',fontSize:14,fontWeight:500}}>{e.description}</td>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#111827',fontWeight:600}}>${e.amount||0}</td>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>{e.paid_by||'—'}</td>
                  <td style={{padding:'12px 16px'}}>
                    <button onClick={()=>handleDelete(e.id)} style={{background:'#fef2f2',color:'#991b1b',border:'none',borderRadius:6,padding:'4px 10px',fontSize:12,cursor:'pointer'}}>Delete</button>
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
            <h2 style={{fontSize:18,fontWeight:700,margin:'0 0 1.5rem'}}>Add Expense</h2>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Category</label>
              <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}}>
                {['Fuel','Supplies','Equipment','Insurance','Payroll','Other'].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Description *</label>
              <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Amount ($) *</label>
              <input type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Paid By</label>
              <input value={form.paid_by} onChange={e=>setForm({...form,paid_by:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1.5rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Date</label>
              <input type="date" value={form.expense_date} onChange={e=>setForm({...form,expense_date:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowAdd(false)} style={{padding:'10px 20px',border:'1.5px solid #e5e7eb',borderRadius:10,background:'#fff',cursor:'pointer',fontSize:14}}>Cancel</button>
              <button onClick={handleAdd} style={{padding:'10px 20px',border:'none',borderRadius:10,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:600}}>Save Expense</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}