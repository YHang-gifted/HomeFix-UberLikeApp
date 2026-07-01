import { fireEvent, render, waitFor } from '@testing-library/react-native';

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

  it('uploads a picked image and appends its public URL to the photo list', async () => {
    const imagePicker = jest
      .fn()
      .mockResolvedValue({ blob: { fake: true }, contentType: 'image/png' });
    const createUpload = jest
      .fn()
      .mockResolvedValue({ id: 'x', uploadUrl: '/uploads/x', publicUrl: '/uploads/x' });
    const putUploadBytes = jest.fn().mockResolvedValue(undefined);
    const resolveUrl = jest.fn().mockReturnValue('https://api.test/uploads/x');
    const getPrincipal = jest.fn().mockReturnValue({ id: CUSTOMER_ID, role: 'customer' });
    const client = {
      createUpload,
      putUploadBytes,
      resolveUrl,
      getPrincipal,
    } as unknown as ApiClient;

    const { getByLabelText } = await render(
      <CreateRequestScreen client={client} imagePicker={imagePicker} />,
    );
    await fireEvent.press(getByLabelText('Add photo'));

    await waitFor(() => {
      expect(getByLabelText('Photo URLs').props.value).toContain('https://api.test/uploads/x');
    });
    expect(createUpload).toHaveBeenCalledWith('image/png');
    expect(putUploadBytes).toHaveBeenCalledWith('/uploads/x', 'image/png', { fake: true });
  });

  it('hides the Add photo button when no image picker is provided', async () => {
    const getPrincipal = jest.fn();
    const client = { getPrincipal } as unknown as ApiClient;

    const { getByLabelText, queryByLabelText } = await render(
      <CreateRequestScreen client={client} />,
    );
    getByLabelText('Photo URLs');
    expect(queryByLabelText('Add photo')).toBeNull();
  });

  it('fills the coordinates from a map pick', async () => {
    const mapPicker = jest.fn().mockResolvedValue({ latitude: 25.047, longitude: 121.517 });
    const getPrincipal = jest.fn();
    const client = { getPrincipal } as unknown as ApiClient;

    const { getByLabelText } = await render(
      <CreateRequestScreen client={client} mapPicker={mapPicker} />,
    );
    await fireEvent.press(getByLabelText('Pick on map'));

    await waitFor(() => {
      expect(getByLabelText('Latitude').props.value).toBe('25.047000');
    });
    expect(getByLabelText('Longitude').props.value).toBe('121.517000');
  });

  it('hides the Pick on map button when no map picker is provided', async () => {
    const getPrincipal = jest.fn();
    const client = { getPrincipal } as unknown as ApiClient;

    const { getByLabelText, queryByLabelText } = await render(
      <CreateRequestScreen client={client} />,
    );
    getByLabelText('Latitude');
    expect(queryByLabelText('Pick on map')).toBeNull();
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

  it('fills the coordinates from the current location', async () => {
    const getPrincipal = jest.fn().mockReturnValue({ id: CUSTOMER_ID, role: 'customer' });
    const client = { createServiceRequest: jest.fn(), getPrincipal } as unknown as ApiClient;
    const locationProvider = {
      getCurrentPosition: jest
        .fn()
        .mockResolvedValue({ latitude: 25.033964, longitude: 121.564468 }),
    };

    const { getByLabelText } = await render(
      <CreateRequestScreen client={client} locationProvider={locationProvider} />,
    );
    await fireEvent.press(getByLabelText('Use my current location'));

    await waitFor(() => {
      expect(getByLabelText('Latitude').props.value).toBe('25.033964');
    });
    expect(getByLabelText('Longitude').props.value).toBe('121.564468');
  });

  it('shows a message when the location lookup fails', async () => {
    const getPrincipal = jest.fn().mockReturnValue({ id: CUSTOMER_ID, role: 'customer' });
    const client = { createServiceRequest: jest.fn(), getPrincipal } as unknown as ApiClient;
    const locationProvider = {
      getCurrentPosition: jest.fn().mockRejectedValue(new Error('Location permission denied')),
    };

    const { getByLabelText, findByText } = await render(
      <CreateRequestScreen client={client} locationProvider={locationProvider} />,
    );
    await fireEvent.press(getByLabelText('Use my current location'));

    await findByText('Location permission denied');
  });

  it('includes a preferred time (scheduledAt) when provided', async () => {
    const created = makeRequest();
    const createServiceRequest = jest.fn().mockResolvedValue(created);
    const getPrincipal = jest.fn().mockReturnValue({ id: CUSTOMER_ID, role: 'customer' });
    const client = { createServiceRequest, getPrincipal } as unknown as ApiClient;

    const { getByLabelText, findByText } = await render(<CreateRequestScreen client={client} />);
    await fireEvent.press(getByLabelText('Category plumbing'));
    await fireEvent.changeText(getByLabelText('Description'), 'Leaking kitchen sink');
    await fireEvent.changeText(getByLabelText('Latitude'), '25.03');
    await fireEvent.changeText(getByLabelText('Longitude'), '121.56');
    await fireEvent.changeText(getByLabelText('Preferred time'), '2026-07-01T09:00:00.000Z');
    await fireEvent.press(getByLabelText('Create request'));

    await findByText('Request created');
    expect(createServiceRequest).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      category: 'plumbing',
      description: 'Leaking kitchen sink',
      location: { latitude: 25.03, longitude: 121.56 },
      scheduledAt: '2026-07-01T09:00:00.000Z',
    });
  });

  it('flags an unparseable preferred time and does not call the API', async () => {
    const createServiceRequest = jest.fn();
    const getPrincipal = jest.fn().mockReturnValue({ id: CUSTOMER_ID, role: 'customer' });
    const client = { createServiceRequest, getPrincipal } as unknown as ApiClient;

    const { getByLabelText, findByText } = await render(<CreateRequestScreen client={client} />);
    await fireEvent.press(getByLabelText('Category plumbing'));
    await fireEvent.changeText(getByLabelText('Description'), 'Leaking kitchen sink');
    await fireEvent.changeText(getByLabelText('Latitude'), '25.03');
    await fireEvent.changeText(getByLabelText('Longitude'), '121.56');
    await fireEvent.changeText(getByLabelText('Preferred time'), 'next tuesday');
    await fireEvent.press(getByLabelText('Create request'));

    await findByText('Enter a valid date/time (e.g. 2026-07-01T09:00)');
    expect(createServiceRequest).not.toHaveBeenCalled();
  });

  it('hides the location button when no provider is given', async () => {
    const client = {
      createServiceRequest: jest.fn(),
      getPrincipal: jest.fn(),
    } as unknown as ApiClient;

    const { queryByLabelText } = await render(<CreateRequestScreen client={client} />);
    expect(queryByLabelText('Use my current location')).toBeNull();
  });

  it('searches an address and fills coordinates from the chosen result', async () => {
    const getPrincipal = jest.fn().mockReturnValue({ id: CUSTOMER_ID, role: 'customer' });
    const client = { createServiceRequest: jest.fn(), getPrincipal } as unknown as ApiClient;
    const geocoder = {
      geocode: jest
        .fn()
        .mockResolvedValue([{ latitude: 25.033964, longitude: 121.564468, label: 'Taipei 101' }]),
    };

    const { getByLabelText, findByLabelText } = await render(
      <CreateRequestScreen client={client} geocoder={geocoder} />,
    );
    await fireEvent.changeText(getByLabelText('Address search'), 'Taipei 101');
    await fireEvent.press(getByLabelText('Search address'));

    await fireEvent.press(await findByLabelText('Use Taipei 101'));
    expect(getByLabelText('Latitude').props.value).toBe('25.033964');
    expect(getByLabelText('Longitude').props.value).toBe('121.564468');
    expect(geocoder.geocode).toHaveBeenCalledWith('Taipei 101');
  });

  it('shows a message when the address search has no matches', async () => {
    const client = {
      createServiceRequest: jest.fn(),
      getPrincipal: jest.fn(),
    } as unknown as ApiClient;
    const geocoder = { geocode: jest.fn().mockResolvedValue([]) };

    const { getByLabelText, findByText } = await render(
      <CreateRequestScreen client={client} geocoder={geocoder} />,
    );
    await fireEvent.changeText(getByLabelText('Address search'), 'nowhere place');
    await fireEvent.press(getByLabelText('Search address'));

    await findByText('No matching places found. Try a different address.');
  });

  it('hides the address search when no geocoder is given', async () => {
    const client = {
      createServiceRequest: jest.fn(),
      getPrincipal: jest.fn(),
    } as unknown as ApiClient;

    const { queryByLabelText } = await render(<CreateRequestScreen client={client} />);
    expect(queryByLabelText('Address search')).toBeNull();
  });

  it('includes photo URLs (one per line) when provided', async () => {
    const created = makeRequest();
    const createServiceRequest = jest.fn().mockResolvedValue(created);
    const getPrincipal = jest.fn().mockReturnValue({ id: CUSTOMER_ID, role: 'customer' });
    const client = { createServiceRequest, getPrincipal } as unknown as ApiClient;

    const { getByLabelText, findByText } = await render(<CreateRequestScreen client={client} />);
    await fireEvent.press(getByLabelText('Category plumbing'));
    await fireEvent.changeText(getByLabelText('Description'), 'Leaking kitchen sink');
    await fireEvent.changeText(getByLabelText('Latitude'), '25.03');
    await fireEvent.changeText(getByLabelText('Longitude'), '121.56');
    await fireEvent.changeText(
      getByLabelText('Photo URLs'),
      'https://example.com/a.jpg\nhttps://example.com/b.jpg',
    );
    await fireEvent.press(getByLabelText('Create request'));

    await findByText('Request created');
    expect(createServiceRequest).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      category: 'plumbing',
      description: 'Leaking kitchen sink',
      location: { latitude: 25.03, longitude: 121.56 },
      photoUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    });
  });
});
