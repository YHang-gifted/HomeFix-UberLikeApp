import { fireEvent, render } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ServiceRequest } from '../../../shared/schemas';
import { CreateRequestScreen } from './CreateRequestScreen';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

function makeRequest(): ServiceRequest {
  return {
    id: '223e4567-e89b-12d3-a456-426614174000',
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
  };
}

describe('CreateRequestScreen', () => {
  it('shows validation errors and does not call the API on an empty submit', async () => {
    const createServiceRequest = jest.fn();
    const getPrincipal = jest.fn();
    const client = { createServiceRequest, getPrincipal } as unknown as ApiClient;

    const { getByLabelText, findByText } = await render(<CreateRequestScreen client={client} />);
    await fireEvent.press(getByLabelText('Create request'));

    await findByText('Choose a valid category');
    await findByText('Description is required');
    expect(createServiceRequest).not.toHaveBeenCalled();
  });

  it('creates the request and calls onCreated on a valid submit', async () => {
    const created = makeRequest();
    const createServiceRequest = jest.fn().mockResolvedValue(created);
    const getPrincipal = jest.fn().mockReturnValue({ id: CUSTOMER_ID, role: 'customer' });
    const client = { createServiceRequest, getPrincipal } as unknown as ApiClient;
    const onCreated = jest.fn();

    const { getByLabelText, findByText } = await render(
      <CreateRequestScreen client={client} onCreated={onCreated} />,
    );
    await fireEvent.press(getByLabelText('Category plumbing'));
    await fireEvent.changeText(getByLabelText('Description'), 'Leaking kitchen sink');
    await fireEvent.changeText(getByLabelText('Latitude'), '25.03');
    await fireEvent.changeText(getByLabelText('Longitude'), '121.56');
    await fireEvent.press(getByLabelText('Create request'));

    await findByText('Request created');
    expect(createServiceRequest).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      category: 'plumbing',
      description: 'Leaking kitchen sink',
      location: { latitude: 25.03, longitude: 121.56 },
    });
    expect(onCreated).toHaveBeenCalledWith(created);
  });
});
