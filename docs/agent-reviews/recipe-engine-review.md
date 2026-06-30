# Film Science / Image Processing Engineer — Phase 1 Review

**Agent 3.** Phase 1 fixes the recipe data model and rendering contracts.

## Delivered

- `FilmRecipe`: pure `Codable` value type covering tone curve, exposure,
  contrast, temperature/tint, saturation, per-channel RGB balance, named color
  matrix, highlight rolloff, shadow lift, matte fade, vignette, and grain.
- `formulaVersion` for deterministic, reproducible reveals; frames record the
  version they were developed with.
- `ToneCurve`: control-point curve with pure, deterministic, monotonic sampling
  (unit-tested) — the reference the GPU curve mirrors on device.
- `ColorMatrixPreset` + `SIMDLike`: named 3×3 stocks with auditable coefficients
  and zero Core Image dependency at the data layer.
- `FilmRenderer` / `GrainRenderer` protocols + passthrough/no-op stubs so the
  pipeline runs end-to-end before the math lands.
- `FilmRecipeCatalog`: 4 representative seed recipes (one monochrome) with unique
  slugs.

## Design rationale

- **Data, not filters.** Keeping recipes free of `CIFilter` makes them
  serializable (built-in + user custom), diffable, and testable headlessly.
- **Determinism.** Same recipe + version + seed ⇒ identical output, including
  grain (seeded). This is what lets a revealed photo match its capture moment.
- **Monochrome path** is a flag on the recipe; renderer takes luma conversion
  first.

## Phase 3/4 plan

- Implement the Core Image chain on a Metal-backed `CIContext`:
  luma (if mono) → tone curve (`CIToneCurve`/`CIColorCurves`) → color matrix →
  temperature/tint (`CITemperatureAndTint`) → highlight/shadow → exposure/
  contrast → fade (black-point lift) → vignette (`CIVignetteEffect`) → seeded
  grain.
- Expand the catalog from 4 → 30 recipes (only `FilmRecipeCatalog` changes).
- Validate full-res memory behavior; render to disk, never to a preview.

## Concerns

- Grain must be tile-stable and seed-driven to avoid re-render drift.
- Watch peak memory on full-res images; process and release promptly.
