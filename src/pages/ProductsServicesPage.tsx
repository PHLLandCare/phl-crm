import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Item {
  id: string
  name: string
  description: string
  category: string
  type: 'Product' | 'Service'
  unit_cost: number
  markup_pct: number
  unit_price: number
  unit: string
  taxable: boolean
  image_url: string
  created_at: string
}

const UNITS = ['each','hr','sq ft','sq yd','acre','lb','bag','yard','load','flat','pallet','gal','ton']

const blankItem = (): Partial<Item> => ({
  name: '', description: '', category: '', type: 'Service',
  unit_cost: 0, markup_pct: 0, unit_price: 0, unit: 'each',
  taxable: false, image_url: '',
})

export default function ProductsServicesPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'All' | 'Product' | 'Service'>('All')
  const [selected, setSelected] = useState<Item | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Item>>(blankItem())
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('products_services').select('*').order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = items.filter(i => {
    const matchType = typeFilter === 'All' || i.type === typeFilter
    const matchSearch = !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.category?.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  const fmtPrice = (n: number) => `$${(n || 0).toFixed(2)}`

  const handleSave = async () => {
    setSaving(true)
    if (editing && selected) {
      await supabase.from('products_services').update(form).eq('id', selected.id)
    } else {
      await supabase.from('products_services').insert(form)
    }
    setSaving(false)
    setEditing(false)
    setShowNew(false)
    setSelected(null)
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return
    await supabase.from('products_services').delete().eq('id', id)
    setSelected(null)
    load()
  }

  const handleImageUpload = async (file: File) => {
    setUploading(true)
    const path = `products/${Date.now()}_${file.name}`
    const { data } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
    if (data) {
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
      setForm(f => ({ ...f, image_url: publicUrl }))
    }
    setUploading(false)
  }

  const calcPrice = (cost: number, markup: number) => parseFloat((cost * (1 + markup / 100)).toFixed(2))

  const openEdit = (item: Item) => {
    setForm({ ...item })
    setEditing(true)
    setShowNew(true)
    setSelected(null)
  }

  const openNew = () => {
    setForm(blankItem())
    setEditing(false)
    setShowNew(true)
    setSelected(null)
  }

  // ── Detail panel ────────────────────────────────────────────────────────────
  if (selected && !showNew) {
    return (
      <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
        <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, padding: '0 0 1rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Back to {selected.type === 'Product' ? 'Products' : 'Services'}
        </button>

        <div style={{ background: '#0f172a', borderRadius: 16, border: '1px solid #1e293b', overflow: 'hidden' }}>
          {/* Hero */}
          <div style={{ display: 'flex', gap: 0 }}>
            {/* Image */}
            <div style={{ width: 240, flexShrink: 0, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              {selected.image_url ? (
                <img src={selected.image_url} alt={selected.name} style={{ width: '100%', height: 200, objectFit: 'cover' }} />
              ) : (
                <div style={{ fontSize: 64, textAlign: 'center' }}>{selected.type === 'Product' ? '📦' : '🔧'}</div>
              )}
            </div>
            {/* Info */}
            <div style={{ flex: 1, padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ background: selected.type === 'Product' ? 'rgba(96,165,250,0.15)' : 'rgba(74,222,128,0.15)', color: selected.type === 'Product' ? '#60a5fa' : '#4ade80', padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{selected.type}</span>
                  <h1 style={{ margin: '8px 0 4px', fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>{selected.name}</h1>
                  {selected.category && <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{selected.category}</p>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openEdit(selected)} style={{ padding: '8px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Edit</button>
                  <button onClick={() => handleDelete(selected.id)} style={{ padding: '8px 16px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, color: '#f87171', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Delete</button>
                </div>
              </div>
              {selected.description && (
                <p style={{ margin: '1rem 0 0', fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>{selected.description}</p>
              )}
            </div>
          </div>

          {/* Pricing */}
          <div style={{ borderTop: '1px solid #1e293b', padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
            {[
              { label: 'Unit Cost', value: fmtPrice(selected.unit_cost), sub: 'Your cost', color: '#f87171' },
              { label: 'Markup', value: `${selected.markup_pct || 0}%`, sub: 'Markup %', color: '#fbbf24' },
              { label: 'Unit Price', value: fmtPrice(selected.unit_price), sub: 'Billed to client', color: '#4ade80' },
              { label: 'Unit', value: selected.unit || 'each', sub: 'Per unit', color: '#60a5fa' },
            ].map(s => (
              <div key={s.label} style={{ background: '#0a0f1a', borderRadius: 10, padding: '1rem', border: '1px solid #1e293b' }}>
                <p style={{ margin: '0 0 4px', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</p>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#475569' }}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Details */}
          <div style={{ borderTop: '1px solid #1e293b', padding: '1.5rem' }}>
            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>Details</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div><p style={{ margin: '0 0 2px', fontSize: 11, color: '#64748b' }}>TYPE</p><p style={{ margin: 0, fontSize: 14, color: '#f1f5f9' }}>{selected.type}</p></div>
              <div><p style={{ margin: '0 0 2px', fontSize: 11, color: '#64748b' }}>CATEGORY</p><p style={{ margin: 0, fontSize: 14, color: '#f1f5f9' }}>{selected.category || '—'}</p></div>
              <div><p style={{ margin: '0 0 2px', fontSize: 11, color: '#64748b' }}>TAXABLE</p><p style={{ margin: 0, fontSize: 14, color: selected.taxable ? '#4ade80' : '#94a3b8' }}>{selected.taxable ? 'Yes' : 'No'}</p></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── New / Edit modal form ───────────────────────────────────────────────────
  if (showNew) {
    const costNum = parseFloat(String(form.unit_cost)) || 0
    const markupNum = parseFloat(String(form.markup_pct)) || 0
    return (
      <div style={{ padding: '2rem', maxWidth: 700, margin: '0 auto', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
        <button onClick={() => { setShowNew(false); setEditing(false) }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, padding: '0 0 1rem', fontFamily: 'inherit' }}>← Cancel</button>
        <div style={{ background: '#0f172a', borderRadius: 16, border: '1px solid #1e293b', padding: '1.5rem' }}>
          <h2 style={{ margin: '0 0 1.5rem', fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>{editing ? 'Edit Item' : 'New Item'}</h2>

          {/* Type selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
            {(['Service', 'Product'] as const).map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `2px solid ${form.type === t ? '#16a34a' : '#1e293b'}`, background: form.type === t ? 'rgba(22,163,74,0.1)' : '#0a0f1a', color: form.type === t ? '#4ade80' : '#64748b', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>
                {t === 'Service' ? '🔧 Service' : '📦 Product'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1rem' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block' }}>Name *</label>
              <input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Lawn Mowing - Weekly" style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block' }}>Description</label>
              <textarea value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Optional description..." style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block' }}>Category</label>
              <input value={form.category || ''} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Lawn Care" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block' }}>Unit</label>
              <select value={form.unit || 'each'} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={inputStyle}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block' }}>Unit Cost ($)</label>
              <input type="number" min="0" step="0.01" value={form.unit_cost || ''} onChange={e => { const c = parseFloat(e.target.value)||0; setForm(f => ({ ...f, unit_cost: c, unit_price: calcPrice(c, markupNum) })) }} placeholder="0.00" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block' }}>Markup %</label>
              <input type="number" min="0" max="1000" step="1" value={form.markup_pct || ''} onChange={e => { const m = parseFloat(e.target.value)||0; setForm(f => ({ ...f, markup_pct: m, unit_price: calcPrice(costNum, m) })) }} placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block' }}>Unit Price ($) <span style={{ color: '#475569' }}>(auto-calculated)</span></label>
              <input type="number" min="0" step="0.01" value={form.unit_price || ''} onChange={e => setForm(f => ({ ...f, unit_price: parseFloat(e.target.value) || 0 }))} placeholder="0.00" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
              <input type="checkbox" id="taxable" checked={!!form.taxable} onChange={e => setForm(f => ({ ...f, taxable: e.target.checked }))} />
              <label htmlFor="taxable" style={{ fontSize: 14, color: '#cbd5e1', cursor: 'pointer' }}>Taxable</label>
            </div>
          </div>

          {/* Image upload */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontSize: 12, color: '#64748b', marginBottom: 8, display: 'block' }}>Image (optional)</label>
            {form.image_url && <img src={form.image_url} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', marginBottom: 8 }} />}
            <label style={{ display: 'inline-block', padding: '8px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#cbd5e1', cursor: 'pointer', fontSize: 13 }}>
              {uploading ? 'Uploading...' : '📷 Upload Image'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]) }} />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowNew(false); setEditing(false) }} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #1e293b', borderRadius: 8, color: '#64748b', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={handleSave} disabled={!form.name || saving} style={{ padding: '10px 24px', background: form.name ? '#16a34a' : '#1e293b', color: form.name ? '#fff' : '#475569', border: 'none', borderRadius: 8, cursor: form.name ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── List view ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', margin: '0 0 4px' }}>Products & Services</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>{items.length.toLocaleString()} items in catalog</p>
        </div>
        <button onClick={openNew} style={{ padding: '10px 20px', background: '#16a34a', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>+ Add Item</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..." style={{ padding: '9px 14px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, color: '#f1f5f9', fontSize: 14, fontFamily: 'inherit', outline: 'none', minWidth: 220 }} />
        <div style={{ display: 'flex', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden' }}>
          {(['All', 'Service', 'Product'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{ padding: '9px 16px', border: 'none', background: typeFilter === t ? '#16a34a' : 'transparent', color: typeFilter === t ? '#fff' : '#64748b', cursor: 'pointer', fontWeight: typeFilter === t ? 700 : 400, fontSize: 13, fontFamily: 'inherit' }}>{t}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>Loading...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
          {filtered.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: '#64748b' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', margin: '0 0 8px' }}>No items yet</p>
              <p style={{ fontSize: 14, margin: '0 0 16px' }}>Add products & services to your catalog</p>
              <button onClick={openNew} style={{ padding: '10px 20px', background: '#16a34a', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>+ Add Item</button>
            </div>
          ) : filtered.map(item => (
            <div key={item.id} onClick={() => setSelected(item)} style={{ background: '#0f172a', borderRadius: 14, border: '1px solid #1e293b', cursor: 'pointer', overflow: 'hidden', transition: 'border-color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#4ade80')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e293b')}>
              {/* Card image */}
              <div style={{ height: 140, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 48 }}>{item.type === 'Product' ? '📦' : '🔧'}</span>
                )}
              </div>
              <div style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ background: item.type === 'Product' ? 'rgba(96,165,250,0.15)' : 'rgba(74,222,128,0.15)', color: item.type === 'Product' ? '#60a5fa' : '#4ade80', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{item.type}</span>
                  {item.taxable && <span style={{ fontSize: 11, color: '#fbbf24' }}>Taxable</span>}
                </div>
                <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</p>
                {item.category && <p style={{ margin: '0 0 10px', fontSize: 12, color: '#64748b' }}>{item.category}</p>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#4ade80' }}>{fmtPrice(item.unit_price)}</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#475569' }}>per {item.unit || 'each'}</p>
                  </div>
                  {item.markup_pct > 0 && <span style={{ fontSize: 12, color: '#fbbf24' }}>{item.markup_pct}% markup</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: '#0a0f1a', border: '1px solid #1e293b',
  borderRadius: 8, color: '#f1f5f9', fontSize: 14, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
}
