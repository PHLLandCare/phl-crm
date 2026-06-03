import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface InventoryItem {
  id: string
  name: string
  category: string
  sku: string
  quantity: number
  min_level: number
  unit_cost: number
}

const S = {
  page:   { padding:'2rem', maxWidth:1200, margin:'0 auto', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' },
  h1:     { fontSize:24, fontWeight:700, color:'#f1f5f9', margin:'0 0 4px' },
  sub:    { fontSize:14, color:'#64748b', margin:0 },
  card:   (color:string) => ({ background:color, borderRadius:14, padding:'1rem 1.25rem', border:'1px solid #1e293b' }),
  lbl:    { fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase' as const, letterSpacing:'0.05em', margin:'0 0 4px' },
  val:    { fontSize:22, fontWeight:800, color:'#f1f5f9', margin:0 },
  input:  { width:'100%', height:44, padding:'0 14px', background:'#0f172a', border:'1.5px solid #1e293b', borderRadius:10, fontSize:14, boxSizing:'border-box' as const, outline:'none', color:'#f1f5f9', fontFamily:'inherit' },
  select: { width:'100%', height:44, padding:'0 12px', background:'#0f172a', border:'1.5px solid #1e293b', borderRadius:10, fontSize:14, boxSizing:'border-box' as const, outline:'none', color:'#f1f5f9', fontFamily:'inherit' },
  th:     { padding:'11px 14px', textAlign:'left' as const, fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase' as const, letterSpacing:'0.05em', whiteSpace:'nowrap' as const },
  td:     { padding:'13px 14px', fontSize:14, color:'#cbd5e1' },
}

export default function InventoryPage() {
  const [items, setItems]     = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState({ name:'', category:'Lawn & Tree Supplies', sku:'', quantity:'', min_level:'', unit_cost:'' })

  const loadItems = async () => {
    setLoading(true)
    const { data } = await supabase.from('inventory').select('*').is('deleted_at', null).order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadItems()
    const ch = supabase.channel('inventory').on('postgres_changes', { event:'*', schema:'public', table:'inventory' }, loadItems).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const handleAdd = async () => {
    if (!form.name) return
    await supabase.from('inventory').insert({ ...form, quantity: parseFloat(form.quantity)||0, min_level: parseFloat(form.min_level)||0, unit_cost: parseFloat(form.unit_cost)||0 })
    setShowAdd(false)
    setForm({ name:'', category:'Lawn & Tree Supplies', sku:'', quantity:'', min_level:'', unit_cost:'' })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return
    await supabase.from('inventory').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  }

  const filtered    = items.filter(i => `${i.name} ${i.category} ${i.sku}`.toLowerCase().includes(search.toLowerCase()))
  const totalValue  = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)
  const lowStock    = items.filter(i => i.quantity <= i.min_level && i.quantity > 0).length
  const outOfStock  = items.filter(i => i.quantity <= 0).length

  const status = (i: InventoryItem) =>
    i.quantity <= 0            ? { label:'Out of Stock', bg:'#450a0a', color:'#fca5a5' }
    : i.quantity <= i.min_level ? { label:'Low Stock',    bg:'#422006', color:'#fcd34d' }
    :                             { label:'In Stock',     bg:'#052e16', color:'#4ade80' }

  return (
    <div style={{ ...S.page, background:'#0a0f1a', minHeight:'100vh' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={S.h1}>Inventory</h1>
          <p style={S.sub}>{items.length} items · Total value: ${totalValue.toLocaleString()}</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer' }}>+ Add Item</button>
      </div>

      {/* KPI cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginBottom:'1.5rem' }}>
        {[
          { label:'Total Items',   value: items.length,                   accent:'#f1f5f9' },
          { label:'Low Stock',     value: lowStock,                       accent:'#fcd34d' },
          { label:'Out of Stock',  value: outOfStock,                     accent:'#fca5a5' },
          { label:'Total Value',   value:`$${totalValue.toLocaleString()}`, accent:'#4ade80' },
        ].map(s => (
          <div key={s.label} style={S.card('#0f172a')}>
            <p style={S.lbl}>{s.label}</p>
            <p style={{ ...S.val, color: s.accent }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <input placeholder="Search inventory..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, marginBottom:'1rem' }} />

      {/* Table */}
      {loading ? <p style={{ color:'#64748b' }}>Loading...</p> : (
        <div style={{ background:'#0f172a', borderRadius:16, border:'1px solid #1e293b', overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:800 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e293b', background:'#0a0f1a' }}>
                {['Name','Category','SKU','In Stock','Min Level','Unit Cost','Total Value','Status',''].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ padding:'2.5rem', textAlign:'center', color:'#475569' }}>No items found</td></tr>
              ) : filtered.map((i, idx) => {
                const s = status(i)
                return (
                  <tr key={i.id} style={{ borderBottom:'1px solid #1e293b', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <td style={{ ...S.td, fontWeight:600, color:'#f1f5f9' }}>{i.name}</td>
                    <td style={S.td}>{i.category || '—'}</td>
                    <td style={{ ...S.td, fontFamily:'monospace', fontSize:12 }}>{i.sku || '—'}</td>
                    <td style={{ ...S.td, fontWeight:700, color: i.quantity <= 0 ? '#fca5a5' : i.quantity <= i.min_level ? '#fcd34d' : '#f1f5f9' }}>{i.quantity}</td>
                    <td style={S.td}>{i.min_level}</td>
                    <td style={S.td}>${i.unit_cost}</td>
                    <td style={{ ...S.td, fontWeight:600 }}>${(i.quantity * i.unit_cost).toFixed(2)}</td>
                    <td style={S.td}>
                      <span style={{ background:s.bg, color:s.color, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>{s.label}</span>
                    </td>
                    <td style={{ padding:'13px 14px' }}>
                      <button onClick={() => handleDelete(i.id)} style={{ background:'#450a0a', color:'#fca5a5', border:'none', borderRadius:6, padding:'4px 12px', fontSize:12, cursor:'pointer', fontWeight:600 }}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' }}>
          <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:20, padding:'2rem', width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto' }}>
            <h2 style={{ fontSize:18, fontWeight:700, color:'#f1f5f9', margin:'0 0 1.5rem' }}>Add Inventory Item</h2>
            {[
              { label:'Name *',      key:'name',      type:'text' },
              { label:'SKU / Part #', key:'sku',      type:'text' },
              { label:'Quantity',    key:'quantity',  type:'number' },
              { label:'Min Level',   key:'min_level', type:'number' },
              { label:'Unit Cost ($)', key:'unit_cost', type:'number' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:'1rem' }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>{f.label}</label>
                <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} style={S.input} />
              </div>
            ))}
            <div style={{ marginBottom:'1.5rem' }}>
              <label style={{ fontSize:12, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={S.select}>
                {['Lawn & Tree Supplies','Irrigation Parts','Pest Control','Nursery Plants','Farm Supplies','Equipment','Vehicles','Safety Gear','Office Supplies'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding:'10px 20px', border:'1px solid #1e293b', borderRadius:10, background:'transparent', color:'#cbd5e1', cursor:'pointer', fontSize:14, fontFamily:'inherit' }}>Cancel</button>
              <button onClick={handleAdd} style={{ padding:'10px 20px', border:'none', borderRadius:10, background:'#16a34a', color:'#fff', cursor:'pointer', fontSize:14, fontWeight:600, fontFamily:'inherit' }}>Save Item</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
