import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { isApiError } from '../../../app/src/services/apiClient';
import { filterAdminUsers } from '../../../app/src/features/admin/filterUsers';
import type { AccountStatus, AdminUserSummary, Role } from '../../../shared/schemas';
import { apiClient } from '../api';

const ROLE_OPTIONS: (Role | 'all')[] = ['all', 'customer', 'worker', 'admin'];
const STATUS_OPTIONS: (AccountStatus | 'all')[] = ['all', 'active', 'suspended', 'deleted'];

function optionLabel(option: string): string {
  return option === 'all' ? 'All' : option.charAt(0).toUpperCase() + option.slice(1);
}

function FilterChip({
  label,
  accessibilityLabel,
  active,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  active: boolean;
  onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export interface AdminUsersScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

const STATUS_STYLE: Record<AccountStatus, { bg: string; fg: string }> = {
  active: { bg: '#dcfce7', fg: '#166534' },
  suspended: { bg: '#fef3c7', fg: '#92400e' },
  deleted: { bg: '#e2e8f0', fg: '#475569' },
};

export function AdminUsersScreen({ client, refreshToken }: AdminUsersScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);
  const selfId = useMemo(() => activeClient.getPrincipal()?.id, [activeClient]);

  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('all');

  const visibleUsers = useMemo(
    () =>
      users === null
        ? []
        : filterAdminUsers(users, { query, role: roleFilter, status: statusFilter }),
    [users, query, roleFilter, statusFilter],
  );

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const found = await activeClient.adminListUsers();
        if (active) {
          setUsers(found);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load users.');
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken]);

  function applyStatus(id: string, status: AccountStatus): void {
    setUsers((current) =>
      current === null ? current : current.map((u) => (u.id === id ? { ...u, status } : u)),
    );
  }

  async function changeStatus(user: AdminUserSummary, suspend: boolean): Promise<void> {
    setBusyId(user.id);
    setActionError(null);
    try {
      const status = suspend
        ? await activeClient.adminSuspendUser(user.id)
        : await activeClient.adminReinstateUser(user.id);
      applyStatus(user.id, status);
    } catch (changeError) {
      setActionError(
        isApiError(changeError) ? changeError.message : 'Could not update the account.',
      );
    } finally {
      setBusyId(null);
    }
  }

  if (error !== null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (users === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or email"
          accessibilityLabel="Search users"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <View style={styles.chipRow}>
          {ROLE_OPTIONS.map((option) => (
            <FilterChip
              key={option}
              label={optionLabel(option)}
              accessibilityLabel={`Role ${optionLabel(option)}`}
              active={roleFilter === option}
              onPress={() => {
                setRoleFilter(option);
              }}
            />
          ))}
        </View>
        <View style={styles.chipRow}>
          {STATUS_OPTIONS.map((option) => (
            <FilterChip
              key={option}
              label={optionLabel(option)}
              accessibilityLabel={`Status ${optionLabel(option)}`}
              active={statusFilter === option}
              onPress={() => {
                setStatusFilter(option);
              }}
            />
          ))}
        </View>
      </View>
      {actionError !== null && <Text style={styles.actionError}>{actionError}</Text>}
      <FlatList
        data={visibleUsers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListEmptyComponent={<Text style={styles.empty}>No users match your filters.</Text>}
        renderItem={({ item }) => {
          const palette = STATUS_STYLE[item.status];
          const isSelf = item.id === selfId;
          const canAct = item.status !== 'deleted' && !isSelf;
          const suspend = item.status === 'active';
          return (
            <View style={styles.row}>
              <View style={styles.info}>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.email}>{item.email}</Text>
                <View style={styles.badges}>
                  <Text style={styles.role}>{item.role}</Text>
                  <Text style={[styles.status, { backgroundColor: palette.bg, color: palette.fg }]}>
                    {item.status}
                  </Text>
                  {isSelf && <Text style={styles.you}>you</Text>}
                </View>
              </View>
              {canAct && (
                <Pressable
                  style={[styles.action, suspend ? styles.suspend : styles.reinstate]}
                  onPress={() => {
                    void changeStatus(item, suspend);
                  }}
                  disabled={busyId === item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${suspend ? 'Suspend' : 'Reinstate'} ${item.displayName}`}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator color={suspend ? '#ffffff' : '#2563eb'} />
                  ) : (
                    <Text style={suspend ? styles.suspendText : styles.reinstateText}>
                      {suspend ? 'Suspend' : 'Reinstate'}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: '#64748b', fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  filters: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  search: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#475569' },
  chipTextActive: { color: '#ffffff', fontWeight: '600' },
  error: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  actionError: { color: '#dc2626', fontSize: 14, padding: 16, paddingBottom: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  email: { fontSize: 13, color: '#64748b', marginTop: 2 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  role: { fontSize: 12, color: '#2563eb', textTransform: 'capitalize' },
  status: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  you: { fontSize: 12, color: '#94a3b8' },
  action: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suspend: { backgroundColor: '#dc2626' },
  suspendText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  reinstate: { borderWidth: 1, borderColor: '#2563eb' },
  reinstateText: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
});
