import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type UserRole = 'superadmin' | 'manager' | 'dispatcher' | 'worker' | 'worker_limited'

interface Permissions {
  schedule: 'view_own' | 'view_complete_own' | 'edit_own' | 'edit_all' | 'edit_delete_all'
  schedule_enabled: boolean
  time_tracking: 'view_record_own' | 'view_record_edit_own' | 'view_record_edit_all'
  time_tracking_enabled: boolean
  notes: 'view_jobs_only' | 'view_all' | 'view_edit_all' | 'view_edit_delete_all'
  notes_enabled: boolean
  files_enabled: boolean
  expenses: 'view_record_own' | 'view_record_edit_all'
  expenses_enabled: boolean
  show_pricing: boolean
  job_costing: boolean
  clients: 'view_name_address' | 'view_full' | 'view_edit' | 'view_edit_delete'
  clients_enabled: boolean
  requests: 'view_only' | 'view_create_edit' | 'view_create_edit_delete'
  requests_enabled: boolean
  quotes_enabled: boolean
  jobs: 'view_only' | 'view_create_edit' | 'view_create_edit_delete'
  jobs_enabled: boolean
  invoices_enabled: boolean
  payments_enabled: boolean
  reports_enabled: boolean
}

const DEFAULT_PERMISSIONS: Record<UserRole, Permissions> = {
  superadmin: {
    schedule: 'edit_delete_all', schedule_enabled: true,
    time_tracking: 'view_record_edit_all', time_tracking_enabled: true,
    notes: 'view_edit_delete_all', notes_enabled: true,
    files_enabled: true,
    expenses: 'view_record_edit_all', expenses_enabled: true,
    show_pricing: true, job_costing: true,
    clients: 'view_edit_delete', clients_enabled: true,
    requests: 'view_create_edit_delete', requests_enabled: true,
    quotes_enabled: true,
    jobs: 'view_create_edit_delete', jobs_enabled: true,
    invoices_enabled: true, payments_enabled: true, reports_enabled: true,
  },
  manager: {
    schedule: 'edit_delete_all', schedule_enabled: true,
    time_tracking: 'view_record_edit_all', time_tracking_enabled: true,
    notes: 'view_edit_delete_all', notes_enabled: true,
    files_enabled: true,
    expenses: 'view_record_edit_all', expenses_enabled: true,
    show_pricing: true, job_costing: true,
    clients: 'view_edit_delete', clients_enabled: true,
    requests: 'view_create_edit_delete', requests_enabled: true,
    quotes_enabled: true,
    jobs: 'view_create_edit_delete', jobs_enabled: true,
    invoices_enabled: true, payments_enabled: false, reports_enabled: true,
  },
  dispatcher: {
    schedule: 'edit_all', schedule_enabled: true,
    time_tracking: 'view_record_edit_own', time_tracking_enabled: true,
    notes: 'view_edit_all', notes_enabled: true,
    files_enabled: false,
    expenses: 'view_record_own', expenses_enabled: true,
    show_pricing: false, job_costing: false,
    clients: 'view_edit', clients_enabled: true,
    requests: 'view_create_edit', requests_enabled: true,
    quotes_enabled: true,
    jobs: 'view_create_edit', jobs_enabled: true,
    invoices_enabled: false, payments_enabled: false, reports_enabled: false,
  },
  worker: {
    schedule: 'view_complete_own', schedule_enabled: true,
    time_tracking: 'view_record_own', time_tracking_enabled: true,
    notes: 'view_edit_all', notes_enabled: true,
    files_enabled: false,
    expenses: 'view_record_own', expenses_enabled: true,
    show_pricing: false, job_costing: false,
    clients: 'view_full', clients_enabled: true,
    requests: 'view_only', requests_enabled: true,
    quotes_enabled: false,
    jobs: 'view_only', jobs_enabled: true,
    invoices_enabled: false, payments_enabled: false, reports_enabled: false,
  },
  worker_limited: {
    schedule: 'view_complete_own', schedule_enabled: true,
    time_tracking: 'view_record_own', time_tracking_enabled: true,
    notes: 'view_edit_all', notes_enabled: true,
    files_enabled: false,
    expenses: 'view_record_own', expenses_enabled: true,
    show_pricing: false, job_costing: false,
    clients: 'view_name_address', clients_enabled: false,
    requests: 'view_only', requests_enabled: false,
    quotes_enabled: false,
    jobs: 'view_only', jobs_enabled: true,
    invoices_enabled: false, payments_enabled: false, reports_enabled: false,
  },
}

interface TeamMember {
  id: string
  full_name: string
  email: string
  phone: string
  role: UserRole
  permissions: Permissions
  last_sign_in_at: string | null
  created_at: string
  active: boolean
  employee_id?: string // linked employees.employee_id for QR code URL
}

interface EmployeeRow {
  id: string
  employee_id: string
  fname: string
  lname: string
  pto_balance: number
  sick_balance: number
  vacation_balance: number
  time_off_approver_id: string | null
}

interface TimeOffRequest {
  id: string
  employee_id: string
  employee_name: string
  type: 'pto' | 'sick' | 'vacation'
  start_date: string
  end_date: string
  days: number
  reason: string | null
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

const ROLE_OPTIONS: { value: UserRole; label: string; desc: string }[] = [
  { value: 'superadmin',     label: 'Superadmin',       desc: 'Full access to everything including billing and settings' },
  { value: 'manager',        label: 'Manager',          desc: 'Manage all areas including billing — excludes payroll' },
  { value: 'dispatcher',     label: 'Dispatcher',       desc: 'Edit job, team and client details. Recommended for team leads' },
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

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <div onClick={() => onChange(!on)} style={{
    width: 40, height: 22, borderRadius: 11, cursor: 'pointer', position: 'relative', flexShrink: 0,
    background: on ? '#16a34a' : '#1e293b', border: `1px solid ${on ? '#16a34a' : '#334155'}`,
    transition: 'all 0.2s',
  }}>
    <div style={{
      position: 'absolute', top: 2, left: on ? 19 : 2, width: 16, height: 16,
      borderRadius: '50%', background: on ? '#fff' : '#475569', transition: 'left 0.2s',
    }} />
  </div>
)

const RadioGroup: React.FC<{
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}> = ({ options, value, onChange, disabled }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
    {options.map(o => (
      <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1 }}>
        <div onClick={() => !disabled && onChange(o.value)} style={{
          width: 16, height: 16, borderRadius: '50%',
          border: `2px solid ${value === o.value ? '#4ade80' : '#334155'}`,
          background: value === o.value ? '#4ade80' : 'transparent',
          flexShrink: 0, cursor: disabled ? 'default' : 'pointer',
        }} />
        <span style={{ fontSize: 12, color: '#cbd5e1' }}>{o.label}</span>
      </label>
    ))}
  </div>
)

