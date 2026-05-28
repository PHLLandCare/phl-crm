import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold';
type JobPriority = 'low' | 'normal' | 'high' | 'urgent';

interface ClientRef {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

interface EmployeeRef {
  id: string;
  name: string;
}

interface Job {
  id: string;
  job_number: string;
  title: string;
  description: string | null;
  client_id: string | null;
  client?: ClientRef | null;
  status: JobStatus;
  job_type: string | null;
  priority: JobPriority;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  assigned_to: string | null;
  employee?: EmployeeRef | null;
  service_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  instructions: string | null;
  customer_notes: string | null;
  total_amount: number;
  created_at: string;
  updated_at: string;
}

interface JobFormData {
  title: string;
  description: string;
  client_id: string;
  status: JobStatus;
  job_type: string;
  priority: JobPriority;
  scheduled_start: string;
  scheduled_end: string;
  assigned_to: string;
  service_address: string;
  city: string;
  state: string;
  zip: string;
  instructions: string;
  customer_notes: string;
  total_amount: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<JobStatus, { label: string; color: string; bg: string; dot: string }> = {
  draft:       { label: 'Draft',       color: 'text-gray-600',   bg: 'bg-gray-100',   dot: 'bg-gray-400'   },
  scheduled:   { label: 'Scheduled',   color: 'text-blue-700',   bg: 'bg-blue-100',   dot: 'bg-blue-500'   },
  in_progress: { label: 'In Progress', color: 'text-yellow-800', bg: 'bg-yellow-100', dot: 'bg-yellow-500' },
  completed:   { label: 'Completed',   color: 'text-green-700',  bg: 'bg-green-100',  dot: 'bg-green-500'  },
  cancelled:   { label: 'Cancelled',   color: 'text-red-600',    bg: 'bg-red-100',    dot: 'bg-red-400'    },
  on_hold:     { label: 'On Hold',     color: 'text-orange-700', bg: 'bg-orange-100', dot: 'bg-orange-400' },
};

const PRIORITY_CONFIG: Record<JobPriority, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'text-gray-500'  },
  normal: { label: 'Normal', color: 'text-blue-600'  },
  high:   { label: 'High',   color: 'text-orange-600'},
  urgent: { label: 'Urgent', color: 'text-red-600'   },
};

const JOB_TYPES = [
  { value: 'lawn_care',    label: '🌿 Lawn Care'    },
  { value: 'landscaping',  label: '🌳 Landscaping'  },
  { value: 'irrigation',   label: '💧 Irrigation'   },
  { value: 'tree_service', label: '🪓 Tree Service'  },
  { value: 'pest_control', label: '🐛 Pest Control'  },
  { value: 'other',        label: '🔧 Other'         },
];

const ALL_STATUSES: JobStatus[] = ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled', 'on_hold'];

const EMPTY_FORM: JobFormData = {
  title: '', description: '', client_id: '', status: 'draft',
  job_type: '', priority: 'normal', scheduled_start: '', scheduled_end: '',
  assigned_to: '', service_address: '', city: '', state: '', zip: '',
  instructions: '', customer_notes: '', total_amount: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function toInputDateTime(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16); // "YYYY-MM-DDTHH:MM"
}

