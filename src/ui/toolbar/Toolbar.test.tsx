import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useStore } from '../../state/store';
import { Toolbar } from './Toolbar';

describe('Toolbar', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('shows editing clusters in orbit mode', () => {
    useStore.getState().setCameraMode('orbit');
    render(<Toolbar />);
    expect(screen.getByRole('button', { name: /arrange/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /catalog/i })).toBeTruthy();
  });

  it('hides editing clusters in walk mode', () => {
    useStore.getState().setCameraMode('firstPerson');
    render(<Toolbar />);
    expect(screen.queryByRole('button', { name: /arrange/i })).toBeNull();
  });
});