const Section: React.FC<{
  title: string
  enabled?: boolean
  onToggle?: (v: boolean) => void
  subtitle?: string
  children?: React.ReactNode
}> = ({ title, enabled, onToggle, subtitle, children }) => (
  <div style={{ borderBottom: '1px solid #1e293b', paddingBottom: 16, marginBottom: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{title}</p>
      {onToggle !== undefined && enabled !== undefined && <Toggle on={enabled} onChange={onToggle} />}
    </div>
    {subtitle && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#475569' }}>{subtitle}</p>}
    {children}
  </div>
)


function BulkImport({ onDone }: { onDone: () => void }) {
  const [csv, setCsv]         = useState('')
  const [preview, setPreview] = useState<any[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult]   = useState('')

  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n').filter(Boolean)
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g,''))
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''))
      const row: any = {}
      headers.forEach((h,i) => { row[h] = vals[i] || '' })
      return row
    })
  }

  const handleFile = (file: File) => {
    const r = new FileReader()
    r.onload = e => {
      const text = e.target?.result as string
      setCsv(text)
      setPreview(parseCSV(text).slice(0,5))
    }
    r.readAsText(file)
  }

  const handleImport = async () => {
    const rows = parseCSV(csv)
    if (!rows.length) return
    setImporting(true)
    let success = 0, failed = 0
    for (const row of rows) {
      try {
        const fname = row.fname || row.first_name || row.firstname || ''
        const lname = row.lname || row.last_name || row.lastname || ''
        const email = row.email || ''
        const division = row.division || 'Lawn & Tree'
        const hourly_rate = parseFloat(row.hourly_rate || row.rate || '15') || 15
        const employee_type = (row.employee_type || row.type || 'W2').toUpperCase()
        const employee_id = row.employee_id || row.id || `EMP-${Date.now()}-${Math.random().toString(36).slice(2,5)}`
        if (!fname && !lname) { failed++; continue }
        const { error } = await (await import('../lib/supabase')).supabase.from('employees').insert({
          fname, lname, email, division, hourly_rate, employee_type, employee_id, active: true
        })
        if (error) { failed++ } else { success++ }
      } catch { failed++ }
    }
    setImporting(false)
    setResult(`✅ ${success} imported${failed > 0 ? `, ❌ ${failed} failed` : ''}`)
    if (success > 0) setTimeout(onDone, 2000)
  }

  const TEMPLATE = 'fname,lname,email,employee_id,division,hourly_rate,employee_type\nJohn,Doe,john@phllandcare.com,EMP-007,Lawn & Tree,15,W2\nJane,Smith,jane@phllandcare.com,EMP-008,Irrigation,18,W2'

  const printQRBadge = (member: any) => {
    const clockUrl = `https://phllandcare.github.io/phl-crm/#/clockin?emp=${encodeURIComponent(member.employee_id || member.id)}`
    const win = window.open('', '_blank', 'width=400,height=550')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>ID Badge — ${member.full_name}</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
      body{margin:0;padding:20px;font-family:Arial,sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh}
      .badge{background:#fff;border-radius:16px;overflow:hidden;width:300px;box-shadow:0 4px 20px rgba(0,0,0,0.15);border:2px solid #1e3a5f}
      .badge-header{background:#1e3a5f;padding:20px;text-align:center;color:#fff}
      .badge-header img{width:60px;height:60px;border-radius:8px;background:#fff;padding:4px;object-fit:contain}
      .badge-header h1{margin:8px 0 4px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8}
      .badge-header h2{margin:0;font-size:18px;font-weight:800}
      .badge-header p{margin:4px 0 0;font-size:12px;color:#94a3b8}
      .badge-body{padding:20px;text-align:center;background:#fff}
      .emp-id{font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:12px;letter-spacing:.05em}
      #qr{display:flex;justify-content:center;margin:12px 0}
      .badge-footer{background:#f8fafc;padding:12px;text-align:center;border-top:1px solid #e2e8f0}
      .badge-footer p{margin:0;font-size:10px;color:#64748b}
      .instructions{font-size:11px;color:#475569;margin-top:8px;line-height:1.5}
      @media print{body{padding:0;background:#fff}.badge{box-shadow:none;border-color:#333}button{display:none!important}}
    </style></head><body>
    <div>
      <div class="badge">
        <div class="badge-header">
          <h1>PHL Land Care Inc.</h1>
          <h2>${member.full_name}</h2>
          <p>${member.role || 'Employee'}</p>
        </div>
        <div class="badge-body">
          <div class="emp-id">ID: ${member.employee_id || member.id?.slice(0,8).toUpperCase()}</div>
          <div id="qr"></div>
          <p class="instructions">Scan QR code to clock in / out</p>
        </div>
        <div class="badge-footer">
          <p>772-466-3617 | phllandcare.com</p>
        </div>
      </div>
      <div style="text-align:center;margin-top:16px">
        <button onclick="window.print()" style="background:#16a34a;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px">🖨️ Print Badge</button>
        <button onclick="window.close()" style="background:#1e293b;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:14px;cursor:pointer">Close</button>
      </div>
    </div>
    <script>
      new QRCode(document.getElementById("qr"), {
        text: "${clockUrl}",
        width: 160, height: 160,
        colorDark: "#1e3a5f", colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      })
    </script>
    </body></html>`)
    win.document.close()
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="phl_employees_template.csv"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#60a5fa', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
          ⬇️ Download CSV Template
        </a>
      </div>
      <label style={{ display: 'block', cursor: 'pointer' }}
        onDragOver={e=>e.preventDefault()}
        onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f)}}>
        <div style={{ border: '2px dashed #334155', borderRadius: 10, padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
          📂 Drop CSV here or click to browse
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}} />
        </div>
      </label>
      {preview.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 6px' }}>Preview ({preview.length} of {parseCSV(csv).length} rows)</p>
          <div style={{ background: '#0a0f1a', borderRadius: 8, border: '1px solid #1e293b', overflow: 'auto', maxHeight: 160 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ borderBottom: '1px solid #1e293b' }}>
                {Object.keys(preview[0]).map(k=><th key={k} style={{ padding: '6px 10px', color: '#64748b', textAlign: 'left', fontWeight: 600 }}>{k}</th>)}
              </tr></thead>
              <tbody>{preview.map((row,i)=>(
                <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                  {Object.values(row).map((v:any,j)=><td key={j} style={{ padding: '6px 10px', color: '#cbd5e1' }}>{v}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <button onClick={handleImport} disabled={importing}
            style={{ marginTop: 12, width: '100%', padding: '10px', background: '#16a34a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: importing ? 0.7 : 1 }}>
            {importing ? 'Importing...' : `Import ${parseCSV(csv).length} Employees`}
          </button>
        </div>
      )}
      {result && <p style={{ marginTop: 10, fontSize: 13, color: '#4ade80', fontWeight: 600 }}>{result}</p>}
    </div>
  )
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [addMode, setAddMode] = useState<'invite' | 'manual'>('invite')
  const [manualPassword, setManualPassword] = useState('')
  const [invitePhone, setInvitePhone] = useState('')
  const [invitePersonalEmail, setInvitePersonalEmail] = useState('')
  const [inviteAddress, setInviteAddress] = useState('')
  const [inviteCity, setInviteCity] = useState('')
  const [inviteState, setInviteState] = useState('')
  const [inviteZip, setInviteZip] = useState('')
  const [inviteSSN, setInviteSSN] = useState('')
  const [inviteFilingStatus, setInviteFilingStatus] = useState('')
  const [inviteEmpType, setInviteEmpType] = useState<'W2'|'1099'>('W2')
  const [paperworkUploading, setPaperworkUploading] = useState(false)
  const [paperworkFiles, setPaperworkFiles] = useState<{name:string;url:string}[]>([])
  const [showEdit, setShowEdit] = useState(false)
  const [editMember, setEditMember] = useState<TeamMember | null>(null)
  const [drawerTab, setDrawerTab] = useState<'permissions' | 'timeoff'>('permissions')
  const [linkedEmployee, setLinkedEmployee] = useState<EmployeeRow | null>(null)
  const [employeeLookupDone, setEmployeeLookupDone] = useState(false)
  const [balanceEdits, setBalanceEdits] = useState<{ pto: string; sick: string; vacation: string; approver_id: string }>({ pto: '', sick: '', vacation: '', approver_id: '' })
  const [savingBalances, setSavingBalances] = useState(false)
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([])
  const [loadingTimeOff, setLoadingTimeOff] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('worker_limited')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deactivateConfirm, setDeactivateConfirm] = useState<TeamMember | null>(null)
  const [allEmployees, setAllEmployees] = useState<EmployeeRow[]>([])

  const loadMembers = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, permissions, created_at, active, email, phone')
      .order('full_name')

    // Also pull employee_id so QR codes and SMS use the right ID
    const { data: empRows } = await supabase
      .from('employees')
      .select('user_id, employee_id')

    const empMap: Record<string, string> = {}
    ;(empRows || []).forEach((e: any) => { if (e.user_id) empMap[e.user_id] = e.employee_id })

    setMembers((data ?? []).map(p => ({
      id: p.id,
      full_name: p.full_name || '—',
      email: p.email || '—',
      phone: p.phone || '',
      role: (p.role as UserRole) || 'worker_limited',
      permissions: p.permissions || DEFAULT_PERMISSIONS[(p.role as UserRole) || 'worker_limited'],
      last_sign_in_at: null,
      created_at: p.created_at,
      active: p.active !== false,
      employee_id: empMap[p.id] || undefined,
    })))
    setLoading(false)
  }

  useEffect(() => { loadMembers() }, [])

  useEffect(() => {
    supabase.from('employees').select('id, employee_id, fname, lname, pto_balance, sick_balance, vacation_balance, time_off_approver_id')
      .then(({ data }) => setAllEmployees((data ?? []) as EmployeeRow[]))
  }, [])

  // When the edit drawer opens for a member, find their matching employees row
  // (linked by name, since user_profiles and employees are separate identity spaces)
  // so we can show/edit PTO/Sick/Vacation balances and load their requests.
  useEffect(() => {
    if (!showEdit || !editMember) { setLinkedEmployee(null); setEmployeeLookupDone(false); return }
    setEmployeeLookupDone(false)
    const name = editMember.full_name.trim().toLowerCase()
    supabase.from('employees')
      .select('id, employee_id, fname, lname, pto_balance, sick_balance, vacation_balance, time_off_approver_id')
      .then(({ data }) => {
        const match = (data ?? []).find((e: any) => `${e.fname} ${e.lname}`.trim().toLowerCase() === name) || null
        setLinkedEmployee(match as EmployeeRow | null)
        if (match) {
          setBalanceEdits({
            pto: String((match as any).pto_balance ?? 0),
            sick: String((match as any).sick_balance ?? 0),
            vacation: String((match as any).vacation_balance ?? 0),
            approver_id: (match as any).time_off_approver_id || '',
          })
          loadTimeOffForEmployee((match as any).employee_id)
        }
        setEmployeeLookupDone(true)
      })
  }, [showEdit, editMember?.id])

  const loadTimeOffForEmployee = async (employeeId: string) => {
    setLoadingTimeOff(true)
    const { data } = await supabase.from('time_off_requests').select('*')
      .eq('employee_id', employeeId).order('created_at', { ascending: false })
    setTimeOffRequests((data ?? []) as TimeOffRequest[])
    setLoadingTimeOff(false)
  }

  const handleSaveBalances = async () => {
    if (!linkedEmployee) return
    setSavingBalances(true); setError(null)
    try {
      const { error: err } = await supabase.from('employees').update({
        pto_balance: parseFloat(balanceEdits.pto) || 0,
        sick_balance: parseFloat(balanceEdits.sick) || 0,
        vacation_balance: parseFloat(balanceEdits.vacation) || 0,
        time_off_approver_id: balanceEdits.approver_id || null,
      }).eq('id', linkedEmployee.id)
      if (err) throw new Error(err.message)
      setSuccess('Time off balances saved.'); setTimeout(() => setSuccess(null), 3000)
      setAllEmployees(prev => prev.map(e => e.id === linkedEmployee.id
        ? { ...e, pto_balance: parseFloat(balanceEdits.pto) || 0, sick_balance: parseFloat(balanceEdits.sick) || 0, vacation_balance: parseFloat(balanceEdits.vacation) || 0, time_off_approver_id: balanceEdits.approver_id || null }
        : e))
    } catch (e: any) { setError('Failed: ' + e.message) }
    setSavingBalances(false)
  }

  const handleReviewRequest = async (req: TimeOffRequest, status: 'approved' | 'denied') => {
    setError(null)
    try {
      const { error: err } = await supabase.from('time_off_requests').update({
        status, reviewed_by: 'Admin', reviewed_at: new Date().toISOString(),
      }).eq('id', req.id)
      if (err) throw new Error(err.message)

      // On approval, deduct the days from the employee's balance for that type
      if (status === 'approved' && linkedEmployee) {
        const col = req.type === 'pto' ? 'pto_balance' : req.type === 'sick' ? 'sick_balance' : 'vacation_balance'
        const current = req.type === 'pto' ? parseFloat(balanceEdits.pto) : req.type === 'sick' ? parseFloat(balanceEdits.sick) : parseFloat(balanceEdits.vacation)
        const updated = Math.max(0, (current || 0) - req.days)
        await supabase.from('employees').update({ [col]: updated }).eq('id', linkedEmployee.id)
        setBalanceEdits(prev => ({ ...prev, [req.type === 'pto' ? 'pto' : req.type === 'sick' ? 'sick' : 'vacation']: String(updated) }))
      }
      loadTimeOffForEmployee(req.employee_id)
      setSuccess(`Request ${status}.`); setTimeout(() => setSuccess(null), 3000)
    } catch (e: any) { setError('Failed: ' + e.message) }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) { setError('Name and email are required.'); return }
    if (addMode === 'manual' && !manualPassword.trim()) { setError('Password is required for manual add.'); return }
    setSaving(true); setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('invite-user', {
        body: {
          mode: addMode === 'invite' ? 'invite' : 'manual',
          email: inviteEmail.trim(),
          full_name: inviteName.trim(),
          role: inviteRole,
          password: manualPassword.trim() || undefined,
          phone: invitePhone.trim() || undefined,
          personal_email: invitePersonalEmail.trim() || undefined,
          address: inviteAddress.trim() || undefined,
          city: inviteCity.trim() || undefined,
          state: inviteState.trim() || undefined,
          zip: inviteZip.trim() || undefined,
          ssn: inviteSSN.trim() || undefined,
          filing_status: inviteFilingStatus || undefined,
          employee_type: inviteEmpType,
          paperwork_files: paperworkFiles.length > 0 ? paperworkFiles : undefined,
        }
      })
      if (fnErr || (data && data.error)) throw new Error((data && data.error) || fnErr?.message || 'Invite failed')
      setSuccess(
        addMode === 'invite'
          ? `Invite sent to ${inviteEmail}!`
          : `${inviteName} added successfully! They can log in with their email and the password you set.`
      )
      setShowInvite(false)
      setInviteEmail(''); setInviteName(''); setInviteRole('worker_limited'); setManualPassword('')
      setInvitePhone(''); setInvitePersonalEmail(''); setInviteAddress(''); setInviteCity('')
      setInviteState(''); setInviteZip(''); setInviteSSN(''); setInviteFilingStatus(''); setInviteEmpType('W2')
      setPaperworkFiles([])
      setTimeout(() => setSuccess(null), 5000)
      loadMembers()
    } catch (e: any) { setError('Failed: ' + e.message) }
    setSaving(false)
  }


  const handleSavePermissions = async () => {
    if (!editMember) return
    setSaving(true); setError(null)
    try {
      const { error: err } = await supabase.from('user_profiles')
        .update({ role: editMember.role, permissions: editMember.permissions })
        .eq('id', editMember.id)
      if (err) throw new Error(err.message)
      setShowEdit(false); setEditMember(null)
      setSuccess('Permissions saved.'); setTimeout(() => setSuccess(null), 3000)
      loadMembers()
    } catch (e: any) { setError('Failed: ' + e.message) }
    setSaving(false)
  }

  const handleDeactivate = async (member: TeamMember) => {
    await supabase.from('user_profiles').update({ active: false }).eq('id', member.id)
    setDeactivateConfirm(null); setShowEdit(false)
    setSuccess(`${member.full_name} deactivated.`); setTimeout(() => setSuccess(null), 3000)
    loadMembers()
  }

  const handleReactivate = async (member: TeamMember) => {
    await supabase.from('user_profiles').update({ active: true }).eq('id', member.id)
    setSuccess(`${member.full_name} reactivated.`); setTimeout(() => setSuccess(null), 3000)
    loadMembers()
  }

  const applyPreset = (role: UserRole) => {
    if (!editMember) return
    setEditMember({ ...editMember, role, permissions: { ...DEFAULT_PERMISSIONS[role] } })
  }

  const updatePerm = (key: keyof Permissions, value: any) => {
    if (!editMember) return
    setEditMember({ ...editMember, permissions: { ...editMember.permissions, [key]: value } })
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #1e293b', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#0f172a', color: '#f1f5f9', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }

  const activeMembers = members.filter(m => m.active)
  const inactiveMembers = members.filter(m => !m.active)

  // ── Reset password ────────────────────────────────────────────
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetMsg, setResetMsg] = useState('')

  const handleResetPassword = async () => {
    if (!resetTarget || newPassword.length < 8) { setResetMsg('Password must be at least 8 characters.'); return }
    setResetMsg('Saving…')
    const { error } = await supabase.functions.invoke('reset-user-password', {
      body: { userId: resetTarget.id, newPassword }
    })
    if (error) { setResetMsg('Error: ' + error.message); return }
    setResetMsg('✅ Password updated!')
    setTimeout(() => { setResetTarget(null); setNewPassword(''); setResetMsg('') }, 2000)
  }

  // ── Send QR via SMS / Email ───────────────────────────────────
  const [sendQRState, setSendQRState] = useState<{ member: TeamMember; channel: 'sms' | 'email' } | null>(null)
  const [qrSendMsg, setQRSendMsg] = useState('')

  const getClockUrl = (m: TeamMember) =>
    `https://phllandcare.github.io/phl-crm/#/clockin?emp=${encodeURIComponent(m.employee_id || m.id)}`

  const handleSendQR = async () => {
    if (!sendQRState) return
    const { member, channel } = sendQRState
    const clockUrl = getClockUrl(member)
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(clockUrl)}`
    setQRSendMsg('Sending…')
    if (channel === 'sms') {
      if (!member.phone) { setQRSendMsg('No phone number on file for this employee.'); return }
      const body = `Hi ${member.full_name.split(' ')[0]}! Here's your PHL Land Care clock-in link:\n${clockUrl}\n\nBookmark it on your phone to clock in/out anytime.`
      const { error } = await supabase.functions.invoke('send-sms', { body: { to: member.phone, message: body } })
      if (error) { setQRSendMsg('SMS error: ' + error.message); return }
      setQRSendMsg('✅ Sent via text!')
    } else {
      if (!member.email || member.email === '—') { setQRSendMsg('No email on file for this employee.'); return }
      const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px">
        <h2 style="color:#1e3a5f;margin:0 0 8px">Your Clock-In QR Code</h2>
        <p style="color:#475569;margin:0 0 20px">Hi ${member.full_name.split(' ')[0]}, scan the QR code below or tap the button to clock in / out.</p>
        <div style="text-align:center;background:#fff;border-radius:10px;padding:20px;border:1px solid #e2e8f0;margin-bottom:20px">
          <img src="${qrImageUrl}" alt="QR Code" style="width:180px;height:180px"/>
          <p style="margin:12px 0 0;font-size:12px;color:#64748b">Employee ID: ${member.employee_id || '—'}</p>
        </div>
        <a href="${clockUrl}" style="display:block;text-align:center;background:#16a34a;color:#fff;padding:12px;border-radius:8px;text-decoration:none;font-weight:700">Open Clock-In Page</a>
        <p style="color:#94a3b8;font-size:11px;margin-top:16px;text-align:center">PHL Land Care Inc. · 772-466-3617 · phllandcare.com</p>
      </div>`
      const { error } = await supabase.functions.invoke('send-email', {
        body: { to: member.email, subject: `Your PHL Land Care Clock-In QR Code`, html }
      })
      if (error) { setQRSendMsg('Email error: ' + error.message); return }
      setQRSendMsg('✅ Sent via email!')
    }
    setTimeout(() => { setSendQRState(null); setQRSendMsg('') }, 2500)
  }

  return (
    <div style={{ padding: '2rem', background: '#0a0f1a', minHeight: '100vh' }}>
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

      {success && <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#4ade80', marginBottom: 16 }}>✓ {success}</div>}
      {error && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#f87171', marginBottom: 16 }}>{error}</div>}

      {/* Preset levels reference */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: 20 }}>
        <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Preset permission levels</p>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>Start with a preset level and customize further as needed.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
          {ROLE_OPTIONS.map(r => (
            <div key={r.value} style={{ background: '#1e293b', borderRadius: 8, padding: '10px 12px' }}>
              <span style={{ background: ROLE_COLORS[r.value].bg, color: ROLE_COLORS[r.value].color, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, display: 'inline-block', marginBottom: 6 }}>{r.label}</span>
              <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{r.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Users table */}
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
                          {m.full_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
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
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => { setEditMember({ ...m, permissions: m.permissions || DEFAULT_PERMISSIONS[m.role] }); setShowEdit(true); setError(null) }}
                          style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                          Edit permissions
                        </button>
                        <button onClick={() => { setResetTarget(m); setNewPassword(''); setResetMsg('') }}
                          style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                          🔑 Reset PW
                        </button>
                        <button onClick={() => { setSendQRState({ member: m, channel: 'sms' }); setQRSendMsg('') }}
                          style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                          📱 QR→SMS
                        </button>
                        <button onClick={() => { setSendQRState({ member: m, channel: 'email' }); setQRSendMsg('') }}
                          style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                          📧 QR→Email
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
                            {m.full_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
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

      {/* INVITE MODAL */}
      {showInvite && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500 }} onClick={() => setShowInvite(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 520, maxHeight: '90vh', overflowY: 'auto', background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 501, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Add team member</h2>
              <button onClick={() => setShowInvite(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: '#0f172a', borderRadius: 8, padding: 3 }}>
              <button onClick={() => setAddMode('invite')} style={{ flex: 1, padding: '8px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: addMode === 'invite' ? '#1e293b' : 'transparent', color: addMode === 'invite' ? '#f1f5f9' : '#64748b' }}>
                📧 Send invite email
              </button>
              <button onClick={() => setAddMode('manual')} style={{ flex: 1, padding: '8px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: addMode === 'manual' ? '#1e293b' : 'transparent', color: addMode === 'manual' ? '#f1f5f9' : '#64748b' }}>
                🔑 Add manually
              </button>
              <button onClick={() => setAddMode('bulk' as any)} style={{ flex: 1, padding: '8px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: addMode === ('bulk' as any) ? '#1e293b' : 'transparent', color: addMode === ('bulk' as any) ? '#f1f5f9' : '#64748b' }}>
                📋 Bulk CSV
              </button>
            </div>
            {addMode === ('bulk' as any) && (
              <BulkImport onDone={() => { setShowInvite(false); loadMembers() }} />
            )}
            {error && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#f87171', marginBottom: 14 }}>{error}</div>}
            <label style={lbl}>Full name *</label>
            <input style={{ ...inp, marginBottom: 12 }} value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="e.g. Brandon Ryan" />
            <label style={lbl}>Email address *</label>
            <input style={{ ...inp, marginBottom: 12 }} type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="e.g. brandon@phllandcare.com" />
            <label style={lbl}>Personal email (if different)</label>
            <input style={{ ...inp, marginBottom: 12 }} type="email" placeholder="Personal email address"
              value={invitePersonalEmail} onChange={e => setInvitePersonalEmail(e.target.value)} />
            <label style={lbl}>Phone number</label>
            <input style={{ ...inp, marginBottom: 12 }} type="tel" placeholder="(772) 000-0000"
              value={invitePhone} onChange={e => setInvitePhone(e.target.value)} />
            <label style={lbl}>Home address</label>
            <input style={{ ...inp, marginBottom: 8 }} placeholder="Street address"
              value={inviteAddress} onChange={e => setInviteAddress(e.target.value)} />
            <div style={{ display:'grid',gridTemplateColumns:'1fr 80px 100px',gap:8,marginBottom:12 }}>
              <input style={inp} placeholder="City" value={inviteCity} onChange={e => setInviteCity(e.target.value)} />
              <input style={inp} placeholder="State" maxLength={2} value={inviteState} onChange={e => setInviteState(e.target.value)} />
              <input style={inp} placeholder="Zip" maxLength={10} value={inviteZip} onChange={e => setInviteZip(e.target.value)} />
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
              <div>
                <label style={lbl}>Social Security # <span style={{ fontSize:10,color:'#475569' }}>(stored securely)</span></label>
                <input style={inp} type="password" placeholder="XXX-XX-XXXX" maxLength={11} autoComplete="off"
                  value={inviteSSN} onChange={e => setInviteSSN(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Tax filing status</label>
                <select style={inp} value={inviteFilingStatus} onChange={e => setInviteFilingStatus(e.target.value)}>
                  <option value="">— Select —</option>
                  <option>Single</option>
                  <option>Married Filing Jointly</option>
                  <option>Married Filing Separately</option>
                  <option>Head of Household</option>
                  <option>Qualifying Widow(er)</option>
                </select>
              </div>
            </div>
            <label style={lbl}>Employee type</label>
            <div style={{ display:'flex',gap:8,marginBottom:16 }}>
              {(['W2','1099'] as const).map(t => (
                <button key={t} onClick={() => setInviteEmpType(t)}
                  style={{ flex:1,padding:'8px 12px',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,border:'none',
                    background: inviteEmpType===t ? (t==='W2'?'rgba(74,222,128,0.15)':'rgba(251,191,36,0.15)') : '#1e293b',
                    color: inviteEmpType===t ? (t==='W2'?'#4ade80':'#fbbf24') : '#64748b' }}>
                  {t === 'W2' ? 'W2 — Employee' : '1099 — Contractor'}
                </button>
              ))}
            </div>

            {/* Employee Paperwork Upload */}
            <label style={lbl}>Employee Paperwork <span style={{ fontSize:10,color:'#475569',fontWeight:400,textTransform:'none' }}>(W4, I-9, direct deposit, etc.)</span></label>
            <div style={{ border:'2px dashed #334155',borderRadius:10,padding:'1rem',marginBottom:16 }}
              onDragOver={e=>e.preventDefault()}
              onDrop={async e=>{
                e.preventDefault()
                const files = Array.from(e.dataTransfer.files)
                for (const file of files) {
                  setPaperworkUploading(true)
                  const path = `employee-docs/${Date.now()}_${file.name.replace(/\s/g,'_')}`
                  const { error } = await supabase.storage.from('employee-docs').upload(path, file, {upsert:true})
                  if (!error) {
                    const { data: { publicUrl } } = supabase.storage.from('employee-docs').getPublicUrl(path)
                    setPaperworkFiles(prev => [...prev, {name:file.name, url:publicUrl}])
                  }
                  setPaperworkUploading(false)
                }
              }}>
              <div style={{ textAlign:'center',marginBottom:paperworkFiles.length>0?12:0 }}>
                <label style={{ cursor:'pointer',display:'inline-flex',flexDirection:'column',alignItems:'center',gap:4 }}>
                  <span style={{ fontSize:24 }}>📎</span>
                  <span style={{ fontSize:12,color:'#4ade80',fontWeight:600 }}>{paperworkUploading ? 'Uploading...' : 'Click to upload or drag files here'}</span>
                  <span style={{ fontSize:11,color:'#475569' }}>PDF, images, Word docs accepted</span>
                  <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{display:'none'}} onChange={async e=>{
                    const files = Array.from(e.target.files||[])
                    for (const file of files) {
                      setPaperworkUploading(true)
                      const path = `employee-docs/${Date.now()}_${file.name.replace(/\s/g,'_')}`
                      const { error } = await supabase.storage.from('employee-docs').upload(path, file, {upsert:true})
                      if (!error) {
                        const { data: { publicUrl } } = supabase.storage.from('employee-docs').getPublicUrl(path)
                        setPaperworkFiles(prev => [...prev, {name:file.name, url:publicUrl}])
                      } else {
                        setPaperworkFiles(prev => [...prev, {name:file.name, url:''}])
                      }
                      setPaperworkUploading(false)
                    }
                  }} />
                </label>
              </div>
              {paperworkFiles.length > 0 && (
                <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
                  {paperworkFiles.map((f,i) => (
                    <div key={i} style={{ display:'flex',alignItems:'center',gap:8,background:'#1e293b',borderRadius:6,padding:'6px 10px' }}>
                      <span style={{ fontSize:14 }}>{f.name.endsWith('.pdf')?'📄':f.name.match(/\.(jpg|jpeg|png)/i)?'🖼️':'📁'}</span>
                      <span style={{ fontSize:12,color:'#f1f5f9',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{f.name}</span>
                      {f.url && <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize:11,color:'#60a5fa',flexShrink:0 }}>View</a>}
                      <button onClick={()=>setPaperworkFiles(prev=>prev.filter((_,j)=>j!==i))} style={{ background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:14,flexShrink:0 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {addMode === 'manual' && (
              <>
                <label style={lbl}>Temporary password *</label>
                <input style={{ ...inp, marginBottom: 16 }} type="password" value={manualPassword} onChange={e => setManualPassword(e.target.value)} placeholder="Set a temporary password" />
              </>
            )}
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
            <div style={{ background: addMode === 'invite' ? 'rgba(96,165,250,0.08)' : 'rgba(74,222,128,0.08)', border: `1px solid ${addMode === 'invite' ? 'rgba(96,165,250,0.2)' : 'rgba(74,222,128,0.2)'}`, borderRadius: 8, padding: '10px 12px', fontSize: 12, color: addMode === 'invite' ? '#60a5fa' : '#4ade80', marginBottom: 20 }}>
              {addMode === 'invite'
                ? '📧 They\'ll receive an email with a link to set their password and access PHL CRM.'
                : '🔑 Creates their account immediately. Share their email and password with them directly.'}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInvite(false)} style={{ padding: '10px 20px', border: '1px solid #1e293b', borderRadius: 9, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleInvite} disabled={saving} style={{ padding: '10px 20px', border: 'none', borderRadius: 9, background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : addMode === 'invite' ? 'Send invite' : 'Add user'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* EDIT PERMISSIONS DRAWER */}
      {showEdit && editMember && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500 }} onClick={() => setShowEdit(false)} />
          <div style={{ position: 'fixed', top: 0, right: 0, width: 500, height: '100vh', background: '#0d1526', borderLeft: '1px solid #1e293b', zIndex: 501, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{editMember.full_name}</h2>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Edit team member</p>
              </div>
              <button onClick={() => setShowEdit(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 0, padding: '10px 20px 0', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
              {[{ key: 'permissions', label: 'Permissions' }, { key: 'timeoff', label: '🌴 Time Off' }].map(t => (
                <button key={t.key} onClick={() => setDrawerTab(t.key as any)}
                  style={{ padding: '8px 14px', border: 'none', borderBottom: drawerTab === t.key ? '2px solid #16a34a' : '2px solid transparent', background: 'transparent', color: drawerTab === t.key ? '#f1f5f9' : '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', marginBottom: -1 }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {error && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#f87171', marginBottom: 14 }}>{error}</div>}

              {drawerTab === 'permissions' && (<>
              {/* Preset picker */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preset permission level</p>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: '#475569' }}>Start with a preset and customize further as needed.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ROLE_OPTIONS.map(r => (
                    <div key={r.value} onClick={() => applyPreset(r.value)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: `1px solid ${editMember.role === r.value ? ROLE_COLORS[r.value].color : '#1e293b'}`, background: editMember.role === r.value ? ROLE_COLORS[r.value].bg : 'transparent', cursor: 'pointer' }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${editMember.role === r.value ? ROLE_COLORS[r.value].color : '#334155'}`, background: editMember.role === r.value ? ROLE_COLORS[r.value].color : 'transparent', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: editMember.role === r.value ? ROLE_COLORS[r.value].color : '#f1f5f9' }}>{r.label}</span>
                      <span style={{ fontSize: 11, color: '#475569' }}>{r.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid #1e293b', paddingTop: 16 }}>
                <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom permissions</p>

                <Section title="Schedule" enabled={editMember.permissions.schedule_enabled} onToggle={v => updatePerm('schedule_enabled', v)}>
                  <RadioGroup disabled={!editMember.permissions.schedule_enabled} value={editMember.permissions.schedule} onChange={v => updatePerm('schedule', v)} options={[
                    { value: 'view_own', label: 'View their own schedule' },
                    { value: 'view_complete_own', label: 'View and complete their own schedule' },
                    { value: 'edit_own', label: 'Edit their own schedule' },
                    { value: 'edit_all', label: "Edit everyone's schedule" },
                    { value: 'edit_delete_all', label: "Edit and delete everyone's schedule" },
                  ]} />
                </Section>

                <Section title="Time tracking and timesheets" enabled={editMember.permissions.time_tracking_enabled} onToggle={v => updatePerm('time_tracking_enabled', v)}>
                  <RadioGroup disabled={!editMember.permissions.time_tracking_enabled} value={editMember.permissions.time_tracking} onChange={v => updatePerm('time_tracking', v)} options={[
                    { value: 'view_record_own', label: 'View and record their own' },
                    { value: 'view_record_edit_own', label: 'View, record, and edit their own' },
                    { value: 'view_record_edit_all', label: "View, record, and edit everyone's" },
                  ]} />
                </Section>

                <Section title="Notes" enabled={editMember.permissions.notes_enabled} onToggle={v => updatePerm('notes_enabled', v)} subtitle="Includes all notes across PHL CRM.">
                  <RadioGroup disabled={!editMember.permissions.notes_enabled} value={editMember.permissions.notes} onChange={v => updatePerm('notes', v)} options={[
                    { value: 'view_jobs_only', label: 'View notes on jobs and visits only' },
                    { value: 'view_all', label: 'View all notes' },
                    { value: 'view_edit_all', label: 'View and edit all' },
                    { value: 'view_edit_delete_all', label: 'View, edit, and delete all' },
                  ]} />
                </Section>

                <Section title="Files and media" enabled={editMember.permissions.files_enabled} onToggle={v => updatePerm('files_enabled', v)} subtitle="Allows viewing of all client files and attachments." />

                <Section title="Expenses" enabled={editMember.permissions.expenses_enabled} onToggle={v => updatePerm('expenses_enabled', v)}>
                  <RadioGroup disabled={!editMember.permissions.expenses_enabled} value={editMember.permissions.expenses} onChange={v => updatePerm('expenses', v)} options={[
                    { value: 'view_record_own', label: 'View, record, and edit their own' },
                    { value: 'view_record_edit_all', label: "View, record, and edit everyone's" },
                  ]} />
                </Section>

                <Section title="Show pricing" subtitle="Allows editing of quotes, invoices, and line items on jobs.">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
                    <Toggle on={editMember.permissions.show_pricing} onChange={v => updatePerm('show_pricing', v)} />
                  </div>
                </Section>

                <Section title="Job costing" subtitle="Show job profit by tracking revenue and costs from line items, labor, and expenses.">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
                    <Toggle on={editMember.permissions.job_costing} onChange={v => updatePerm('job_costing', v)} />
                  </div>
                </Section>

                <Section title="Clients and properties" enabled={editMember.permissions.clients_enabled} onToggle={v => updatePerm('clients_enabled', v)} subtitle="Includes access to all client custom fields.">
                  <RadioGroup disabled={!editMember.permissions.clients_enabled} value={editMember.permissions.clients} onChange={v => updatePerm('clients', v)} options={[
                    { value: 'view_name_address', label: 'View client name and address only' },
                    { value: 'view_full', label: 'View full client and property info' },
                    { value: 'view_edit', label: 'View and edit full client and property info' },
                    { value: 'view_edit_delete', label: 'View, edit, and delete full client and property info' },
                  ]} />
                </Section>

                <Section title="Requests" enabled={editMember.permissions.requests_enabled} onToggle={v => updatePerm('requests_enabled', v)}>
                  <RadioGroup disabled={!editMember.permissions.requests_enabled} value={editMember.permissions.requests} onChange={v => updatePerm('requests', v)} options={[
                    { value: 'view_only', label: 'View only' },
                    { value: 'view_create_edit', label: 'View, create, and edit' },
                    { value: 'view_create_edit_delete', label: 'View, create, edit, and delete' },
                  ]} />
                </Section>

                <Section title="Quotes" enabled={editMember.permissions.quotes_enabled} onToggle={v => updatePerm('quotes_enabled', v)} subtitle="Full access to create, edit, and send quotes." />

                <Section title="Jobs" enabled={editMember.permissions.jobs_enabled} onToggle={v => updatePerm('jobs_enabled', v)}>
                  <RadioGroup disabled={!editMember.permissions.jobs_enabled} value={editMember.permissions.jobs} onChange={v => updatePerm('jobs', v)} options={[
                    { value: 'view_only', label: 'View only' },
                    { value: 'view_create_edit', label: 'View, create, and edit' },
                    { value: 'view_create_edit_delete', label: 'View, create, edit, and delete' },
                  ]} />
                </Section>

                <Section title="Invoices" enabled={editMember.permissions.invoices_enabled} onToggle={v => updatePerm('invoices_enabled', v)} subtitle="Full access to create, edit, and send invoices." />
                <Section title="Payments" enabled={editMember.permissions.payments_enabled} onToggle={v => updatePerm('payments_enabled', v)} subtitle="Allow payment collection on quotes and invoices." />
                <Section title="Reports" enabled={editMember.permissions.reports_enabled} onToggle={v => updatePerm('reports_enabled', v)} subtitle="Users will only see reports available based on their other permissions." />
              </div>
              </>)}

              {drawerTab === 'timeoff' && (<>
                {!employeeLookupDone ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#475569', fontSize: 13 }}>Loading…</div>
                ) : !linkedEmployee ? (
                  <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#fbbf24' }}>
                    No matching employee record found for "{editMember.full_name}". Time off balances live on the <code>employees</code> table (payroll record) — add this person there first (e.g. via "Add team member" → Bulk CSV, or directly in Supabase) using the exact same name, then balances will show here.
                  </div>
                ) : (<>
                  <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Balances</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                    {[
                      { key: 'pto', label: 'PTO', color: '#60a5fa' },
                      { key: 'sick', label: 'Sick', color: '#f87171' },
                      { key: 'vacation', label: 'Vacation', color: '#4ade80' },
                    ].map(b => (
                      <div key={b.key}>
                        <label style={lbl}>{b.label} days</label>
                        <input style={inp} type="number" step="0.5" value={(balanceEdits as any)[b.key]}
                          onChange={e => setBalanceEdits(prev => ({ ...prev, [b.key]: e.target.value }))} />
                      </div>
                    ))}
                  </div>

                  <label style={lbl}>Time off approver</label>
                  <select style={{ ...inp, marginBottom: 8 }} value={balanceEdits.approver_id}
                    onChange={e => setBalanceEdits(prev => ({ ...prev, approver_id: e.target.value }))}>
                    <option value="">— Any Admin/Manager (default) —</option>
                    {allEmployees.filter(e => e.id !== linkedEmployee.id).map(e => (
                      <option key={e.id} value={e.id}>{e.fname} {e.lname}</option>
                    ))}
                  </select>
                  <p style={{ margin: '0 0 16px', fontSize: 11, color: '#475569' }}>If set, this person's requests route to the selected approver. Leave blank to allow any Admin/Manager.</p>

                  <button onClick={handleSaveBalances} disabled={savingBalances}
                    style={{ width: '100%', padding: '10px', border: 'none', borderRadius: 8, background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: savingBalances ? 0.6 : 1, marginBottom: 24 }}>
                    {savingBalances ? 'Saving…' : 'Save balances'}
                  </button>

                  <div style={{ borderTop: '1px solid #1e293b', paddingTop: 16 }}>
                    <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requests</p>
                    {loadingTimeOff ? (
                      <div style={{ textAlign: 'center', padding: '1rem', color: '#475569', fontSize: 13 }}>Loading…</div>
                    ) : timeOffRequests.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '1rem', color: '#475569', fontSize: 13 }}>No time off requests yet.</div>
                    ) : timeOffRequests.map(req => {
                      const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
                        pending: { bg: 'rgba(251,191,36,0.1)', color: '#fbbf24' },
                        approved: { bg: 'rgba(74,222,128,0.1)', color: '#4ade80' },
                        denied: { bg: 'rgba(248,113,113,0.1)', color: '#f87171' },
                        cancelled: { bg: 'rgba(100,116,139,0.1)', color: '#64748b' },
                      }
                      return (
                        <div key={req.id} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', textTransform: 'capitalize' }}>{req.type}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: STATUS_COLOR[req.status].bg, color: STATUS_COLOR[req.status].color, textTransform: 'capitalize' }}>{req.status}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                            {new Date(req.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' – '}
                            {new Date(req.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' · '}{req.days} day{req.days !== 1 ? 's' : ''}
                          </div>
                          {req.reason && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>"{req.reason}"</div>}
                          {req.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => handleReviewRequest(req, 'approved')}
                                style={{ flex: 1, padding: '6px', border: 'none', borderRadius: 6, background: 'rgba(74,222,128,0.15)', color: '#4ade80', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
                                Approve
                              </button>
                              <button onClick={() => handleReviewRequest(req, 'denied')}
                                style={{ flex: 1, padding: '6px', border: 'none', borderRadius: 6, background: 'rgba(248,113,113,0.15)', color: '#f87171', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
                                Deny
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>)}
              </>)}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #1e293b', display: 'flex', gap: 8, justifyContent: 'space-between', flexShrink: 0 }}>
              <button onClick={() => setDeactivateConfirm(editMember)}
                style={{ padding: '9px 16px', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, background: 'rgba(248,113,113,0.1)', color: '#f87171', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                Deactivate user
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowEdit(false)} style={{ padding: '9px 16px', border: '1px solid #1e293b', borderRadius: 8, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
                {drawerTab === 'permissions' && (
                  <button onClick={handleSavePermissions} disabled={saving} style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving...' : 'Save changes'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}


      {/* DEACTIVATE CONFIRM */}
      {deactivateConfirm && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 600 }} onClick={() => setDeactivateConfirm(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 360, background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 601, padding: 24, textAlign: 'center' }}>
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

      {/* RESET PASSWORD MODAL */}
      {resetTarget && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 600 }} onClick={() => setResetTarget(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 360, background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 601, padding: 24 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>🔑 Reset Password</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>{resetTarget.full_name}</p>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }}>New Password (min 8 characters)</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password"
              style={{ width: '100%', padding: '9px 12px', background: '#0a0f1a', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12 }} />
            {resetMsg && <p style={{ margin: '0 0 12px', fontSize: 13, color: resetMsg.startsWith('✅') ? '#22c55e' : '#f87171' }}>{resetMsg}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setResetTarget(null)} style={{ flex: 1, padding: '10px', border: '1px solid #1e293b', borderRadius: 9, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleResetPassword} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 9, background: '#f59e0b', color: '#000', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>Reset Password</button>
            </div>
          </div>
        </>
      )}

      {/* SEND QR MODAL */}
      {sendQRState && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 600 }} onClick={() => setSendQRState(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, background: '#0d1526', border: '1px solid #1e293b', borderRadius: 16, zIndex: 601, padding: 24 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
              {sendQRState.channel === 'sms' ? '📱 Send QR Code via Text' : '📧 Send QR Code via Email'}
            </h3>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#94a3b8' }}>{sendQRState.member.full_name}</p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#475569' }}>
              {sendQRState.channel === 'sms'
                ? `Sending to: ${sendQRState.member.phone || '⚠️ No phone number on file'}`
                : `Sending to: ${sendQRState.member.email === '—' ? '⚠️ No email on file' : sendQRState.member.email}`}
            </p>
            <div style={{ background: '#0a0f1a', borderRadius: 10, padding: 14, marginBottom: 16, textAlign: 'center' }}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(getClockUrl(sendQRState.member))}`}
                alt="QR Preview" style={{ width: 140, height: 140, borderRadius: 6 }} />
              <p style={{ margin: '8px 0 0', fontSize: 11, color: '#475569' }}>
                Employee ID: {sendQRState.member.employee_id || sendQRState.member.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
            {qrSendMsg && <p style={{ margin: '0 0 12px', fontSize: 13, color: qrSendMsg.startsWith('✅') ? '#22c55e' : '#f87171', textAlign: 'center' }}>{qrSendMsg}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setSendQRState(null)} style={{ flex: 1, padding: '10px', border: '1px solid #1e293b', borderRadius: 9, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleSendQR} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 9, background: sendQRState.channel === 'sms' ? '#16a34a' : '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                {sendQRState.channel === 'sms' ? '📱 Send Text' : '📧 Send Email'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
