import { fireEvent, render } from '@testing-library/react-native';

import { CategoryFilter } from './CategoryFilter';

describe('CategoryFilter', () => {
  it('calls onChange with the chosen category', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(<CategoryFilter value={null} onChange={onChange} />);
    await fireEvent.press(getByLabelText('Category electrical'));
    expect(onChange).toHaveBeenCalledWith('electrical');
  });

  it('calls onChange with null when All is chosen', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(
      <CategoryFilter value="plumbing" onChange={onChange} />,
    );
    await fireEvent.press(getByLabelText('Category all'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
