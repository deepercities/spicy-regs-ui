import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterSelect } from './FilterSelect';

// jsdom doesn't implement these and Radix Select probes them.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

const OPTIONS = [
  { value: 'recent', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'popular', label: 'Most discussed' },
];

describe('FilterSelect', () => {
  it('renders the current selected label inside the trigger', () => {
    render(
      <FilterSelect
        value="recent"
        onValueChange={() => {}}
        options={OPTIONS}
        ariaLabel="Sort"
      />,
    );
    expect(screen.getByText('Newest')).toBeInTheDocument();
  });

  it('renders a prefix label inside the trigger', () => {
    render(
      <FilterSelect
        value="recent"
        onValueChange={() => {}}
        options={OPTIONS}
        prefix="Sort:"
        ariaLabel="Sort"
      />,
    );
    expect(screen.getByText('Sort:')).toBeInTheDocument();
  });

  it('calls onValueChange when a different option is selected', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FilterSelect
        value="recent"
        onValueChange={onValueChange}
        options={OPTIONS}
        ariaLabel="Sort"
      />,
    );
    // Open via the accessible role.
    await user.click(screen.getByRole('combobox', { name: 'Sort' }));
    await user.click(await screen.findByText('Oldest'));
    expect(onValueChange).toHaveBeenCalledWith('oldest');
  });

  it('applies filter-chip class to the trigger', () => {
    render(
      <FilterSelect
        value="recent"
        onValueChange={() => {}}
        options={OPTIONS}
        ariaLabel="Sort"
      />,
    );
    expect(screen.getByRole('combobox').className).toContain('filter-chip');
  });
});
