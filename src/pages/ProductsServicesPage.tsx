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
  online_booking: boolean
  image_url: string
  created_at: string
}

const blankItem = (): Partial<Item> => ({
  name: '', description: '', category: '', type: 'Service',
  unit_cost: 0, markup_pct: 0, unit_price: 0, unit: 'each',
  taxable: false, online_booking: true, image_url: '',
})

const calcPrice = (cost: number, markup: number) =>
  parseFloat((cost * (1 + markup / 100)).toFixed(2))

export default function ProductsServicesPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'name' | 'type'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editing, setEditing] = useState<Partial<Item> | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'All' | 'Product' | 'Service'>('All')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('products_services').select('*').order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = items
    .filter(i => {
      const matchSearch = !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase())
      const matchType = typeFilter === 'All' || i.type === typeFilter
      return matchSearch && matchType
    })
    .sort((a, b) => {
      const av = sort === 'name' ? (a.name || '') : (a.type || '')
      const bv = sort === 'name' ? (b.name || '') : (b.type || '')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })


  const toggleSort = (col: 'name' | 'type') => {
    if (sort === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setSortDir('asc') }
  }

  const openNew = () => setEditing(blankItem())
  const openEdit = (item: Item) => setEditing({ ...item })
  const closeEdit = () => setEditing(null)

  const handleSave = async () => {
    if (!editing?.name) return
    setSaving(true)
    if (editing.id) {
      await supabase.from('products_services').update(editing).eq('id', editing.id)
    } else {
      await supabase.from('products_services').insert(editing)
    }
    setSaving(false)
    setEditing(null)
    load()
  }

  const handleDelete = async () => {
    if (!editing?.id || !confirm(`Delete "${editing.name}"?`)) return
    await supabase.from('products_services').delete().eq('id', editing.id)
    setEditing(null)
    load()
  }

  const handleImageUpload = async (file: File) => {
    setUploading(true)
    const path = `products/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
      setEditing(e => e ? { ...e, image_url: publicUrl } : e)
    }
    setUploading(false)
  }

  const removeImage = () => setEditing(e => e ? { ...e, image_url: '' } : e)

  const SortArrow = ({ col }: { col: 'name' | 'type' }) => (
    <span style={{ marginLeft: 4, color: sort === col ? '#4ade80' : '#334155', fontSize: 11 }}>
      {sort === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#0a0f1a', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', margin: '0 0 6px' }}>Products & services</h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
          Add and update your products & services to stay organized when creating quotes, quote templates, jobs, and invoices.
        </p>
      </div>

      {/* Search + Add */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: '1.25rem' }}>
        <div style={{ flex: 1, maxWidth: 460, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: 14 }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search"
            style={{ width: '100%', padding: '10px 36px 10px 36px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, color: '#f1f5f9', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' }}>×</button>
          )}
        </div>
        <button onClick={openNew} style={{ padding: '10px 18px', background: '#16a34a', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          + Add Item
        </button>
      </div>

      {/* Type filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {(['All','Service','Product'] as const).map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            style={{ padding: '6px 16px', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: typeFilter === t ? 700 : 400,
              background: typeFilter === t ? (t === 'Product' ? 'rgba(96,165,250,0.15)' : t === 'Service' ? 'rgba(74,222,128,0.15)' : '#1e293b') : 'transparent',
              color: typeFilter === t ? (t === 'Product' ? '#60a5fa' : t === 'Service' ? '#4ade80' : '#f1f5f9') : '#64748b' }}>
            {t === 'All' ? `All (${items.length})` : t === 'Service' ? `Services (${items.filter(i => i.type === 'Service').length})` : `Products (${items.filter(i => i.type === 'Product').length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
              <th onClick={() => toggleSort('name')} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#94a3b8', cursor: 'pointer', userSelect: 'none', width: '45%' }}>
                Name <SortArrow col="name" />
              </th>
              <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#94a3b8', width: '40%' }}>Description</th>
              <th onClick={() => toggleSort('type')} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#94a3b8', cursor: 'pointer', userSelect: 'none', width: '15%' }}>
                Type <SortArrow col="type" />
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} style={{ padding: '3rem', textAlign: 'center', color: '#475569' }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: '3rem', textAlign: 'center' }}>
                  <p style={{ color: '#64748b', fontSize: 15, margin: '0 0 12px' }}>No items found</p>
                  <button onClick={openNew} style={{ padding: '9px 18px', background: '#16a34a', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>+ Add Item</button>
                </td>
              </tr>
            ) : filtered.map((item, i) => (
              <tr key={item.id}
                onClick={() => openEdit(item)}
                style={{ borderBottom: i < filtered.length - 1 ? '1px solid #1e293b' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1e293b')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '14px 20px', fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
                  {item.image_url && (
                    <img src={item.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', marginRight: 10, verticalAlign: 'middle' }} />
                  )}
                  {item.name}
                </td>
                <td style={{ padding: '14px 20px', fontSize: 14, color: '#64748b', maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.description || ''}
                </td>
                <td style={{ padding: '14px 20px', fontSize: 14, color: '#94a3b8' }}>{item.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>{filtered.length.toLocaleString()} item{filtered.length !== 1 ? 's' : ''}</p>

      {/* Edit / New slide-out modal */}
      {editing !== null && (
        <>
          {/* Backdrop */}
          <div onClick={closeEdit} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400 }} />
          {/* Panel */}
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, background: '#0f172a', borderLeft: '1px solid #1e293b', zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
                {editing.id ? `Edit ${editing.name}` : 'New Item'}
              </h2>
              <button onClick={closeEdit} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 22, fontFamily: 'inherit', lineHeight: 1 }}>×</button>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {editing.id && (
                <p style={{ margin: 0, fontSize: 13, color: '#64748b', background: '#1e293b', padding: '10px 14px', borderRadius: 8 }}>
                  Changes will apply to new quotes, jobs, invoices, existing quote templates & online booking
                </p>
              )}

              {/* Item type */}
              <div>
                <label style={labelStyle}>Item type</label>
                <div style={{ position: 'relative' }}>
                  <select value={editing.type || 'Service'} onChange={e => setEditing(ed => ed ? { ...ed, type: e.target.value as 'Product' | 'Service' } : ed)}
                    style={{ ...inputStyle, paddingRight: 36 }}>
                    <option value="Service">Service</option>
                    <option value="Product">Product</option>
                  </select>
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }}>▾</span>
                </div>
              </div>

              {/* Name */}
              <div>
                <label style={labelStyle}>Name</label>
                <input value={editing.name || ''} onChange={e => setEditing(ed => ed ? { ...ed, name: e.target.value } : ed)}
                  placeholder={editing.type === 'Service' ? 'e.g. Lawn Mowing - Weekly' : 'e.g. Mulch - Brown'}
                  style={inputStyle} />
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>Description</label>
                <textarea value={editing.description || ''} onChange={e => setEditing(ed => ed ? { ...ed, description: e.target.value } : ed)}
                  rows={4} placeholder="Description" style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }} />
              </div>

              {/* Cost / Markup / Unit Price */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Cost ($)</label>
                  <input type="number" min="0" step="0.01" value={editing.unit_cost ?? ''} placeholder="0.00"
                    onChange={e => {
                      const c = parseFloat(e.target.value) || 0
                      const m = editing.markup_pct || 0
                      setEditing(ed => ed ? { ...ed, unit_cost: c, unit_price: calcPrice(c, m) } : ed)
                    }} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Markup (%)</label>
                  <input type="number" min="0" step="1" value={editing.markup_pct ?? ''} placeholder="0"
                    onChange={e => {
                      const m = parseFloat(e.target.value) || 0
                      const c = editing.unit_cost || 0
                      setEditing(ed => ed ? { ...ed, markup_pct: m, unit_price: calcPrice(c, m) } : ed)
                    }} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Unit Price ($)</label>
                  <input type="number" min="0" step="0.01" value={editing.unit_price ?? ''} placeholder="0.00"
                    onChange={e => setEditing(ed => ed ? { ...ed, unit_price: parseFloat(e.target.value) || 0 } : ed)}
                    style={inputStyle} />
                </div>
              </div>

              {/* Image upload */}
              <div>
                {editing.image_url ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#1e293b', borderRadius: 10, border: '1px solid #334155' }}>
                    <img src={editing.image_url} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, color: '#f1f5f9' }}>{editing.image_url.split('/').pop()?.slice(0,40)}</p>
                    </div>
                    <button onClick={removeImage} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 18, fontFamily: 'inherit' }}>🗑</button>
                  </div>
                ) : (
                  <div
                    style={{ display: 'block', border: '2px dashed #334155', borderRadius: 10, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', background: '#0a0f1a' }}
                    onClick={() => document.getElementById('img-upload-input')?.click()}
                    onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = '#4ade80' }}
                    onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#334155' }}
                    onDrop={e => {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).style.borderColor = '#334155'
                      const file = e.dataTransfer.files?.[0]
                      if (file && file.type.startsWith('image/')) handleImageUpload(file)
                    }}
                  >
                    <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#4ade80', fontSize: 14 }}>{uploading ? 'Uploading...' : '📷 Upload Image'}</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Click to select or drag & drop an image here</p>
                    <input id="img-upload-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]) }} />
                  </div>
                )}
              </div>

              {/* Checkboxes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <div onClick={() => setEditing(ed => ed ? { ...ed, taxable: !ed.taxable } : ed)}
                    style={{ width: 18, height: 18, border: `2px solid ${editing.taxable ? '#16a34a' : '#334155'}`, borderRadius: 4, background: editing.taxable ? '#16a34a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    {editing.taxable && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 14, color: '#cbd5e1' }}>Exempt from Tax</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <div onClick={() => setEditing(ed => ed ? { ...ed, online_booking: !ed.online_booking } : ed)}
                    style={{ width: 18, height: 18, border: `2px solid ${editing.online_booking ? '#16a34a' : '#334155'}`, borderRadius: 4, background: editing.online_booking ? '#16a34a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    {editing.online_booking && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 14, color: '#cbd5e1' }}>Available on quotes, quote templates, jobs, invoices & online booking</span>
                </label>
              </div>

              {/* Online Booking toggle */}
              <div style={{ borderTop: '1px solid #1e293b', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Online Booking</p>
                  <div onClick={() => setEditing(ed => ed ? { ...ed, online_booking: !ed.online_booking } : ed)}
                    style={{ width: 44, height: 24, borderRadius: 12, background: editing.online_booking ? '#16a34a' : '#334155', cursor: 'pointer', position: 'relative', transition: 'background .2s' }}>
                    <div style={{ position: 'absolute', top: 3, left: editing.online_booking ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>These settings are only available for online booking.</p>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0f1a' }}>
              <div>
                {editing.id && (
                  <button onClick={handleDelete} style={{ padding: '9px 18px', background: 'transparent', border: '1px solid #f87171', borderRadius: 8, color: '#f87171', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}>Delete</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={closeEdit} style={{ padding: '9px 18px', background: 'transparent', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={handleSave} disabled={!editing.name || saving}
                  style={{ padding: '9px 20px', background: editing.name ? '#16a34a' : '#1e293b', border: 'none', borderRadius: 8, color: editing.name ? '#fff' : '#475569', cursor: editing.name ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>
                  {saving ? 'Saving...' : editing.id ? 'Update' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 500,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', background: '#0a0f1a', border: '1px solid #1e293b',
  borderRadius: 8, color: '#f1f5f9', fontSize: 14, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
}
