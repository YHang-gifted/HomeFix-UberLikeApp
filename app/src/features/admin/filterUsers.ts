import type { AccountStatus, AdminUserSummary, Role } from '../../../../shared/schemas';

/** The active filter for the admin users list. `'all'` means no filter on that axis. */
export interface AdminUserFilter {
  /** Case-insensitive substring matched against email or display name. */
  query: string;
  role: Role | 'all';
  status: AccountStatus | 'all';
}

/** Filter the admin users list by a free-text query and optional role/status. */
export function filterAdminUsers(
  users: AdminUserSummary[],
  filter: AdminUserFilter,
): AdminUserSummary[] {
  const query = filter.query.trim().toLowerCase();
  return users.filter((user) => {
    if (filter.role !== 'all' && user.role !== filter.role) {
      return false;
    }
    if (filter.status !== 'all' && user.status !== filter.status) {
      return false;
    }
    if (
      query !== '' &&
      !user.email.toLowerCase().includes(query) &&
      !user.displayName.toLowerCase().includes(query)
    ) {
      return false;
    }
    return true;
  });
}
