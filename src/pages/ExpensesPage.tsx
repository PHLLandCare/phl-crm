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

const EXPENSE_CATEGORIES = ['All','Fuel','Labor','Equipment','Materials','Vehicle','Insurance','Office','Utilities','Subcontractor','Other']

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showAdd, setShowAdd]   = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [editing, setEditing]   = useState<Expense|null>(null)
  const [toast, setToast]       = useState('')
  const showToast = (msg: string) => { setToast(msg); setTimeout(()=>setToast(''), 3000) }
  const [form, setForm]         = useState({
    item_name:'', description:'', amount:'0.00', category:'Fuel',
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
    if (editing) {
      await supabase.from('expenses').update({
        item_name: form.item_name, description: form.description,
        amount: parseFloat(form.amount)||0, category: form.category,
        reimburse_to: form.reimburse_to, expense_date: form.expense_date,
      }).eq('id', editing.id)
      setEditing(null)
      showToast('✅ Expense updated!')
    } else {
      await supabase.from('expenses').insert({
        item_name: form.item_name, description: form.description,
        amount: parseFloat(form.amount)||0, category: (form as any).category||'Other',
        reimburse_to: form.reimburse_to, job_id: form.job_id||null,
        expense_date: form.expense_date, receipt_url: form.receipt_url||null,
      })
      showToast('✅ Expense added!')
    }
    setShowAdd(false)
    setForm({item_name:'',description:'',amount:'0.00',category:'Fuel',reimburse_to:'Not reimbursable',job_id:'',expense_date:new Date().toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'}),receipt_url:''})
  }

  const handleDelete = async (id:string) => {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').update({deleted_at:new Date().toISOString()}).eq('id',id)
  }

  const filtered = expenses.filter(e => {
    const matchSearch = `${e.item_name||''} ${e.description||''} ${e.reimburse_to||''} ${e.category||''}`.toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === 'All' || e.category === categoryFilter
    return matchSearch && matchCat
  })
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

      {/* Toast */}
      {toast && <div style={{position:'fixed',top:'1rem',right:'1rem',background:'#052e16',border:'1px solid #16a34a',borderRadius:10,padding:'10px 18px',fontSize:14,color:'#4ade80',fontWeight:600,zIndex:9999}}>{toast}</div>}

      {/* Stats by category */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:'1rem'}}>
        {EXPENSE_CATEGORIES.filter(c=>c!=='All').map(cat => {
          const catTotal = expenses.filter(e=>e.category===cat).reduce((s,e)=>s+(e.amount||0),0)
          return catTotal > 0 ? (
            <div key={cat} onClick={()=>setCategoryFilter(cat===categoryFilter?'All':cat)} style={{background:categoryFilter===cat?'rgba(74,222,128,0.1)':'#0f172a',border:categoryFilter===cat?'1px solid #4ade80':'1px solid #1e293b',borderRadius:10,padding:'8px 12px',cursor:'pointer'}}>
              <p style={{margin:'0 0 2px',fontSize:11,color:'#64748b',fontWeight:600,textTransform:'uppercase'}}>{cat}</p>
              <p style={{margin:0,fontSize:15,fontWeight:700,color:categoryFilter===cat?'#4ade80':'#f1f5f9'}}>${catTotal.toFixed(0)}</p>
            </div>
          ) : null
        })}
      </div>

      {/* Export + Search */}
      <div style={{display:'flex',gap:8,marginBottom:'1rem',alignItems:'center'}}>
      <input placeholder="Search expenses..." value={search} onChange={e=>setSearch(e.target.value)}
        style={{...inp,flex:1,background:'#0f172a',border:'1.5px solid #1e293b',borderRadius:10,padding:'0 14px',height:44}} />
        <button onClick={()=>{
          const rows=[['Date','Category','Item','Description','Amount','Reimbursed To']]
          filtered.forEach(e=>rows.push([e.expense_date||'',e.category||'',e.item_name||'',e.description||'',String(e.amount||0),e.reimburse_to||'']))
          const csv=rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n')
          const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='expenses.csv';a.click()
        }} style={{padding:'0 16px',height:44,background:'#1e293b',border:'1px solid #334155',borderRadius:10,color:'#94a3b8',cursor:'pointer',fontSize:13,fontFamily:'inherit',whiteSpace:'nowrap',fontWeight:600}}>
          📥 Export CSV
        </button>
      </div>

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
                  <td style={{padding:'13px 16px',display:'flex',gap:6}}>
                    <button onClick={()=>{setEditing(e);setForm({item_name:e.item_name||'',description:e.description||'',amount:String(e.amount||''),category:(e as any).category||'Other',reimburse_to:e.reimburse_to||'Not reimbursable',job_id:e.job_id||'',expense_date:e.expense_date||'',receipt_url:e.receipt_url||''});setShowAdd(true)}} style={{background:'rgba(74,222,128,0.1)',color:'#4ade80',border:'1px solid rgba(74,222,128,0.2)',borderRadius:6,padding:'4px 10px',fontSize:12,cursor:'pointer',fontWeight:600}}>Edit</button>
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
              <h2 style={{fontSize:18,fontWeight:700,color:'#f1f5f9',margin:0}}>{editing ? 'Edit Expense' : 'New Expense'}</h2>
              <button onClick={()=>{setShowAdd(false);setEditing(null)}} style={{background:'none',border:'none',color:'#64748b',fontSize:24,cursor:'pointer',lineHeight:1,padding:'0 4px'}}>×</button>
            </div>

            <div style={{padding:'1.5rem'}}>
              {/* Date */}
              <div style={{marginBottom:'1rem'}}>
                <label style={lbl}>Date</label>
                <input value={form.expense_date} onChange={e=>setForm({...form,expense_date:e.target.value})} style={inp} />
              </div>

              {/* Category + Item */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:'1rem'}}>
                <div>
                  <label style={lbl}>Category</label>
                  <select value={(form as any).category||'Other'} onChange={e=>setForm({...form, category: e.target.value} as any)} style={{...inp,padding:'10px 12px'}}>
                    {EXPENSE_CATEGORIES.filter(c=>c!=='All').map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <input placeholder="Item name *" value={form.item_name} onChange={e=>setForm({...form,item_name:e.target.value})} style={{...inp,marginTop:22}} />
                </div>
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