function clientName(c?: ClientRef | null): string {
  if (!c) return '—';
  return `${c.first_name} ${c.last_name}`.trim();
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: JobStatus }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const SkeletonRow: React.FC = () => (
  <div className="animate-pulse flex items-center gap-4 px-6 py-4 border-b border-gray-100">
    <div className="h-4 bg-gray-200 rounded w-20" />
    <div className="h-4 bg-gray-200 rounded flex-1" />
    <div className="h-6 bg-gray-200 rounded-full w-24" />
    <div className="h-4 bg-gray-200 rounded w-32" />
    <div className="h-4 bg-gray-200 rounded w-24" />
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const JobsPage: React.FC = () => {
  // Data
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<ClientRef[]>([]);
  const [employees, setEmployees] = useState<EmployeeRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [form, setForm] = useState<JobFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // ── Fetch ──

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('jobs')
        .select(`
          id, job_number, title, description, client_id, status, job_type,
          priority, scheduled_start, scheduled_end, actual_start, actual_end,
          assigned_to, service_address, city, state, zip,
          instructions, customer_notes, total_amount, created_at, updated_at,
          client:clients(id, first_name, last_name, email, phone),
          employee:employees(id, name)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (err) throw new Error(err.message);
      setJobs((data ?? []) as Job[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, first_name, last_name, email, phone')
      .is('deleted_at', null)
      .order('last_name');
    setClients((data as ClientRef[]) ?? []);
  }, []);

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('employees')
      .select('id, name')
      .order('name');
    setEmployees((data as EmployeeRef[]) ?? []);
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchClients();
    fetchEmployees();
  }, [fetchJobs, fetchClients, fetchEmployees]);

  // ── Filtering ──

  const filteredJobs = jobs.filter(j => {
    const matchSearch = !searchQuery
      || j.title.toLowerCase().includes(searchQuery.toLowerCase())
      || j.job_number.toLowerCase().includes(searchQuery.toLowerCase())
      || clientName(j.client).toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'all' || j.status === statusFilter;
    const matchType = typeFilter === 'all' || j.job_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  // ── Status quick-change ──

  const handleStatusChange = async (job: Job, newStatus: JobStatus) => {
    const updates: Partial<Job> = { status: newStatus };
    if (newStatus === 'in_progress' && !job.actual_start) {
      updates.actual_start = new Date().toISOString();
    }
    if (newStatus === 'completed' && !job.actual_end) {
      updates.actual_end = new Date().toISOString();
    }

    const { error: err } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', job.id);

    if (err) { alert('Failed to update status: ' + err.message); return; }

    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, ...updates } : j));
    if (selectedJob?.id === job.id) setSelectedJob(prev => prev ? { ...prev, ...updates } : prev);
  };

  // ── Open modal ──

  const openCreate = () => {
    setEditingJob(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (job: Job) => {
    setEditingJob(job);
    setForm({
      title: job.title,
      description: job.description ?? '',
      client_id: job.client_id ?? '',
      status: job.status,
      job_type: job.job_type ?? '',
      priority: job.priority,
      scheduled_start: toInputDateTime(job.scheduled_start),
      scheduled_end: toInputDateTime(job.scheduled_end),
      assigned_to: job.assigned_to ?? '',
      service_address: job.service_address ?? '',
      city: job.city ?? '',
      state: job.state ?? '',
      zip: job.zip ?? '',
      instructions: job.instructions ?? '',
      customer_notes: job.customer_notes ?? '',
      total_amount: job.total_amount ? String(job.total_amount) : '',
    });
    setFormError(null);
    setShowModal(true);
  };

  // ── Save ──

  const handleSave = async () => {
    if (!form.title.trim()) { setFormError('Job title is required.'); return; }
    setSaving(true);
    setFormError(null);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      client_id: form.client_id || null,
      status: form.status,
      job_type: form.job_type || null,
      priority: form.priority,
      scheduled_start: form.scheduled_start ? new Date(form.scheduled_start).toISOString() : null,
      scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : null,
      assigned_to: form.assigned_to || null,
      service_address: form.service_address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      zip: form.zip.trim() || null,
      instructions: form.instructions.trim() || null,
      customer_notes: form.customer_notes.trim() || null,
      total_amount: parseFloat(form.total_amount) || 0,
    };

    try {
      if (editingJob) {
        const { error: err } = await supabase.from('jobs').update(payload).eq('id', editingJob.id);
        if (err) throw new Error(err.message);
      } else {
        const { error: err } = await supabase.from('jobs').insert(payload);
        if (err) throw new Error(err.message);
      }
      setShowModal(false);
      fetchJobs();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to save job');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──

  const handleDelete = async (id: string) => {
    const { error: err } = await supabase
      .from('jobs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (err) { alert('Failed to delete: ' + err.message); return; }
    setDeleteConfirm(null);
    setSelectedJob(null);
    fetchJobs();
  };

  // ── Stats ──

  const stats = {
    total: jobs.length,
    scheduled: jobs.filter(j => j.status === 'scheduled').length,
    inProgress: jobs.filter(j => j.status === 'in_progress').length,
    completed: jobs.filter(j => j.status === 'completed').length,
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage and track all field service jobs</p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Job
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Total Jobs',   value: stats.total,      color: 'text-gray-900'  },
            { label: 'Scheduled',    value: stats.scheduled,  color: 'text-blue-700'  },
            { label: 'In Progress',  value: stats.inProgress, color: 'text-yellow-700'},
            { label: 'Completed',    value: stats.completed,  color: 'text-green-700' },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500 font-medium">{s.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search jobs, clients…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as JobStatus | 'all')}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        >
          <option value="all">All Statuses</option>
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        >
          <option value="all">All Types</option>
          {JOB_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <span className="text-xs text-gray-400 ml-auto">
          {filteredJobs.length} of {jobs.length} jobs
        </span>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
          <button onClick={fetchJobs} className="ml-auto underline text-red-600 hover:text-red-800">Retry</button>
        </div>
      )}

      {/* ── Table / List ── */}
      <div className="mx-6 my-5">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
            <div className="text-5xl mb-4">🏗️</div>
            <p className="text-gray-700 font-semibold text-lg">No jobs found</p>
            <p className="text-gray-400 text-sm mt-1 mb-6">
              {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first job to get started'}
            </p>
            {!searchQuery && statusFilter === 'all' && typeFilter === 'all' && (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Job
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Job #</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title / Client</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scheduled</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredJobs.map(job => (
                    <tr
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {job.job_number}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{job.title}</p>
                        {job.client && (
                          <p className="text-xs text-gray-400 mt-0.5">{clientName(job.client)}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {JOB_TYPES.find(t => t.value === job.job_type)?.label ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {job.scheduled_start ? formatDate(job.scheduled_start) : '—'}
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {job.employee?.name ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-900">
                        {job.total_amount > 0 ? `$${Number(job.total_amount).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={e => { e.stopPropagation(); openEdit(job); }}
                          className="text-xs text-gray-400 hover:text-green-600 font-medium transition-colors"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {filteredJobs.map(job => (
                <div
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 cursor-pointer active:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-gray-400">{job.job_number}</span>
                        <StatusBadge status={job.status} />
                      </div>
                      <p className="font-semibold text-gray-900 truncate">{job.title}</p>
                      {job.client && (
                        <p className="text-sm text-gray-500 mt-0.5">{clientName(job.client)}</p>
                      )}
                    </div>
                    {job.total_amount > 0 && (
                      <span className="font-bold text-gray-900 text-sm flex-shrink-0">
                        ${Number(job.total_amount).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                    {job.scheduled_start && (
                      <span>📅 {formatDate(job.scheduled_start)}</span>
                    )}
                    {job.employee?.name && (
                      <span>👤 {job.employee.name}</span>
                    )}
                    {job.job_type && (
                      <span>{JOB_TYPES.find(t => t.value === job.job_type)?.label}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Detail Slide-Over ── */}
      {selectedJob && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedJob(null)} />
          <div className="relative z-50 w-full max-w-lg bg-white shadow-2xl h-full overflow-y-auto flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-gray-200 bg-white sticky top-0 z-10">
              <div>
                <span className="font-mono text-xs text-gray-400">{selectedJob.job_number}</span>
                <h2 className="text-lg font-bold text-gray-900 mt-0.5">{selectedJob.title}</h2>
                {selectedJob.client && (
                  <p className="text-sm text-gray-500 mt-0.5">{clientName(selectedJob.client)}</p>
                )}
              </div>
              <button onClick={() => setSelectedJob(null)} className="text-gray-400 hover:text-gray-600 mt-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Status bar */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 font-medium mb-2">Quick Status Change</p>
              <div className="flex flex-wrap gap-2">
                {ALL_STATUSES.map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const active = selectedJob.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(selectedJob, s)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                        active
                          ? `${cfg.bg} ${cfg.color} border-transparent ring-2 ring-offset-1 ring-green-500`
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 px-6 py-5 space-y-6">
              {/* Details grid */}
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Status">
                  <StatusBadge status={selectedJob.status} />
                </DetailField>
                <DetailField label="Priority">
                  <span className={`text-sm font-semibold ${PRIORITY_CONFIG[selectedJob.priority].color}`}>
                    {PRIORITY_CONFIG[selectedJob.priority].label}
                  </span>
                </DetailField>
                <DetailField label="Type">
                  {JOB_TYPES.find(t => t.value === selectedJob.job_type)?.label ?? '—'}
                </DetailField>
                <DetailField label="Amount">
                  {selectedJob.total_amount > 0
                    ? <span className="font-bold text-gray-900">${Number(selectedJob.total_amount).toFixed(2)}</span>
                    : '—'}
                </DetailField>
                <DetailField label="Scheduled Start">
                  {formatDateTime(selectedJob.scheduled_start)}
                </DetailField>
                <DetailField label="Scheduled End">
                  {formatDateTime(selectedJob.scheduled_end)}
                </DetailField>
                <DetailField label="Actual Start">
                  {formatDateTime(selectedJob.actual_start)}
                </DetailField>
                <DetailField label="Actual End">
                  {formatDateTime(selectedJob.actual_end)}
                </DetailField>
                <DetailField label="Assigned To" className="col-span-2">
                  {selectedJob.employee?.name ?? '—'}
                </DetailField>
              </div>

              {/* Address */}
              {(selectedJob.service_address || selectedJob.city) && (
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Service Address</p>
                  <p className="text-sm text-gray-700">
                    {[selectedJob.service_address, selectedJob.city, selectedJob.state, selectedJob.zip]
                      .filter(Boolean).join(', ')}
                  </p>
                </div>
              )}

              {/* Description */}
              {selectedJob.description && (
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedJob.description}</p>
                </div>
              )}

              {/* Instructions */}
              {selectedJob.instructions && (
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Crew Instructions</p>
                  <p className="text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3 whitespace-pre-wrap">
                    {selectedJob.instructions}
                  </p>
                </div>
              )}

              {/* Customer Notes */}
              {selectedJob.customer_notes && (
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Customer Notes</p>
                  <p className="text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-3 whitespace-pre-wrap">
                    {selectedJob.customer_notes}
                  </p>
                </div>
              )}

              {/* Meta */}
              <div className="text-xs text-gray-400 border-t border-gray-100 pt-4">
                <p>Created {formatDate(selectedJob.created_at)}</p>
                <p>Updated {formatDate(selectedJob.updated_at)}</p>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-gray-200 bg-white sticky bottom-0 flex gap-3">
              <button
                onClick={() => openEdit(selectedJob)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors"
              >
                Edit Job
              </button>
              <button
                onClick={() => setDeleteConfirm(selectedJob.id)}
                className="px-4 py-2.5 text-red-600 border border-red-200 hover:bg-red-50 font-semibold rounded-lg text-sm transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative z-50 w-full max-w-2xl bg-white rounded-2xl shadow-2xl my-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">
                {editingJob ? `Edit Job — ${editingJob.job_number}` : 'New Job'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {formError}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Job Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Spring Lawn Cleanup"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Client + Status row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Client</label>
                  <select
                    value={form.client_id}
                    onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  >
                    <option value="">— Select client —</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{clientName(c)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as JobStatus }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  >
                    {ALL_STATUSES.map(s => (
                      <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Type + Priority row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Job Type</label>
                  <select
                    value={form.job_type}
                    onChange={e => setForm(f => ({ ...f, job_type: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  >
                    <option value="">— Select type —</option>
                    {JOB_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Priority</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as JobPriority }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  >
                    {(Object.keys(PRIORITY_CONFIG) as JobPriority[]).map(p => (
                      <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Scheduled times */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Scheduled Start</label>
                  <input
                    type="datetime-local"
                    value={form.scheduled_start}
                    onChange={e => setForm(f => ({ ...f, scheduled_start: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Scheduled End</label>
                  <input
                    type="datetime-local"
                    value={form.scheduled_end}
                    onChange={e => setForm(f => ({ ...f, scheduled_end: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Assigned To + Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Assigned To</label>
                  <select
                    value={form.assigned_to}
                    onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  >
                    <option value="">— Unassigned —</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Total Amount ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.total_amount}
                    onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Service Address */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Service Address</label>
                <input
                  type="text"
                  value={form.service_address}
                  onChange={e => setForm(f => ({ ...f, service_address: e.target.value }))}
                  placeholder="Street address"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="City"
                    className="col-span-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <input
                    type="text"
                    value={form.state}
                    onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                    placeholder="State"
                    className="col-span-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <input
                    type="text"
                    value={form.zip}
                    onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
                    placeholder="ZIP"
                    className="col-span-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What needs to be done…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>

              {/* Crew Instructions */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Crew Instructions
                  <span className="ml-1 text-xs font-normal text-gray-400">(internal only)</span>
                </label>
                <textarea
                  rows={2}
                  value={form.instructions}
                  onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                  placeholder="Gate code, access notes, special equipment…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>

              {/* Customer Notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Customer Notes
                  <span className="ml-1 text-xs font-normal text-gray-400">(visible to client)</span>
                </label>
                <textarea
                  rows={2}
                  value={form.customer_notes}
                  onChange={e => setForm(f => ({ ...f, customer_notes: e.target.value }))}
                  placeholder="Notes to share with the customer…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="px-5 py-2.5 text-sm font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {saving && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {saving ? 'Saving…' : editingJob ? 'Save Changes' : 'Create Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative z-50 bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <div className="text-4xl mb-3">🗑️</div>
            <h3 className="text-lg font-bold text-gray-900">Delete this job?</h3>
            <p className="text-sm text-gray-500 mt-1 mb-5">
              This action cannot be undone. The job will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── DetailField helper ────────────────────────────────────────────────────────

interface DetailFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

const DetailField: React.FC<DetailFieldProps> = ({ label, children, className = '' }) => (
  <div className={className}>
    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">{label}</p>
    <div className="text-sm text-gray-700">{children}</div>
  </div>
);

export default JobsPage;
