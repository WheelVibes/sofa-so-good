import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

function s() {
  return useStore.getState();
}

describe('history slice', () => {
  beforeEach(() => {
    s().__resetForTest();
  });

  it('undo restores the previous items array after an addItem', () => {
    const before = s().items;
    s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} });
    expect(s().items.length).toBe(before.length + 1);
    s().undo();
    expect(s().items).toBe(before);
  });

  it('redo replays an undone addItem', () => {
    s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} });
    const afterAdd = s().items;
    s().undo();
    s().redo();
    expect(s().items).toEqual(afterAdd);
  });

  it('a fresh push clears the redo stack', () => {
    s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} });
    s().undo();
    expect(s().future.length).toBe(1);
    s().addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} });
    expect(s().future.length).toBe(0);
  });

  it('coalesces rapid same-key prop edits into a single undo step', () => {
    const id = s().addItem({
      defId: 'bed-double',
      position: [0, 0],
      rotation: 0,
      props: {},
    });
    const baseDepth = s().past.length;
    s().updateItemProps(id, { scale: 1.1 });
    s().updateItemProps(id, { scale: 1.2 });
    s().updateItemProps(id, { scale: 1.3 });
    // Three rapid same-prop edits → exactly one new history entry.
    expect(s().past.length).toBe(baseDepth + 1);
  });

  it('undo is a no-op on an empty past stack', () => {
    s().clearHistory();
    const snap = s().items;
    s().undo();
    expect(s().items).toBe(snap);
  });

  it('toggleDoor is undoable', () => {
    s().toggleDoor('door-bedroom1');
    expect(s().doors['door-bedroom1']?.open).toBe(true);
    s().undo();
    expect(s().doors['door-bedroom1']?.open ?? false).toBe(false);
  });

  it('clearHistory drops both stacks', () => {
    s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} });
    s().undo();
    s().clearHistory();
    expect(s().past).toEqual([]);
    expect(s().future).toEqual([]);
  });
});
