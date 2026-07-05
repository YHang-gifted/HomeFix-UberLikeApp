import { render } from '@testing-library/react-native';

import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders a readable label for a multi-word status', async () => {
    const { getByText } = await render(<StatusBadge status="in_progress" />);

    expect(getByText('in progress')).toBeTruthy();
  });

  it('renders terminal states', async () => {
    const { getByText } = await render(<StatusBadge status="completed" />);

    expect(getByText('completed')).toBeTruthy();
  });
});
