import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InspectorPanel } from './InspectorPanel';
import { useStore } from '../../state/store';

describe('InspectorPanel', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('renders nothing when no items are selected', () => {
    const { container } = render(<InspectorPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders single-item view when exactly one item is selected', () => {
    useStore.getState().addItem({
      defId: 'bed-double',
      position: [1, 1],
      rotation: 0,
      props: {},
    });
    render(<InspectorPanel />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByText(/items selected/)).not.toBeInTheDocument();
  });

  it('renders the multi-select panel when 2+ items are selected', () => {
    const a = useStore.getState().addItem({
      defId: 'bed-double',
      position: [1, 1],
      rotation: 0,
      props: {},
    });
    const b = useStore.getState().addItem({
      defId: 'sofa-3seat',
      position: [2, 2],
      rotation: 0,
      props: {},
    });
    useStore.getState().setSelectedItemIds([a, b]);
    render(<InspectorPanel />);
    expect(screen.getByText('2 items selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete all' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
  });

  it('Delete all removes every selected item and leaves selection empty', () => {
    const a = useStore.getState().addItem({
      defId: 'bed-double',
      position: [1, 1],
      rotation: 0,
      props: {},
    });
    const b = useStore.getState().addItem({
      defId: 'sofa-3seat',
      position: [2, 2],
      rotation: 0,
      props: {},
    });
    useStore.getState().setSelectedItemIds([a, b]);
    render(<InspectorPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    expect(useStore.getState().items).toHaveLength(0);
    expect(useStore.getState().selectedItemIds).toEqual([]);
  });

  it('Clear selection drops the selection but keeps items', () => {
    const a = useStore.getState().addItem({
      defId: 'bed-double',
      position: [1, 1],
      rotation: 0,
      props: {},
    });
    const b = useStore.getState().addItem({
      defId: 'sofa-3seat',
      position: [2, 2],
      rotation: 0,
      props: {},
    });
    useStore.getState().setSelectedItemIds([a, b]);
    render(<InspectorPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(useStore.getState().items).toHaveLength(2);
    expect(useStore.getState().selectedItemIds).toEqual([]);
    expect(useStore.getState().selectedItemId).toBeNull();
  });
});
