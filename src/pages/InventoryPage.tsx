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
  unit: string
  supplier: string
  notes: string
  year: string
  make: string
  model: string
  mileage: string
  last_serviced: string
  car_payment: string
  car_insurance: string
  gps_system: string
}

const CATEGORIES = [
  'Fertilizers & Chemicals','Seeds & Plants','Equipment & Tools',
  'Irrigation Parts','Safety Gear','Fuel & Lubricants',
  'Nursery Stock','Office Supplies',
  'Vehicles','Mowers','Blowers','Edgers','Weed Eaters',
  'Car Payment','Car Insurance','GPS System','Other'
]

const VEHICLE_CATS = ['Vehicles','Mowers','Blowers','Edgers','Weed Eaters','Car Payment','Car Insurance','GPS System']

const inp = {width:'100%',height:44,padding:'0 12px',background:'#1e293b',border:'1.5px solid #334155',borderRadius:10,fontSize:14,boxSizing:'border-box' as const,outline:'none',color:'#f1f5f9',fontFamily:'inherit'}
const lbl = {fontSize:12,fontWeight:600,color:'#94a3b8',textTransform:'uppercase' as const,letterSpacing:'0.05em',display:'block',marginBottom:6}

export default function InventoryPage() {
  const [items, setItems]     = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [showAdd, setShowAdd]   = useState(false)
  const [editing, setEditing]   = useState<InventoryItem|null>(null)
  const [toast, setToast]       = useState('')
  const showToast = (msg: string) => { setToast(msg); setTimeout(()=>setToast(''), 3000) }
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showAdjust, setShowAdjust] = useState<InventoryItem|null>(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('Restock')
  const [form, setForm]       = useState({
    name:'',category:'Equipment & Tools',sku:'',quantity:'',min_level:'',unit_cost:'',unit:'each',supplier:'',notes:'',
    year:'',make:'',model:'',mileage:'',last_serviced:'',car_payment:'',car_insurance:'',gps_system:''
  })

  const loadItems = async () => {
    setLoading(true)
    const { data } = await supabase.from('inventory').select('*').is('deleted_at',null).order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadItems()
    const ch = supabase.channel('inventory').on('postgres_changes',{event:'*',schema:'public',table:'inventory'},loadItems).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const isVehicle = VEHICLE_CATS.includes(form.category)

  const handleAdd = async () => {
    if (!form.name) return
    const payload = { ...form, quantity: parseFloat(form.quantity)||0, min_level: parseFloat(form.min_level)||0, unit_cost: parseFloat(form.unit_cost)||0 }
    if (editing) {
      await supabase.from('inventory').update(payload).eq('id', editing.id)
      showToast('✅ Item updated!')
      setEditing(null)
    } else {
      await supabase.from('inventory').insert(payload)
      showToast('✅ Item added!')
    }
    setShowAdd(false)
    setForm({name:'',category:'Equipment & Tools',sku:'',quantity:'',min_level:'',unit_cost:'',unit:'each',supplier:'',notes:'',year:'',make:'',model:'',mileage:'',last_serviced:'',car_payment:'',car_insurance:'',gps_system:''})
  }

  const handleAdjust = async () => {
    if (!showAdjust || !adjustQty) return
    const newQty = Math.max(0, (showAdjust.quantity||0) + parseFloat(adjustQty))
    await supabase.from('inventory').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', showAdjust.id)
    showToast(`✅ Quantity adjusted to ${newQty}`)
    setShowAdjust(null); setAdjustQty('')
    loadItems()
  }

  const handleDelete = async (id:string) => {
    if (!confirm('Delete this item?')) return
    await supabase.from('inventory').update({deleted_at:new Date().toISOString()}).eq('id',id)
  }

  const filtered = items.filter(i => `${i.name} ${i.category} ${i.sku}`.toLowerCase().includes(search.toLowerCase()) && (categoryFilter === 'All' || i.category === categoryFilter))
  const totalValue = items.reduce((s,i) => s+(i.quantity*i.unit_cost),0)
  const lowStock   = items.filter(i => i.quantity<=i.min_level && i.quantity>0).length
  const outOfStock = items.filter(i => i.quantity<=0).length

  const exportCSV = () => {
    const rows = [['Name','Category','SKU','Quantity','Min Level','Unit Cost','Total Value','Supplier','Status']]
    items.forEach(i => rows.push([i.name,i.category||'',i.sku||'',String(i.quantity||0),String(i.min_level||0),String(i.unit_cost||0),String((i.quantity||0)*(i.unit_cost||0)),i.supplier||'',statusBadge(i).label]))
    const csv = rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n')
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='inventory.csv';a.click()
  }

  const statusBadge = (i:InventoryItem) =>
    i.quantity<=0            ? {label:'Out of Stock',bg:'#450a0a',color:'#fca5a5'}
    : i.quantity<=i.min_level ? {label:'Low Stock',  bg:'#422006',color:'#fcd34d'}
    :                           {label:'In Stock',   bg:'#052e16',color:'#4ade80'}

  return (
    <div style={{padding:'2rem',maxWidth:1300,margin:'0 auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>

      {toast && <div style={{position:'fixed',top:'1rem',right:'1rem',background:'#052e16',border:'1px solid #16a34a',borderRadius:10,padding:'10px 18px',fontSize:14,color:'#4ade80',fontWeight:600,zIndex:9999}}>{toast}</div>}

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'#f1f5f9',margin:'0 0 4px'}}>Inventory</h1>
          <p style={{fontSize:14,color:'#64748b',margin:0}}>{items.length} items · Total value: ${totalValue.toLocaleString()}</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={exportCSV} style={{padding:'10px 16px',background:'#1e293b',border:'1px solid #334155',borderRadius:10,color:'#94a3b8',cursor:'pointer',fontSize:13,fontFamily:'inherit',fontWeight:600}}>📥 Export CSV</button>
          <button onClick={()=>{setEditing(null);setShowAdd(true)}} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:'pointer'}}>+ Add Item</button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12,marginBottom:'1.5rem'}}>
        {[
          {label:'Total Items',  value:items.length,                    color:'#f1f5f9'},
          {label:'Low Stock',    value:lowStock,                        color:'#fcd34d'},
          {label:'Out of Stock', value:outOfStock,                      color:'#fca5a5'},
          {label:'Total Value',  value:`$${totalValue.toLocaleString()}`,color:'#4ade80'},
        ].map(s=>(
          <div key={s.label} style={{background:'#0f172a',borderRadius:12,padding:'1rem',border:'1px solid #1e293b',borderTop:`3px solid ${s.color}`}}>
            <p style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 4px'}}>{s.label}</p>
            <p style={{fontSize:22,fontWeight:800,color:s.color,margin:0}}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <input placeholder="Search inventory..." value={search} onChange={e=>setSearch(e.target.value)}
        style={{...inp,marginBottom:'1rem',background:'#0f172a',border:'1.5px solid #1e293b'}} />

      {/* Table */}
      {loading ? <p style={{color:'#64748b'}}>Loading...</p> : (
        <div style={{background:'#0f172a',borderRadius:16,border:'1px solid #1e293b',overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}>
            <thead>
              <tr style={{borderBottom:'1px solid #1e293b',background:'#0a0f1a'}}>
                {['Name','Category','SKU/Part#','Year/Make/Model','In Stock','Min Level','Unit Cost','Total Value','Status',''].map(h=>(
                  <th key={h} style={{padding:'11px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={10} style={{padding:'2.5rem',textAlign:'center',color:'#475569'}}>No items found</td></tr>
              ) : filtered.map((i,idx)=>{
                const s = statusBadge(i)
                const vehicleInfo = [i.year,i.make,i.model].filter(Boolean).join(' ')
                return (
                  <tr key={i.id} style={{borderBottom:'1px solid #1e293b',background:idx%2===0?'transparent':'rgba(255,255,255,0.02)'}}>
                    <td style={{padding:'12px 14px',fontWeight:600,color:'#f1f5f9',fontSize:14}}>{i.name}</td>
                    <td style={{padding:'12px 14px',fontSize:13,color:'#94a3b8'}}>{i.category||'—'}</td>
                    <td style={{padding:'12px 14px',fontSize:12,color:'#64748b',fontFamily:'monospace'}}>{i.sku||'—'}</td>
                    <td style={{padding:'12px 14px',fontSize:13,color:'#94a3b8'}}>{vehicleInfo||'—'}</td>
                    <td style={{padding:'12px 14px',fontWeight:700,color:i.quantity<=0?'#fca5a5':i.quantity<=i.min_level?'#fcd34d':'#f1f5f9'}}>{i.quantity}</td>
                    <td style={{padding:'12px 14px',fontSize:13,color:'#64748b'}}>{i.min_level}</td>
                    <td style={{padding:'12px 14px',fontSize:13,color:'#94a3b8'}}>${i.unit_cost}</td>
                    <td style={{padding:'12px 14px',fontSize:13,fontWeight:600,color:'#f1f5f9'}}>${(i.quantity*i.unit_cost).toFixed(2)}</td>
                    <td style={{padding:'12px 14px'}}>
                      <span style={{background:s.bg,color:s.color,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700}}>{s.label}</span>
                    </td>
                    <td style={{padding:'12px 14px',display:'flex',gap:5}}>
                      <button onClick={()=>{setShowAdjust(i);setAdjustQty('')}} style={{background:'rgba(96,165,250,0.1)',color:'#60a5fa',border:'1px solid rgba(96,165,250,0.2)',borderRadius:6,padding:'4px 9px',fontSize:11,cursor:'pointer',fontWeight:600}}>±</button>
                      <button onClick={()=>{setEditing(i);setForm({name:i.name,category:i.category||'Equipment & Tools',sku:i.sku||'',quantity:String(i.quantity||0),min_level:String(i.min_level||0),unit_cost:String(i.unit_cost||0),unit:i.unit||'each',supplier:i.supplier||'',notes:i.notes||'',year:i.year||'',make:i.make||'',model:i.model||'',mileage:i.mileage||'',last_serviced:i.last_serviced||'',car_payment:i.car_payment||'',car_insurance:i.car_insurance||'',gps_system:i.gps_system||''});setShowAdd(true)}} style={{background:'rgba(74,222,128,0.1)',color:'#4ade80',border:'1px solid rgba(74,222,128,0.2)',borderRadius:6,padding:'4px 9px',fontSize:11,cursor:'pointer',fontWeight:600}}>Edit</button>
                      <button onClick={()=>handleDelete(i.id)} style={{background:'#450a0a',color:'#fca5a5',border:'none',borderRadius:6,padding:'4px 9px',fontSize:11,cursor:'pointer',fontWeight:600}}>Del</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'1rem'}}>
          <div style={{background:'#0f172a',border:'1px solid #1e293b',borderRadius:20,padding:'2rem',width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
              <h2 style={{fontSize:18,fontWeight:700,color:'#f1f5f9',margin:0}}>{editing ? 'Edit Item' : '+ Add Inventory Item'}</h2>
              <button onClick={()=>setShowAdd(false)} style={{background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer',lineHeight:1}}>×</button>
            </div>

            {/* Name */}
            <div style={{marginBottom:'1rem'}}>
              <label style={lbl}>Item Name *</label>
              <input placeholder="e.g. 20-20-20 Fertilizer" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={inp} />
            </div>

            {/* Category + SKU */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:'1rem'}}>
              <div>
                <label style={lbl}>Category</label>
                <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}
                  style={{...inp,padding:'0 10px'}}>
                  {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>SKU / Part #</label>
                <input placeholder="e.g. FRT-2020" value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})} style={inp} />
              </div>
            </div>

            {/* Qty + Min Stock + Unit */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:'1rem'}}>
              <div>
                <label style={lbl}>Quantity</label>
                <input type="number" placeholder="0" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} style={inp} />
              </div>
              <div>
                <label style={lbl}>Min Stock Level</label>
                <input type="number" placeholder="Alert when below..." value={form.min_level} onChange={e=>setForm({...form,min_level:e.target.value})} style={inp} />
              </div>
              <div>
                <label style={lbl}>Unit</label>
                <select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} style={{...inp,padding:'0 10px'}}>
                  {['each','bag','gallon','lb','oz','box','pallet','roll','pair'].map(u=><option key={u}>{u}</option>)}
                </select>
              </div>
            </div>

            {/* Unit Cost + Supplier */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:'1rem'}}>
              <div>
                <label style={lbl}>Unit Cost ($)</label>
                <input type="number" placeholder="0.00" value={form.unit_cost} onChange={e=>setForm({...form,unit_cost:e.target.value})} style={inp} />
              </div>
              <div>
                <label style={lbl}>Supplier</label>
                <input placeholder="e.g. SiteOne Landscape Supply" value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})} style={inp} />
              </div>
            </div>

            {/* Vehicle / Equipment fields */}
            {isVehicle && (
              <>
                <div style={{borderTop:'1px solid #1e293b',margin:'1rem 0',paddingTop:'1rem'}}>
                  <p style={{fontSize:12,fontWeight:700,color:'#4ade80',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 12px'}}>🚗 Vehicle / Equipment Details</p>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:'1rem'}}>
                  <div>
                    <label style={lbl}>Year</label>
                    <input placeholder="2022" value={form.year} onChange={e=>setForm({...form,year:e.target.value})} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Make</label>
                    <input placeholder="Ford" value={form.make} onChange={e=>setForm({...form,make:e.target.value})} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Model</label>
                    <input placeholder="F-150" value={form.model} onChange={e=>setForm({...form,model:e.target.value})} style={inp} />
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:'1rem'}}>
                  <div>
                    <label style={lbl}>Mileage</label>
                    <input placeholder="e.g. 45,230" value={form.mileage} onChange={e=>setForm({...form,mileage:e.target.value})} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Last Serviced</label>
                    <input type="date" value={form.last_serviced} onChange={e=>setForm({...form,last_serviced:e.target.value})} style={inp} />
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:'1rem'}}>
                  <div>
                    <label style={lbl}>Car Payment / mo</label>
                    <input placeholder="$0.00" value={form.car_payment} onChange={e=>setForm({...form,car_payment:e.target.value})} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Insurance / mo</label>
                    <input placeholder="$0.00" value={form.car_insurance} onChange={e=>setForm({...form,car_insurance:e.target.value})} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>GPS System</label>
                    <input placeholder="e.g. Samsara" value={form.gps_system} onChange={e=>setForm({...form,gps_system:e.target.value})} style={inp} />
                  </div>
                </div>
              </>
            )}

            {/* Notes */}
            <div style={{marginBottom:'1.5rem'}}>
              <label style={lbl}>Notes</label>
              <textarea placeholder="Storage location, special instructions, etc." value={form.notes}
                onChange={e=>setForm({...form,notes:e.target.value})}
                style={{...inp,height:80,padding:'10px 12px',resize:'vertical' as const}} />
            </div>

            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowAdd(false)} style={{padding:'11px 24px',border:'1px solid #334155',borderRadius:10,background:'#1e293b',color:'#cbd5e1',cursor:'pointer',fontSize:14,fontFamily:'inherit'}}>Cancel</button>
              <button onClick={handleAdd} style={{padding:'11px 24px',border:'none',borderRadius:10,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700,fontFamily:'inherit'}}>Add Item</button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Quantity Modal */}
      {showAdjust && (
        <>
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:500}} onClick={()=>setShowAdjust(null)} />
          <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:360,background:'#0d1526',border:'1px solid #1e293b',borderRadius:16,zIndex:501,padding:24}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{margin:0,fontSize:16,fontWeight:700,color:'#f1f5f9'}}>Adjust Quantity</h2>
              <button onClick={()=>setShowAdjust(null)} style={{background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer'}}>×</button>
            </div>
            <p style={{margin:'0 0 12px',fontSize:13,color:'#64748b'}}>{showAdjust.name} — Current: <strong style={{color:'#f1f5f9'}}>{showAdjust.quantity} {showAdjust.unit}</strong></p>
            <label style={lbl}>Adjustment (+ add / - remove)</label>
            <input type="number" style={{...inp,marginBottom:12}} placeholder="+10 or -5" value={adjustQty} onChange={e=>setAdjustQty(e.target.value)} />
            <label style={lbl}>Reason</label>
            <select style={{...inp,padding:'0 10px',marginBottom:20}} value={adjustReason} onChange={e=>setAdjustReason(e.target.value)}>
              {['Restock','Used on Job','Damaged','Inventory Count','Other'].map(r=><option key={r}>{r}</option>)}
            </select>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowAdjust(null)} style={{padding:'9px 18px',border:'1px solid #1e293b',borderRadius:8,background:'transparent',color:'#64748b',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>Cancel</button>
              <button onClick={handleAdjust} style={{padding:'9px 18px',border:'none',borderRadius:8,background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>Apply</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
