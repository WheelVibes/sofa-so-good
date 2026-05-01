import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import { useStore } from '../state/store';

describe('SettingsPanel', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('clicking the fixtures off button switches the store to off', () => {
    render(<SettingsPanel onClose={() => {}} />);
    const offBtn = screen.getByLabelText('Fixtures off');
    fireEvent.click(offBtn);
    expect(useStore.getState().quality.fixtures).toBe('off');
  });

  it('changing the exposure bias slider updates the store', () => {
    render(<SettingsPanel onClose={() => {}} />);
    const slider = screen.getByLabelText('Exposure bias') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '1.25' } });
    expect(useStore.getState().quality.exposureBias).toBeCloseTo(1.25, 5);
  });

  it('selecting overcast weather updates the store', () => {
    render(<SettingsPanel onClose={() => {}} />);
    const btn = screen.getByRole('button', { name: /^overcast$/i });
    fireEvent.click(btn);
    expect(useStore.getState().quality.weather).toBe('overcast');
  });

  it('clicking the low preset bulk-sets shadows to off and keeps IBL on', () => {
    render(<SettingsPanel onClose={() => {}} />);
    const lowButtons = screen.getAllByRole('button', { name: /^low$/i });
    fireEvent.click(lowButtons[0]);
    expect(useStore.getState().quality.shadows).toBe('off');
    // IBL stays on at low — it's a cheap cubemap and the visual hit from
    // turning it off is severe; only shadows + SSAO scale with the preset.
    expect(useStore.getState().quality.globalIllumination).toBe('ibl');
  });

  it('clicking the high preset sets shadows=high and gi=ibl+ssao', () => {
    render(<SettingsPanel onClose={() => {}} />);
    const highButtons = screen.getAllByRole('button', { name: /^high$/i });
    fireEvent.click(highButtons[0]);
    expect(useStore.getState().quality.shadows).toBe('high');
    expect(useStore.getState().quality.globalIllumination).toBe('ibl+ssao');
  });
});
