# Asset credits

All bundled assets are CC0.

## Materials (built-in)

The built-in floor and wall finishes are **generated procedurally on-device
at runtime** (see `src/materials/procedural/`) — albedo, normal, and
roughness maps are synthesised from seeded value noise, so no third-party
texture files are bundled or fetched. Patterns: wood planks, ceramic tile,
marble, carpet, concrete, and painted plaster.

Additional PBR materials can be fetched at runtime from Poly Haven and
ambientCG (both CC0) via the in-app finishes browser; attribution for any
fetched material is shown on its catalog card.
