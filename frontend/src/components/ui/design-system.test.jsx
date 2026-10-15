import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/render.jsx';
import { Button, IconButton } from './Button.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { Drawer } from './Drawer.jsx';
import { SwitchField, TextField } from './Field.jsx';
import { FilterTabs } from './FilterTabs.jsx';
import { SegmentedControl } from './SegmentedControl.jsx';
import { ToastProvider } from './ToastProvider.jsx';
import { useToast } from './toast-context.js';

describe('IconButton and Tooltip', () => {
  it('is named by its label and shows it as a tooltip on keyboard focus', async () => {
    const user = userEvent.setup();
    render(<IconButton label="Edit product" icon={Pencil} onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Edit product' });
    await user.tab();
    expect(button).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Edit product');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('Button', () => {
  it('shows a busy state and cannot be clicked while loading', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

function DrawerHarness() {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open drawer
      </button>
      <Drawer
        open={open}
        title="Edit product"
        onClose={() => setOpen(false)}
        footer={<Button onClick={() => setConfirming(true)}>Delete</Button>}
      >
        <TextField label="Name" defaultValue="Lamp" />
      </Drawer>
      <ConfirmDialog
        open={confirming}
        title="Delete product?"
        message="This cannot be undone."
        danger
        onConfirm={() => {}}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}

describe('Drawer', () => {
  it('moves focus inside, keeps it there, and returns it on close', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);
    const opener = screen.getByRole('button', { name: 'Open drawer' });
    await user.click(opener);
    const drawer = screen.getByRole('dialog', { name: 'Edit product' });
    expect(within(drawer).getByLabelText('Name')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes only the topmost dialog with Escape', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);
    await user.click(screen.getByRole('button', { name: 'Open drawer' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('dialog', { name: 'Delete product?' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Delete product?' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit product' })).toBeInTheDocument();
  });
});

describe('SwitchField', () => {
  it('is a labelled switch that reports changes like a checkbox', async () => {
    const user = userEvent.setup();
    const changes = [];
    function Harness() {
      const [on, setOn] = useState(true);
      return (
        <SwitchField
          label="Active"
          hint="Inactive products cannot be ordered"
          checked={on}
          onChange={(e) => {
            changes.push(e.target.checked);
            setOn(e.target.checked);
          }}
        />
      );
    }
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Active' });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription('Inactive products cannot be ordered');
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(changes).toEqual([false]);
  });
});

describe('FilterTabs and SegmentedControl', () => {
  it.each([
    ['FilterTabs', FilterTabs],
    ['SegmentedControl', SegmentedControl],
  ])('%s moves the selection with arrow keys from one Tab stop', async (_name, Component) => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState('a');
      return (
        <Component
          label="Choice"
          value={value}
          onChange={setValue}
          options={[
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
            { value: 'c', label: 'Gamma' },
          ]}
        />
      );
    }
    render(<Harness />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Beta' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Gamma' })).toBeChecked();
  });
});

describe('toasts', () => {
  it('show a description and run their action', async () => {
    const user = userEvent.setup();
    const undo = vi.fn();
    function Trigger() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            toast.success('Product archived.', {
              description: 'It no longer appears in new orders.',
              action: { label: 'Undo', onClick: undo },
            })
          }
        >
          Archive
        </button>
      );
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Product archived.');
    expect(toast).toHaveTextContent('It no longer appears in new orders.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('dismiss themselves, but not while hovered', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      function Trigger() {
        const toast = useToast();
        return (
          <button type="button" onClick={() => toast.info('Saved.')}>
            Save
          </button>
        );
      }
      render(
        <ToastProvider>
          <Trigger />
        </ToastProvider>,
      );
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await user.hover(screen.getByRole('status'));
      act(() => vi.advanceTimersByTime(8000));
      expect(screen.getByRole('status')).toBeInTheDocument();
      await user.unhover(screen.getByRole('status'));
      act(() => vi.advanceTimersByTime(6000));
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('filter bar', () => {
  it('clears every list filter at once', async () => {
    const { user, router } = renderApp('/orders?search=alice&dateFrom=2026-03-01&customerId=5');
    await screen.findByRole('table', { name: 'Orders' });
    await user.click(screen.getByRole('button', { name: /Clear filters/ }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.queryByRole('button', { name: /Clear filters/ })).not.toBeInTheDocument();
  });

  it('filters orders by status with tabs', async () => {
    const { user, router } = renderApp('/orders');
    await screen.findByRole('table', { name: 'Orders' });
    await user.click(screen.getByRole('radio', { name: 'Shipped' }));
    await waitFor(() => expect(router.state.location.search).toBe('?status=shipped'));
    expect(screen.getByRole('radio', { name: 'Shipped' })).toBeChecked();
  });
});
