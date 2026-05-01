import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LightSection } from './LightSection';
import { useStore } from '../../../state/store';
import type { LightEmitter } from '../../../furniture/types';

const light: LightEmitter = {
  kind: 'point', anchor: [0, 1, 0], defaultIntensity: 10, defaultKelvin: 2700, distance: 4,
};

describe('LightSection', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('toggles on/off via the checkbox', () => {
    const id = useStore.getState().addItem({
      defId: 'lamp-floor', position: [1, 1], rotation: 0, props: {},
    });
    const item = useStore.getState().items.find((i) => i.id === id)!;
    render(<LightSection item={item} light={light} />);
    const cb = screen.getByRole('checkbox');
    expect((cb as HTMLInputElement).checked).toBe(true);
    fireEvent.click(cb);
    expect(useStore.getState().items[0].lightOverride?.on).toBe(false);
  });

  it('intensity slider patches override', () => {
    const id = useStore.getState().addItem({
      defId: 'lamp-floor', position: [1, 1], rotation: 0, props: {},
    });
    const item = useStore.getState().items.find((i) => i.id === id)!;
    render(<LightSection item={item} light={light} />);
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '7' } });
    expect(useStore.getState().items[0].lightOverride?.intensity).toBe(7);
  });
});
