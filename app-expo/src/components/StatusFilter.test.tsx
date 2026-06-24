import { fireEvent, render } from '@testing-library/react-native';

import { StatusFilter } from './StatusFilter';

describe('StatusFilter', () => {
  it('calls onChange with the chosen status', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(<StatusFilter value={null} onChange={onChange} />);
    await fireEvent.press(getByLabelText('Filter pending'));
    expect(onChange).toHaveBeenCalledWith('pending');
  });

  it('calls onChange with null when All is chosen', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(<StatusFilter value="pending" onChange={onChange} />);
    await fireEvent.press(getByLabelText('Filter all'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
