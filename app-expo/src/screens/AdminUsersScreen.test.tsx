import { fireEvent, render } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { AdminUserSummary } from '../../../shared/schemas';
import { AdminUsersScreen } from './AdminUsersScreen';

const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const VICTIM_ID = '123e4567-e89b-12d3-a456-426614174000';

function users(victimStatus: AdminUserSummary['status']): AdminUserSummary[] {
  return [
    {
      id: ADMIN_ID,
      email: 'admin@homefix.test',
      displayName: 'Admin',
      role: 'admin',
      status: 'active',
    },
    {
      id: VICTIM_ID,
      email: 'victim@homefix.test',
      displayName: 'Victim',
      role: 'customer',
      status: victimStatus,
    },
  ];
}

function makeClient(overrides: Partial<ApiClient>): ApiClient {
  return {
    getPrincipal: () => ({ id: ADMIN_ID, role: 'admin' }),
    ...overrides,
  } as unknown as ApiClient;
}

describe('AdminUsersScreen', () => {
  it('suspends an active account and swaps the button to Reinstate', async () => {
    const adminListUsers = jest.fn().mockResolvedValue(users('active'));
    const adminSuspendUser = jest.fn().mockResolvedValue('suspended');
    const client = makeClient({ adminListUsers, adminSuspendUser });

    const { findByLabelText, queryByLabelText } = await render(
      <AdminUsersScreen client={client} />,
    );

    // The admin's own row cannot be suspended.
    expect(queryByLabelText('Suspend Admin')).toBeNull();

    await fireEvent.press(await findByLabelText('Suspend Victim'));

    expect(adminSuspendUser).toHaveBeenCalledWith(VICTIM_ID);
    await findByLabelText('Reinstate Victim');
  });

  it('reinstates a suspended account', async () => {
    const adminListUsers = jest.fn().mockResolvedValue(users('suspended'));
    const adminReinstateUser = jest.fn().mockResolvedValue('active');
    const client = makeClient({ adminListUsers, adminReinstateUser });

    const { findByLabelText } = await render(<AdminUsersScreen client={client} />);

    await fireEvent.press(await findByLabelText('Reinstate Victim'));

    expect(adminReinstateUser).toHaveBeenCalledWith(VICTIM_ID);
    await findByLabelText('Suspend Victim');
  });
});
