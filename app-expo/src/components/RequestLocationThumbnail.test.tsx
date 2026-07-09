import { render } from '@testing-library/react-native';

import type { Coordinates } from '../../../shared/schemas';
import { RequestLocationThumbnail } from './RequestLocationThumbnail';

const LOCATION: Coordinates = { latitude: 25.033, longitude: 121.5654 };

describe('RequestLocationThumbnail', () => {
  it('renders the static-map image when a preview URL is configured', async () => {
    const uri = 'https://maps.googleapis.com/maps/api/staticmap?center=25.033,121.5654';
    const { getByLabelText } = await render(
      <RequestLocationThumbnail location={LOCATION} mapPreviewUrl={() => uri} />,
    );

    const image = getByLabelText('Location map preview');
    expect(image.props.source).toEqual({ uri });
  });

  it('renders nothing when no preview URL is configured (no key)', async () => {
    const { queryByLabelText } = await render(
      <RequestLocationThumbnail location={LOCATION} mapPreviewUrl={() => null} />,
    );

    expect(queryByLabelText('Location map preview')).toBeNull();
  });

  it('passes the request location to the URL builder', async () => {
    const mapPreviewUrl = jest.fn().mockReturnValue(null);
    await render(<RequestLocationThumbnail location={LOCATION} mapPreviewUrl={mapPreviewUrl} />);

    expect(mapPreviewUrl).toHaveBeenCalledWith(LOCATION);
  });
});
