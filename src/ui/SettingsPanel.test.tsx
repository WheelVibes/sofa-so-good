import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import { useStore } from '../state/store';

describe('SettingsPanel', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('toggling fixtures updates the store', () => {
    render(<SettingsPanel onClose={() => {}} />);
    const cb = screen.getByLabelText('Fixtures') as HTMLInputElement;
    const before = cb.checked;
    fireEvent.click(cb);
    expect(useStore.getState().quality.fixtures).toBe(!before);
  });

  it('clicking the low preset bulk-sets shadows to off', () => {
    render(<SettingsPanel onClose={() => {}} />);
    const lowButtons = screen.getAllByRole('button', { name: /^low$/i });
    fireEvent.click(lowButtons[0]);
    expect(useStore.getState().quality.shadows).toBe('off');
    expect(useStore.getState().quality.globalIllumination).toBe('off');
  });

  it('clicking the high preset sets shadows=high and gi=ibl+ssao', () => {
    render(<SettingsPanel onClose={() => {}} />);
    const highButtons = screen.getAllByRole('button', { name: /^high$/i });
    fireEvent.click(highButtons[0]);
    expect(useStore.getState().quality.shadows).toBe('high');
    expect(useStore.getState().quality.globalIllumination).toBe('ibl+ssao');
  });
});
