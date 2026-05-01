# Directional Door Bleed

Brainstormed 2026-05-02. Lifts item #3 from the [time-of-day spec — Out of scope](2026-05-01-time-of-day-design.md#out-of-scope).

## Goal

Replace the uniform `BLEED_ATTENUATION = 0.4` applied at every open-door traversal with a per-edge attenuation weighted by door orientation relative to the sun. Doors aligned with the sun's horizontal travel direction keep full bleed; doors facing into the sun lose most of it.

The change is contained to `roomGraph.ts` and a single caller. No new UI, no new quality toggle — the behavior is baked into the existing `quality.interRoomBleed` setting (when that's off, `relaxDaylight` isn't called and directionality is moot).

## Design

### `RoomEdge` — record door normal

Each edge gains a unit normal in the xz plane, pointing **from the source room into the neighbor**:

```ts
export interface RoomEdge {
  neighbour: RoomId;
  doorId: string;
  open: boolean;
  normal: [number, number]; // unit, xz, points source -> neighbour
}
```

`roomsAdjacentToDoor` already computes the wall's perpendicular vector `(nx, nz) = (-dz, dx)` for the probing step. It is reused: the probe at `+(nx, nz)` lands in `sideA`, so the A→B edge carries `+(nx, nz)` and the B→A edge carries `-(nx, nz)`. Return `[a, b, [nx, nz]]` from the helper and let `buildRoomGraph` push the reciprocal.

### `relaxDaylight` — optional sunDir argument

```ts
export function relaxDaylight(
  base: Record<RoomId, number>,
  graph: RoomGraph,
  sunDir?: [number, number, number],
): Record<RoomId, number>;
```

Behavior:

- If `sunDir` is omitted or `sunDir[1] <= 0` (sun at/below horizon), per-edge attenuation is the existing constant `BLEED_ATTENUATION`. This keeps the function backwards-compatible and avoids meaningless directional weighting when there is no daylight to direct.
- Otherwise, compute the horizontal light-travel direction once per call:

  ```
  sx = -sunDir[0]
  sz = -sunDir[2]
  L  = hypot(sx, sz)
  s  = (sx/L, sz/L)            // undefined if L == 0; fall back to uniform
  ```

  For each edge with normal `n_AB`, the per-edge weight is

  ```
  w   = W_MIN + (1 - W_MIN) * 0.5 * (1 + dot(n_AB, s))
  att = BLEED_ATTENUATION * w
  ```

  With `W_MIN = 0.4`, `att` ranges over `[0.16, 0.40]`, matching the current value at the aligned end and dropping ~60% at the reversed end.

### Caller

`src/scene/lighting/roomDaylightIntensities.ts` already has `sunDir` (it drives `roomDaylightFactor`). Pass it as the third argument to `relaxDaylight`.

## Tests (`src/apartment/roomGraph.test.ts`)

1. **Reciprocal normals.** For any built edge `A → B` with normal `n`, the reverse edge `B → A` exists with normal `-n` (componentwise, within 1e-6).
2. **Backwards compatibility — no sunDir.** Existing assertions on `relaxDaylight(base, graph)` continue to pass unchanged.
3. **Backwards compatibility — sun below horizon.** `relaxDaylight(base, graph, [1, -0.1, 0])` produces the same output as the no-sunDir form.
4. **Aligned vs reversed.** Pick a single open-door pair from the real `WALLS`/`DOORS` constants. Set the source room's base to `1` and neighbor's base to `0`. Choose `sunDir` so that `s` aligns with the source→neighbor edge normal: relaxed neighbor value should equal `BLEED_ATTENUATION` to within 1e-6. Flip `sunDir`'s sign on x/z so `s` opposes the normal: relaxed neighbor should equal `BLEED_ATTENUATION * W_MIN`.

## Files touched

- `src/apartment/roomGraph.ts`
- `src/apartment/roomGraph.test.ts`
- `src/scene/lighting/roomDaylightIntensities.ts`
- `TODO.md`

## Out of scope

- Window-aware (rather than sun-aware) directional weighting. The sun-aware approximation is equivalent in ranking for the kinds of layouts this apartment uses, at a fraction of the implementation complexity.
- A separate `quality.directionalBleed` toggle. The effect is subtle and bundled with `interRoomBleed`.
