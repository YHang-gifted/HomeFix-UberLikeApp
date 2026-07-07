import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { CertificationsScreen } from './CertificationsScreen';

const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function clientWith(extra: Record<string, unknown>) {
  return {
    getPrincipal: jest.fn().mockReturnValue({ id: WORKER_ID, role: 'worker' }),
    ...extra,
  } as unknown as ApiClient;
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

describe('CertificationsScreen', () => {
  it('lists the worker certifications with their statuses and a rejection reason', async () => {
    const client = clientWith({
      listMyCertifications: jest
        .fn()
        .mockResolvedValue([
          makeCert({ status: 'verified', title: 'Verified plumbing' }),
          makeCert({ id: 'p2', status: 'pending', title: 'Pending HVAC' }),
          makeCert({
            id: 'r3',
            status: 'rejected',
            title: 'Bad scan',
            rejectionReason: 'Illegible.',
          }),
        ]),
    });

    const { findByText } = await render(<CertificationsScreen client={client} />);

    await findByText('Verified plumbing');
    await findByText('Verified');
    await findByText('Pending review');
    await findByText('Rejected');
    await findByText('Reason: Illegible.');
  });

  it('validates that a category, title, and document are provided before submit', async () => {
    const submitCertification = jest.fn();
    const client = clientWith({
      listMyCertifications: jest.fn().mockResolvedValue([]),
      submitCertification,
    });

    const { findByLabelText, findByText } = await render(
      // No imagePicker → no document can be attached.
      <CertificationsScreen client={client} />,
    );

    await fireEvent.press(await findByLabelText('Category electrical'));
    await fireEvent.press(await findByLabelText('Submit certification'));

    await findByText(/Choose a category, enter a title, and upload/);
    expect(submitCertification).not.toHaveBeenCalled();
  });

  it('uploads a document and submits a new certification', async () => {
    const submitCertification = jest
      .fn()
      .mockResolvedValue(makeCert({ id: 'new', status: 'pending', title: 'JLE' }));
    const client = clientWith({
      listMyCertifications: jest.fn().mockResolvedValue([]),
      createUpload: jest
        .fn()
        .mockResolvedValue({ uploadUrl: 'https://up/x', publicUrl: '/u/1.jpg' }),
      putUploadBytes: jest.fn().mockResolvedValue(undefined),
      resolveUrl: jest.fn((p: string) => `https://api.example.com${p}`),
      submitCertification,
    });
    const imagePicker = jest.fn().mockResolvedValue({ blob: {}, contentType: 'image/jpeg' });

    const { findByLabelText, findByText } = await render(
      <CertificationsScreen client={client} imagePicker={imagePicker} />,
    );

    await fireEvent.press(await findByLabelText('Category electrical'));
    await fireEvent.changeText(await findByLabelText('Certification title'), 'JLE');
    await fireEvent.press(await findByLabelText('Upload document'));
    await waitFor(() => {
      expect(client.createUpload).toHaveBeenCalled();
    });
    await findByText('Document attached ✓');

    await fireEvent.press(await findByLabelText('Submit certification'));
    await waitFor(() => {
      expect(submitCertification).toHaveBeenCalledWith({
        category: 'electrical',
        title: 'JLE',
        documentUrl: 'https://api.example.com/u/1.jpg',
      });
    });
    await findByText('Submitted for review.');
  });
});
