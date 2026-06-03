import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Expense {
  id: string
  category: string
  item_name: string
  description: string
  amount: number
  reimburse_to: string
  job_id: string
  expense_date: string
  receipt_url: string
}

const inp  = {width:'100%',padding:'10px 14px',background:'#1a2332',border:'1px solid #2d3f55',borderRadius:8,fontSize:14,boxSizing:'border-box' as const,outline:'none',color:'#f1f5f9',fontFamily:'inherit'}
const lbl  = {fontSize:13,fontWeight:500,color:'#94a3b8',display:'block',marginBottom:6}

const REIMBURSE_OPTIONS = ['Not reimbursable','Romy Cruz','Brandon M Ryan','Carlyn Fagarass','Cory Mazziotta','David Hernandez','Levi Rosales','John Jr Fagarass']

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showAdd, setShowAdd]   = useState(false)
  const [form, setForm]         = useState({
    item_name:'', description:'', amount:'0.00',
    reimburse_to:'Not reimbursable', job_id:'',
    expense_date: new Date().toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'}),
    receipt_url:''
  })

  const loadExpenses = async () => {
    setLoading(true)
    const { data } = await supabase.from('expenses').select('*').is('deleted_at',null).order('expense_date',{ascending:false})
    setExpenses(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadExpenses()
    const ch = supabase.channel('expenses').on('postgres_changes',{event:'*',schema:'public',table:'expenses'},loadExpenses).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const handleAdd = async () => {
    if (!form.item_name) return
    await supabase.from('expenses').insert({
      item_name:    form.item_name,
      description:  form.description,
      amount:       parseFloat(form.amount)||0,
      reimburse_to: form.reimburse_to,
      job_id:       form.job_id||null,
      expense_date: form.expense_date,
      receipt_url:  form.receipt_url||null,
    })
    setShowAdd(false)
    setForm({item_name:'',description:'',amount:'0.00',reimburse_to:'Not reimbursable',job_id:'',expense_date:new Date().toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'}),receipt_url:''})
  }

  const handleDelete = async (id:string) => {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').update({deleted_at:new Date().toISOString()}).eq('id',id)
  }

  const filtered = expenses.filter(e =>
    `${e.item_name||''} ${e.description||''} ${e.reimburse_to||''}`.toLowerCase().includes(search.toLowerCase())
  )
  const total = expenses.reduce((s,e) => s+(e.amount||0),0)

  return (
    <div style={{padding:'2rem',maxWidth:1200,margin:'0 auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'#f1f5f9',margin:'0 0 4px'}}>Expenses</h1>
          <p style={{fontSize:14,color:'#64748b',margin:0}}>Total: <span style={{color:'#4ade80',fontWeight:700}}>${total.toLocaleString('en-US',{minimumFractionDigits:2})}</span></p>
        </div>
        <button onClick={()=>setShowAdd(true)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:'pointer'}}>+ Add Expense</button>
      </div>

      {/* Search */}
      <input placeholder="Search expenses..." value={search} onChange={e=>setSearch(e.target.value)}
        style={{...inp,marginBottom:'1rem',background:'#0f172a',border:'1.5px solid #1e293b',borderRadius:10,padding:'0 14px',height:44}} />

      {/* Table */}
      {loading ? <p style={{color:'#64748b'}}>Loading...</p> : (
        <div style={{background:'#0f172a',borderRadius:16,border:'1px solid #1e293b',overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:'1px solid #1e293b',background:'#0a0f1a'}}>
                {['Date','Item','Description','Amount','Reimbursed To',''].map(h=>(
                  <th key={h} style={{padding:'11px 16px',textAlign:'left',fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={6} style={{padding:'2.5rem',textAlign:'center',color:'#475569'}}>No expenses found</td></tr>
              ) : filtered.map((e,idx)=>(
                <tr key={e.id} style={{borderBottom:'1px solid #1e293b',background:idx%2===0?'transparent':'rgba(255,255,255,0.02)'}}>
                  <td style={{padding:'13px 16px',fontSize:13,color:'#64748b',whiteSpace:'nowrap'}}>{e.expense_date||'—'}</td>
                  <td style={{padding:'13px 16px',fontSize:14,fontWeight:600,color:'#f1f5f9'}}>{e.item_name||e.description||'—'}</td>
                  <td style={{padding:'13px 16px',fontSize:13,color:'#94a3b8',maxWidth:240}}>{e.description||'—'}</td>
                  <td style={{padding:'13px 16px',fontSize:15,fontWeight:800,color:'#4ade80'}}>${(e.amount||0).toFixed(2)}</td>
                  <td style={{padding:'13px 16px',fontSize:13,color:e.reimburse_to&&e.reimburse_to!=='Not reimbursable'?'#fcd34d':'#475569'}}>{e.reimburse_to||'—'}</td>
                  <td style={{padding:'13px 16px'}}>
                    <button onClick={()=>handleDelete(e.id)} style={{background:'#450a0a',color:'#fca5a5',border:'none',borderRadius:6,padding:'4px 10px',fontSize:12,cursor:'pointer',fontWeight:600}}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length>0 && (
              <tfoot>
                <tr style={{borderTop:'2px solid #1e293b',background:'#0a0f1a'}}>
                  <td colSpan={3} style={{padding:'13px 16px',fontSize:12,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em'}}>Total ({filtered.length} expenses)</td>
                  <td style={{padding:'13px 16px',fontSize:16,fontWeight:800,color:'#4ade80'}}>${filtered.reduce((s,e)=>s+(e.amount||0),0).toFixed(2)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Jobber-style New Expense Modal */}
      {showAdd && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'1rem'}}>
          <div style={{background:'#111827',border:'1px solid #1f2d3d',borderRadius:16,width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto'}}>

            {/* Modal header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'1.25rem 1.5rem',borderBottom:'1px solid #1f2d3d'}}>
              <h2 style={{fontSize:18,fontWeight:700,color:'#f1f5f9',margin:0}}>New expense</h2>
              <button onClick={()=>setShowAdd(false)} style={{background:'none',border:'none',color:'#64748b',fontSize:24,cursor:'pointer',lineHeight:1,padding:'0 4px'}}>×</button>
            </div>

            <div style={{padding:'1.5rem'}}>
              {/* Date */}
              <div style={{marginBottom:'1rem'}}>
                <label style={lbl}>Date</label>
                <input value={form.expense_date} onChange={e=>setForm({...form,expense_date:e.target.value})} style={inp} />
              </div>

              {/* Item name */}
              <div style={{marginBottom:'1rem'}}>
                <input placeholder="Item name" value={form.item_name} onChange={e=>setForm({...form,item_name:e.target.value})} style={inp} />
              </div>

              {/* Details */}
              <div style={{marginBottom:'1rem'}}>
                <textarea placeholder="Details" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}
                  style={{...inp,height:90,padding:'10px 14px',resize:'vertical' as const}} />
              </div>

              {/* Total */}
              <div style={{marginBottom:'1rem'}}>
                <label style={{...lbl,color:'#64748b'}}>Total $</label>
                <input type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}
                  style={{...inp,fontSize:16,fontWeight:600}} />
              </div>

              {/* Reimburse to */}
              <div style={{marginBottom:'1rem'}}>
                <label style={lbl}>Reimburse to</label>
                <select value={form.reimburse_to} onChange={e=>setForm({...form,reimburse_to:e.target.value})} style={{...inp,padding:'10px 12px'}}>
                  {REIMBURSE_OPTIONS.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>

              {/* Job */}
              <div style={{marginBottom:'1rem'}}>
                <label style={lbl}>Job</label>
                <select value={form.job_id} onChange={e=>setForm({...form,job_id:e.target.value})} style={{...inp,padding:'10px 12px'}}>
                  <option value="">— Select a job —</option>
                </select>
              </div>

              {/* Receipt */}
              <div style={{marginBottom:'1.5rem'}}>
                <label style={lbl}>Receipt</label>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <label style={{background:'#1e293b',color:'#cbd5e1',border:'1px solid #334155',borderRadius:6,padding:'6px 14px',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
                    Choose File
                    <input type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={e=>{
                      const file = e.target.files?.[0]
                      if (file) setForm({...form,receipt_url:file.name})
                    }} />
                  </label>
                  <span style={{fontSize:13,color:'#475569'}}>{form.receipt_url||'No file chosen'}</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                <button onClick={()=>setShowAdd(false)} style={{padding:'10px 22px',border:'1px solid #334155',borderRadius:8,background:'transparent',color:'#cbd5e1',cursor:'pointer',fontSize:14,fontFamily:'inherit'}}>Cancel</button>
                <button onClick={handleAdd} style={{padding:'10px 22px',border:'none',borderRadius:8,background:'#4ade80',color:'#111827',cursor:'pointer',fontSize:14,fontWeight:700,fontFamily:'inherit'}}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
