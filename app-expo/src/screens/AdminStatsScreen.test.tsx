import { render } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { AdminStats } from '../../../shared/schemas';
import { AdminStatsScreen } from './AdminStatsScreen';

function makeStats(overrides: Partial<AdminStats> = {}): AdminStats {
  return {
    totalRequests: 7,
    requestsByStatus: {
      pending: 2,
      matched: 1,
      accepted: 1,
      in_progress: 1,
      completed: 1,
      cancelled: 1,
    },
    paidPaymentsCount: 3,
    paidAmountCents: 200000,
    workerCount: 4,
    ...overrides,
  };
}

describe('AdminStatsScreen', () => {
  it('renders the aggregate dashboard figures', async () => {
    const getAdminStats = jest.fn().mockResolvedValue(makeStats());
    const client = { getAdminStats } as unknown as ApiClient;

    const { findByText, getByText } = await render(<AdminStatsScreen client={client} />);

    await findByText('Total');
    getByText('7'); // total requests
    getByText('In progress'); // status label with underscore replaced
    getByText('NT$2,000.00'); // paid total
  });

  it('shows an error message when loading fails', async () => {
    const getAdminStats = jest.fn().mockRejectedValue(new Error('boom'));
    const client = { getAdminStats } as unknown as ApiClient;

    const { findByText } = await render(<AdminStatsScreen client={client} />);
    await findByText('Could not load the dashboard.');
  });
});
