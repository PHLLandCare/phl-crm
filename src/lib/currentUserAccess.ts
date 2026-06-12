import { supabase } from './supabase'

export type UserRole = 'superadmin' | 'manager' | 'dispatcher' | 'worker' | 'worker_limited'

export interface CurrentUserAccess {
  role: UserRole
  fullName: string
  /** True for roles that should only see their own assigned jobs/schedule/routes */
  isFieldWorker: boolean
}

/**
 * Looks up the logged-in user's role and display name from user_profiles.
 * Used to scope Jobs/Schedule/Route data so field workers only see jobs
 * assigned to them, while admins/managers/dispatchers see everything.
 */
export async function getCurrentUserAccess(): Promise<CurrentUserAccess> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { role: 'worker_limited', fullName: '', isFieldWorker: true }

  const { data: profile } = await supabase.from('user_profiles').select('full_name, role').eq('id', user.id).single()
  const role = (profile?.role as UserRole) || 'worker_limited'
  const fullName = profile?.full_name || ''
  const isFieldWorker = role === 'worker' || role === 'worker_limited'

  return { role, fullName, isFieldWorker }
}

/**
 * Filters a list of records (jobs, schedules, routes) down to only those
 * assigned to the given user, matching on the assigned person's name
 * (case-insensitive). Admins/managers/dispatchers pass everything through
 * unchanged. `getAssignedName` extracts the assigned-person name string
 * from a record (field name varies: `assigned_name` on jobs, `assigned_to`
 * on schedule items, etc.)
 */
export function filterAssignedTo<T>(
  records: T[],
  access: CurrentUserAccess,
  getAssignedName: (record: T) => string | null | undefined
): T[] {
  if (!access.isFieldWorker) return records
  const name = access.fullName.trim().toLowerCase()
  if (!name) return records
  return records.filter(r => (getAssignedName(r) || '').trim().toLowerCase() === name)
}
