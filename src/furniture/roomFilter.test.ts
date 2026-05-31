import { describe, expect, it } from 'vitest';
import { isItemInRoom } from './roomFilter';
import { roomShell } from '../apartment/roomShell';

describe('isItemInRoom', () => {
  const b2 = roomShell('bedroom2');
  it('keeps an item whose center is inside the room', () => {
    expect(isItemInRoom({ position: [4.5, 1.5] }, b2)).toBe(true);
  });
  it('drops an item whose center is outside the room', () => {
    expect(isItemInRoom({ position: [11, 7] }, b2)).toBe(false);
  });
});
