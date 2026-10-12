import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Modal from '../ui/Modal.jsx';
import QuantityStepper from '../ui/QuantityStepper.jsx';
import { VegMark } from '../common/Badges.jsx';

describe('Button', () => {
  it('is busy and disabled while loading, and renders a link when `to` is set', () => {
    const { rerender } = render(<Button loading>Save</Button>);
    const b = screen.getByRole('button', { name: /save/i });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
    rerender(
      <MemoryRouter>
        <Button to="/menu">Menu</Button>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Menu' })).toHaveAttribute('href', '/menu');
  });
});

describe('Input', () => {
  it('links label, hint and error for assistive tech', () => {
    render(<Input label="Phone" error="Enter a valid number" />);
    const input = screen.getByLabelText('Phone');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid number');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid number');
  });
});

describe('QuantityStepper', () => {
  it('calls onChange and respects min/max', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <QuantityStepper value={1} min={1} max={2} label="Chai" onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Decrease Chai' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Increase Chai' }));
    expect(onChange).toHaveBeenCalledWith(2);
    rerender(<QuantityStepper value={2} min={1} max={2} label="Chai" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Increase Chai' })).toBeDisabled();
  });
});

describe('Modal', () => {
  it('is an accessible dialog: labelled, Esc closes, focus moves in and returns', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    function Host() {
      return (
        <>
          <button>opener</button>
          <Modal open onClose={onClose} title="Options">
            <button>first</button>
            <button>last</button>
          </Modal>
        </>
      );
    }
    render(<Host />);
    const dialog = screen.getByRole('dialog', { name: 'Options' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toContainElement(document.activeElement);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('traps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={() => {}} title="Trap">
        <button>one</button>
        <button>two</button>
      </Modal>,
    );
    const close = screen.getByRole('button', { name: 'Close dialog' });
    const two = screen.getByRole('button', { name: 'two' });
    two.focus();
    await user.tab();
    expect(close).toHaveFocus(); // wrapped from last to first
    await user.tab({ shift: true });
    expect(two).toHaveFocus(); // wrapped from first to last
  });

  it('renders nothing when closed', () => {
    render(<Modal open={false} onClose={() => {}} title="Nope" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('VegMark', () => {
  it('exposes the dietary type as text', () => {
    render(<VegMark isVeg={false} />);
    expect(screen.getByRole('img', { name: 'Non-vegetarian' })).toBeInTheDocument();
  });
});
