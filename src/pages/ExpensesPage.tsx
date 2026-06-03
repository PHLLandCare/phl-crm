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

const S = {
  input:  { width:'100%', height:44, padding:'0 14px', background:'#0f172a', border:'1.5px solid #1e293b', borderRadius:10, fontSize:14, boxSizing:'border-box' as const, outline:'none', color:'#f1f5f9', fontFamily:'inherit' },
  select: { width:'100%', height:44, padding:'0 12px', background:'#0f172a', border:'1.5px solid #1e293b', borderRadius:10, fontSize:14, boxSizing:'border-box' as const, outline:'none', color:'#f1f5f9', fontFamily:'inherit' },
  th:     { padding:'11px 14px', textAlign:'left' as const, fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase' as const, letterSpacing:'0.05em', whiteSpace:'nowrap' as const },
  td:     { padding:'13px 14px', fontSize:14, color:'#cbd5e1' },
}

const CAT_COLORS: Record<string, { bg:string; color:string }> = {
  'Fuel':       { bg:'#422006', color:'#fcd34d' },
  'Supplies':   { bg:'#052e16', color:'#4ade80' },
  'Equipment':  { bg:'#1e1b4b', color:'#a5b4fc' },
  'Insurance':  { bg:'#0c1a2e', color:'#7dd3fc' },
  'Payroll':    { bg:'#1a0533', color:'#d8b4fe' },
  'Other':      { bg:'#1e293b', color:'#94a3b8' },
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showAdd, setShowAdd]   = useState(false)
  const [form, setForm]         = useState({ category:'Fuel', description:'', amount:'', paid_by:'', expense_date:'' })

  const loadExpenses = async () => {
    setLoading(true)
    const { data } = await supabase.from('expenses').select('*').is('deleted_at', null).order('expense_date', { ascending:false })
    setExpenses(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadExpenses()
    const ch = supabase.channel('expenses').on('postgres_changes', { event:'*', schema:'public', table:'expenses' }, loadExpenses).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const handleAdd = async () => {
    if (!form.description || !form.amount) return
    await supabase.from('expenses').insert({ ...form, amount: parseFloat(form.amount)||0 })
    setShowAdd(false)
    setForm({ category:'Fuel', description:'', amount:'', paid_by:'', expense_date:'' })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  }

  const filtered = expenses.filter(e => `${e.category} ${e.description} ${e.paid_by}`.toLowerCase().includes(search.toLowerCase()))
  const total    = expenses.reduce((s, e) => s + (e.amount||0), 0)

  // KPI breakdown by category
  const byCategory = ['Fuel','Supplies','Equipment','Insurance','Payroll','Other'].map(cat => ({
    cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + (e.amount||0), 0),
  })).filter(c => c.total > 0)

  return (
    <div style={{ padding:'2rem', maxWidth:1200, margin:'0 auto', background:'#0a0f1a', minHeight:'100vh', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:700, color:'#f1f5f9', margin:'0 0 4px' }}>Expenses</h1>
          <p style={{ fontSize:14, color:'#64748b', margin:0 }}>Total: <span style={{ color:'#f1f5f9', fontWeight:700 }}>${total.toLocaleString('en-US', { minimumFractionDigits:2 })}</span></p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer' }}>+ Add Expense</button>
      </div>

      {/* Category KPIs */}
      {byCategory.length > 0 && (
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:'1.5rem' }}>
          {byCategory.map(c => {
            const col = CAT_COLORS[c.cat] || CAT_COLORS['Other']
            return (
              <div key={c.cat} style={{ background:col.bg, border:`1px solid ${col.color}33`, borderRadius:10, padding:'8px 16px', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:12, fontWeight:700, color:col.color }}>{c.cat}</span>
                <span style={{ fontSize:14, fontWeight:800, color:'#f1f5f9' }}>${c.total.toLocaleString('en-US', { minimumFractionDigits:2 })}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Search */}
      <input placeholder="Search expenses..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, marginBottom:'1rem' }} />

      {/* Table */}
      {loading ? <p style={{ color:'#64748b' }}>Loading...</p> : (
        <div style={{ background:'#0f172a', borderRadius:16, border:'1px solid #1e293b', overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e293b', background:'#0a0f1a' }}>
                {['Date','Category','Description','Amount','Paid By',''].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding:'2.5rem', textAlign:'center', color:'#475569' }}>No expenses found</td></tr>
              ) : filtered.map((e, idx) => {
                const col = CAT_COLORS[e.category] || CAT_COLORS['Other']
                return (
                  <tr key={e.id} style={{ borderBottom:'1px solid #1e293b', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <td style={{ ...S.td, fontFamily:'monospace', fontSize:13 }}>{e.expense_date || '—'}</td>
                    <td style={S.td}>
                      <span style={{ background:col.bg, color:col.color, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>{e.category || '—'}</span>
                    </td>
                    <td style={{ ...S.td, fontWeight:600, color:'#f1f5f9' }}>{e.description}</td>
                    <td style={{ ...S.td, fontWeight:800, color:'#4ade80', fontSize:15 }}>${(e.amount||0).toLocaleString('en-US', { minimumFractionDigits:2 })}</td>
                    <td style={S.td}>{e.paid_by || '—'}</td>
                    <td style={{ padding:'13px 14px' }}>
                      <button onClick={() => handleDelete(e.id)} style={{ background:'#450a0a', color:'#fca5a5', border:'none', borderRadius:6, padding:'4px 12px', fontSize:12, cursor:'pointer', fontWeight:600 }}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ borderTop:'2px solid #1e293b', background:'#0a0f1a' }}>
                  <td colSpan={3} style={{ padding:'13px 14px', fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>Total ({filtered.length} expenses)</td>
                  <td style={{ padding:'13px 14px', fontSize:16, fontWeight:800, color:'#4ade80' }}>${filtered.reduce((s,e) => s+(e.amount||0),0).toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' }}>
          <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:20, padding:'2rem', width:'100%', maxWidth:480 }}>
            <h2 style={{ fontSize:18, fontWeight:700, color:'#f1f5f9', margin:'0 0 1.5rem' }}>Add Expense</h2>
            <div style={{ marginBottom:'1rem' }}>
              <label style={{ fontSize:12, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category:e.target.value })} style={S.select}>
                {['Fuel','Supplies','Equipment','Insurance','Payroll','Other'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            {[
              { label:'Description *', key:'description', type:'text' },
              { label:'Amount ($) *',  key:'amount',      type:'number' },
              { label:'Paid By',       key:'paid_by',     type:'text' },
              { label:'Date',          key:'expense_date', type:'date' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:'1rem' }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>{f.label}</label>
                <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]:e.target.value })} style={S.input} />
              </div>
            ))}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:'1.5rem' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding:'10px 20px', border:'1px solid #1e293b', borderRadius:10, background:'transparent', color:'#cbd5e1', cursor:'pointer', fontSize:14, fontFamily:'inherit' }}>Cancel</button>
              <button onClick={handleAdd} style={{ padding:'10px 20px', border:'none', borderRadius:10, background:'#16a34a', color:'#fff', cursor:'pointer', fontSize:14, fontWeight:600, fontFamily:'inherit' }}>Save Expense</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
