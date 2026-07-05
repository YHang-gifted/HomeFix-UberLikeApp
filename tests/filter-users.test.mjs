import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { filterAdminUsers } from '../app/src/features/admin/filterUsers.ts';

const users = [
  {
    id: '1',
    email: 'alice@homefix.test',
    displayName: 'Alice',
    role: 'customer',
    status: 'active',
  },
  {
    id: '2',
    email: 'bob@homefix.test',
    displayName: 'Bob Builder',
    role: 'worker',
    status: 'active',
  },
  {
    id: '3',
    email: 'carol@homefix.test',
    displayName: 'Carol',
    role: 'worker',
    status: 'suspended',
  },
  { id: '4', email: 'admin@homefix.test', displayName: 'Admin', role: 'admin', status: 'active' },
];

function names(list) {
  return list.map((u) => u.displayName);
}

describe('filterAdminUsers', () => {
  it('returns everyone with no query and all filters', () => {
    assert.equal(filterAdminUsers(users, { query: '', role: 'all', status: 'all' }).length, 4);
  });

  it('matches the query against the display name (case-insensitive)', () => {
    assert.deepEqual(names(filterAdminUsers(users, { query: 'BOB', role: 'all', status: 'all' })), [
      'Bob Builder',
    ]);
  });

  it('matches the query against the email', () => {
    assert.deepEqual(
      names(filterAdminUsers(users, { query: 'carol@homefix', role: 'all', status: 'all' })),
      ['Carol'],
    );
  });

  it('filters by role', () => {
    assert.deepEqual(names(filterAdminUsers(users, { query: '', role: 'worker', status: 'all' })), [
      'Bob Builder',
      'Carol',
    ]);
  });

  it('filters by status', () => {
    assert.deepEqual(
      names(filterAdminUsers(users, { query: '', role: 'all', status: 'suspended' })),
      ['Carol'],
    );
  });

  it('combines query, role, and status', () => {
    assert.deepEqual(
      names(filterAdminUsers(users, { query: '', role: 'worker', status: 'active' })),
      ['Bob Builder'],
    );
  });
});
