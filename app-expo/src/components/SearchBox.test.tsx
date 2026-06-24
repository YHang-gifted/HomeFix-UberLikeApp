import { fireEvent, render } from '@testing-library/react-native';

import { SearchBox } from './SearchBox';

describe('SearchBox', () => {
  it('renders the current value', async () => {
    const { getByLabelText } = await render(<SearchBox value="sink" onChange={jest.fn()} />);
    expect(getByLabelText('Search description').props.value).toBe('sink');
  });

  it('calls onChange as the user types', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(<SearchBox value="" onChange={onChange} />);

    await fireEvent.changeText(getByLabelText('Search description'), 'fan');

    expect(onChange).toHaveBeenCalledWith('fan');
  });
});
