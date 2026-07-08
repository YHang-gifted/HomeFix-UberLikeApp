import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { AdminCertificationsScreen } from './AdminCertificationsScreen';

const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function clientWith(extra: Record<string, unknown>) {
  return { getPrincipal: jest.fn(), ...extra } as unknown as ApiClient;
}

function makeCert(overrides = {}) {
  return {
    id: '623e4567-e89b-12d3-a456-426614174777',
    workerId: WORKER_ID,
    category: 'electrical',
    title: 'Journeyman Electrician License',
    documentUrl: 'https://cdn.example.com/certs/jle.pdf',
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('AdminCertificationsScreen', () => {
  it('verifies a pending certification and removes it from the queue', async () => {
    const reviewCertification = jest.fn().mockResolvedValue(makeCert({ status: 'verified' }));
    const client = clientWith({
      listAdminCertifications: jest.fn().mockResolvedValue([makeCert()]),
      reviewCertification,
    });

    const { findByLabelText, queryByText } = await render(
      <AdminCertificationsScreen client={client} />,
    );

    await fireEvent.press(await findByLabelText('Verify Journeyman Electrician License'));
    await waitFor(() => {
      expect(reviewCertification).toHaveBeenCalledWith(makeCert().id, 'verify', undefined);
    });
    await waitFor(() => {
      expect(queryByText('Journeyman Electrician License')).toBeNull();
    });
  });

  it('requires a reason to reject', async () => {
    const reviewCertification = jest.fn();
    const client = clientWith({
      listAdminCertifications: jest.fn().mockResolvedValue([makeCert()]),
      reviewCertification,
    });

    const { findByLabelText, findByText } = await render(
      <AdminCertificationsScreen client={client} />,
    );

    await fireEvent.press(await findByLabelText('Reject Journeyman Electrician License'));
    await findByText('Enter a reason to reject.');
    expect(reviewCertification).not.toHaveBeenCalled();
  });

  it('rejects with a reason', async () => {
    const reviewCertification = jest.fn().mockResolvedValue(makeCert({ status: 'rejected' }));
    const client = clientWith({
      listAdminCertifications: jest.fn().mockResolvedValue([makeCert()]),
      reviewCertification,
    });

    const { findByLabelText, queryByText } = await render(
      <AdminCertificationsScreen client={client} />,
    );

    await fireEvent.changeText(
      await findByLabelText('Rejection reason for Journeyman Electrician License'),
      'Document is illegible.',
    );
    await fireEvent.press(await findByLabelText('Reject Journeyman Electrician License'));

    await waitFor(() => {
      expect(reviewCertification).toHaveBeenCalledWith(
        makeCert().id,
        'reject',
        'Document is illegible.',
      );
    });
    await waitFor(() => {
      expect(queryByText('Journeyman Electrician License')).toBeNull();
    });
  });
});
