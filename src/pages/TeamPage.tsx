import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type UserRole = 'superadmin' | 'manager' | 'dispatcher' | 'worker' | 'worker_limited'

interface TeamMember {
  id: string
  full_name: string
  email: string
  role: UserRole
  last_sign_in_at: string | null
  created_at: string
  active: boolean
}

const ROLE_OPTIONS: { value: UserRole; label: string; desc: string }[] = [
  { value: 'superadmin',     label: 'Superadmin',       desc: 'Full access to everything including billing and settings' },
  { value: 'manager',        label: 'Manager',          desc: 'Manage all areas including billing — excludes payroll' },
  { value: 'dispatcher',     label: 'Dispatcher',       desc: 'Edit jobs, team and client details. Recommended for team leads' },
  { value: 'worker',         label: 'Worker',           desc: 'View all clients, quotes, and jobs including pricing details' },
  { value: 'worker_limited', label: 'Worker (Limited)', desc: 'View their schedule, mark work complete, and track their time' },
]

const ROLE_COLORS: Record<UserRole, { bg: string; color: string }> = {
  superadmin:     { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' },
  manager:        { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
  dispatcher:     { bg: 'rgba(251,146,60,0.15)',  color: '#fb923c' },
  worker:         { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' },
  worker_limited: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editMember, setEditMember] = useState<TeamMember | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('worker_limited')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deactivateConfirm, setDeactivateConfirm] = useState<TeamMember | null>(null)

  const loadMembers = async () => {
    setLoading(true)
    try {
      // Get user_profiles joined with auth data
      const { data, error: err } = await supabase
        .from('user_profiles')
        .select('id, full_name, role, created_at, active')
        .order('full_name')

      if (err) throw new Error(err.message)

      // Get auth users for email + last sign in
      const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers()
      if (authErr) throw new Error(authErr.message)

      const merged: TeamMember[] = (data ?? []).map(p => {
        const authUser = users?.find(u => u.id === p.id)
        return {
          id: p.id,
          full_name: p.full_name || '—',
          email: authUser?.email || '—',
          role: p.role as UserRole,
          last_sign_in_at: authUser?.last_sign_in_at || null,
          created_at: p.created_at,
          active: p.active !== false,
        }
      })

      setMembers(merged)
    } catch (e: any) {
      // Fallback: load without admin API
      const { data } = await supabase
        .from('user_profiles')
        .select('id, full_name, role, created_at, active')
        .order('full_name')

      setMembers((data ?? []).map(p => ({
        id: p.id,
        full_name: p.full_name || '—',
        email: '—',
        role: p.role as UserRole || 'worker_limited',
        last_sign_in_at: null,
        created_at: p.created_at,
        active: p.active !== false,
      })))
    }
    setLoading(false)
  }

  useEffect(() => { loadMembers() }, [])

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) {
      setError('Name and email are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      // Send invite via Supabase Auth
      const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(inviteEmail.trim(), {
        data: { full_name: inviteName.trim(), role: inviteRole }
      })
      if (inviteErr) throw new Error(inviteErr.message)

      setSuccess(`Invite sent to ${inviteEmail}! They'll receive an email to set their password.`)
      setShowInvite(false)
      setInviteEmail('')
      setInviteName('')
      setInviteRole('worker_limited')
      setTimeout(() => setSuccess(null), 5000)
      loadMembers()
    } catch (e: any) {
      setError('Failed to send invite: ' + e.message)
    }
    setSaving(false)
  }

  const handleUpdateRole = async () => {
    if (!editMember) return
    setSaving(true)
    setError(null)
    try {
      const { error: err } = await supabase
        .from('user_profiles')
        .update({ role: editMember.role })
        .eq('id', editMember.id)
      if (err) throw new Error(err.message)
      setShowEdit(false)
      setEditMember(null)
      setSuccess('Role updated successfully.')
      setTimeout(() => setSuccess(null), 3000)
      loadMembers()
    } catch (e: any) {
      setError('Failed to update role: ' + e.message)
    }
    setSaving(false)
  }

  const handleDeactivate = async (member: TeamMember) => {
    try {
      await supabase.from('user_profiles').update({ active: false }).eq('id', member.id)
      setDeactivateConfirm(null)
      setSuccess(`${member.full_name} has been deactivated.`)
      setTimeout(() => setSuccess(null), 3000)
      loadMembers()
    } catch (e: any) {
      setError('Failed to deactivate: ' + e.message)
    }
  }

  const handleReactivate = async (member: TeamMember) => {
    await supabase.from('user_profiles').update({ active: true }).eq('id', member.id)
    setSuccess(`${member.full_name} reactivated.`)
    setTimeout(() => setSuccess(null), 3000)
    loadMembers()
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 11px', border: '1px solid #1e293b', borderRadius: 8,
    fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#0f172a',
    color: '#f1f5f9', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: 4, display: 'block',
  }

  const activeMembers = members.filter(m => m.active)
  const inactiveMembers = members.filter(m => !m.active)

  return (
    <div style={{ padding: '2rem', background: '#0a0f1a', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', margin: '0 0 2px' }}>Team</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{activeMembers.length} active users</p>
        </div>
        <button onClick={() => { setShowInvite(true); setError(null) }}
          style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Invite user
        </button>
      </div>

      {/* Success / Error banners */}
      {success && (
        <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#4ade80', marginBottom: 16 }}>
          ✓ {success}
        </div>
      )}
      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#f87171', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Permission levels reference */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: 20 }}>
        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Permission levels</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
          {ROLE_OPTIONS.map(r => (
            <div key={r.value} style={{ background: '#1e293b', borderRadius: 8, padding: '10px 12px' }}>
              <span style={{ background: ROLE_COLORS[r.value].bg, color: ROLE_COLORS[r.value].color, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, display: 'inline-block', marginBottom: 6 }}>
                {r.label}
              </span>
              <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{r.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Active users table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>Loading...</div>
      ) : (
        <>
          <div style={{ background: '#0f172a', borderRadius: 14, border: '1px solid #1e293b', overflow: 'hidden', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', background: '#0d1526' }}>
                  {['Name', 'Email', 'Last login', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeMembers.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: '#475569', fontSize: 13 }}>No active users</td></tr>
                ) : activeMembers.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #1e293b' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: ROLE_COLORS[m.role].bg, border: `1px solid ${ROLE_COLORS[m.role].color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: ROLE_COLORS[m.role].color, flexShrink: 0 }}>
                          {m.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: ROLE_COLORS[m.role].color }}>{m.full_name}</p>
                          <span style={{ background: ROLE_COLORS[m.role].bg, color: ROLE_COLORS[m.role].color, padding: '1px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700 }}>
                            {ROLE_OPTIONS.find(r => r.value === m.role)?.label || m.role}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{m.email}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{fmtDate(m.last_sign_in_at)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setEditMember({ ...m }); setShowEdit(true); setError(null) }}
                          style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                          Edit role
                        </button>
                        <button onClick={() => setDeactivateConfirm(m)}
                          style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inactive users */}
          {inactiveMembers.length > 0 && (
            <div style={{ background: '#0f172a', borderRadius: 14, border: '1px solid #1e293b', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b', background: '#0d1526' }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#475569' }}>DEACTIVATED USERS ({inactiveMembers.length})</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {inactiveMembers.map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #1e293b', opacity: 0.6 }}>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#475569' }}>
                            {m.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>{m.full_name}</p>
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: '#475569' }}>{m.email}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <button onClick={() => handleReactivate(m)}
                          style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Reactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500 }} onClick={() => setShowInvite(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 520, maxHeight: '90vh', overflowY: 'auto', background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 501, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Invite team member</h2>
              <button onClick={() => setShowInvite(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            {error && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#f87171', marginBottom: 14 }}>{error}</div>}

            <label style={lbl}>Full name *</label>
            <input style={{ ...inp, marginBottom: 12 }} value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="e.g. Brandon Ryan" />

            <label style={lbl}>Email address *</label>
            <input style={{ ...inp, marginBottom: 16 }} type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="e.g. brandon@phllandcare.com" />

            <label style={lbl}>Permission level</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {ROLE_OPTIONS.map(r => (
                <div key={r.value} onClick={() => setInviteRole(r.value)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, border: `1px solid ${inviteRole === r.value ? ROLE_COLORS[r.value].color : '#1e293b'}`, background: inviteRole === r.value ? ROLE_COLORS[r.value].bg : 'transparent', cursor: 'pointer' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${inviteRole === r.value ? ROLE_COLORS[r.value].color : '#334155'}`, background: inviteRole === r.value ? ROLE_COLORS[r.value].color : 'transparent', flexShrink: 0 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: inviteRole === r.value ? ROLE_COLORS[r.value].color : '#f1f5f9' }}>{r.label}</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#60a5fa', marginBottom: 20 }}>
              📧 They'll receive an email with a link to set their password and access PHL CRM.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInvite(false)} style={{ padding: '10px 20px', border: '1px solid #1e293b', borderRadius: 9, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleInvite} disabled={saving} style={{ padding: '10px 20px', border: 'none', borderRadius: 9, background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Sending...' : 'Send invite'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Edit Role Modal */}
      {showEdit && editMember && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500 }} onClick={() => setShowEdit(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 480, maxHeight: '90vh', overflowY: 'auto', background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 501, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Edit — {editMember.full_name}</h2>
              <button onClick={() => setShowEdit(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            {error && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#f87171', marginBottom: 14 }}>{error}</div>}

            <label style={lbl}>Permission level</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {ROLE_OPTIONS.map(r => (
                <div key={r.value} onClick={() => setEditMember({ ...editMember, role: r.value })}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, border: `1px solid ${editMember.role === r.value ? ROLE_COLORS[r.value].color : '#1e293b'}`, background: editMember.role === r.value ? ROLE_COLORS[r.value].bg : 'transparent', cursor: 'pointer' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${editMember.role === r.value ? ROLE_COLORS[r.value].color : '#334155'}`, background: editMember.role === r.value ? ROLE_COLORS[r.value].color : 'transparent', flexShrink: 0 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: editMember.role === r.value ? ROLE_COLORS[r.value].color : '#f1f5f9' }}>{r.label}</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowEdit(false)} style={{ padding: '10px 20px', border: '1px solid #1e293b', borderRadius: 9, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleUpdateRole} disabled={saving} style={{ padding: '10px 20px', border: 'none', borderRadius: 9, background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Deactivate Confirm */}
      {deactivateConfirm && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500 }} onClick={() => setDeactivateConfirm(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 360, background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 501, padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 36, margin: '0 0 12px' }}>⚠️</p>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Deactivate {deactivateConfirm.full_name}?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>They will lose access to PHL CRM. You can reactivate them at any time.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeactivateConfirm(null)} style={{ flex: 1, padding: '10px', border: '1px solid #1e293b', borderRadius: 9, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => handleDeactivate(deactivateConfirm)} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 9, background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>Deactivate</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
