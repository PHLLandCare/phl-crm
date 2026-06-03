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

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({name:'',category:'Lawn & Tree Supplies',sku:'',quantity:'',min_level:'',unit_cost:''})

  const loadItems = async () => {
    setLoading(true)
    const { data } = await supabase.from('inventory').select('*').is('deleted_at',null).order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadItems()
    const channel = supabase.channel('inventory')
      .on('postgres_changes',{event:'*',schema:'public',table:'inventory'},loadItems)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleAdd = async () => {
    if (!form.name) return
    await supabase.from('inventory').insert({
      ...form,
      quantity: parseFloat(form.quantity)||0,
      min_level: parseFloat(form.min_level)||0,
      unit_cost: parseFloat(form.unit_cost)||0
    })
    setShowAdd(false)
    setForm({name:'',category:'Lawn & Tree Supplies',sku:'',quantity:'',min_level:'',unit_cost:''})
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return
    await supabase.from('inventory').update({deleted_at:new Date().toISOString()}).eq('id',id)
  }

  const filtered = items.filter(i =>
    `${i.name} ${i.category} ${i.sku}`.toLowerCase().includes(search.toLowerCase())
  )

  const getStatus = (item: InventoryItem) => {
    if (item.quantity <= 0) return {label:'Out of stock',color:'#fef2f2'}
    if (item.quantity <= item.min_level) return {label:'Low stock',color:'#fef9c3'}
    return {label:'In stock',color:'#dcfce7'}
  }

  const totalValue = items.reduce((sum,i) => sum + (i.quantity * i.unit_cost), 0)
  const lowStock = items.filter(i => i.quantity <= i.min_level && i.quantity > 0).length
  const outOfStock = items.filter(i => i.quantity <= 0).length

  return (
    <div style={{padding:'2rem',maxWidth:1200,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'#111827',margin:'0 0 4px'}}>Inventory</h1>
          <p style={{fontSize:14,color:'#6b7280',margin:0}}>{items.length} items · Total value: ${totalValue.toLocaleString()}</p>
        </div>
        <button onClick={()=>setShowAdd(true)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:'pointer'}}>+ Add Item</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginBottom:'1.5rem'}}>
        {[
          {label:'Total Items',value:items.length,color:'#f9fafb'},
          {label:'Low Stock',value:lowStock,color:'#fef9c3'},
          {label:'Out of Stock',value:outOfStock,color:'#fef2f2'},
          {label:'Total Value',value:`$${totalValue.toLocaleString()}`,color:'#dcfce7'},
        ].map(s=>(
          <div key={s.label} style={{background:s.color,borderRadius:12,padding:'1rem',border:'1px solid #e5e7eb'}}>
            <p style={{fontSize:12,color:'#6b7280',margin:'0 0 4px'}}>{s.label}</p>
            <p style={{fontSize:20,fontWeight:700,color:'#111827',margin:0}}>{s.value}</p>
          </div>
        ))}
      </div>

      <input placeholder="Search inventory..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none',marginBottom:'1rem'}} />

      {loading ? <p>Loading...</p> : (
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #e5e7eb',overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'#f9fafb',borderBottom:'1px solid #e5e7eb'}}>
                {['Name','Category','SKU','In Stock','Min Level','Unit Cost','Total Value','Status',''].map(h=>(
                  <th key={h} style={{padding:'12px 16px',textAlign:'left',fontSize:12,fontWeight:600,color:'#6b7280',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={9} style={{padding:'2rem',textAlign:'center',color:'#9ca3af'}}>No items found</td></tr>
              ) : filtered.map(i=>{
                const status = getStatus(i)
                return (
                  <tr key={i.id} style={{borderBottom:'1px solid #f3f4f6'}}>
                    <td style={{padding:'12px 16px',fontSize:14,fontWeight:500}}>{i.name}</td>
                    <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>{i.category||'—'}</td>
                    <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>{i.sku||'—'}</td>
                    <td style={{padding:'12px 16px',fontSize:14,fontWeight:600}}>{i.quantity}</td>
                    <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>{i.min_level}</td>
                    <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>${i.unit_cost}</td>
                    <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>${(i.quantity*i.unit_cost).toFixed(2)}</td>
                    <td style={{padding:'12px 16px'}}>
                      <span style={{background:status.color,padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:500}}>{status.label}</span>
                    </td>
                    <td style={{padding:'12px 16px'}}>
                      <button onClick={()=>handleDelete(i.id)} style={{background:'#fef2f2',color:'#991b1b',border:'none',borderRadius:6,padding:'4px 10px',fontSize:12,cursor:'pointer'}}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'1rem'}}>
          <div style={{background:'#fff',borderRadius:20,padding:'2rem',width:'100%',maxWidth:500,maxHeight:'90vh',overflowY:'auto'}}>
            <h2 style={{fontSize:18,fontWeight:700,margin:'0 0 1.5rem'}}>Add Inventory Item</h2>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Name *</label>
              <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Category</label>
              <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}}>
                {['Lawn & Tree Supplies','Irrigation Parts','Pest Control','Nursery Plants','Farm Supplies','Equipment','Vehicles','Safety Gear','Office Supplies'].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>SKU / Part #</label>
              <input value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Quantity</label>
              <input type="number" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Min Level</label>
              <input type="number" value={form.min_level} onChange={e=>setForm({...form,min_level:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{marginBottom:'1.5rem'}}>
              <label style={{fontSize:13,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Unit Cost ($)</label>
              <input type="number" value={form.unit_cost} onChange={e=>setForm({...form,unit_cost:e.target.value})} style={{width:'100%',height:44,padding:'0 12px',border:'1.5px solid #e5e7eb',borderRadius:10,fontSize:14,boxSizing:'border-box',outline:'none'}} />
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowAdd(false)} style={{padding:'10px 20px',border:'1.5px solid #e5e7eb',borderRadius:10,background:'#fff',cursor:'pointer',fontSize:14}}>Cancel</button>
              <button onClick={handleAdd} style={{padding:'10px 20px',border:'none',borderRadius:10,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:600}}>Save Item</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}