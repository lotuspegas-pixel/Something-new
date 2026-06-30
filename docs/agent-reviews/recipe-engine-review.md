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

---

## Phase 3 — Delivered (engine + 30 recipes)

- **`FilmRecipe` expanded** to the full parameter model: identity (`displayName`/
  `publicName` brand-safe, `inspiration` internal), `category`, `bestUse`, tone/
  exposure, texture (grain/vignette/fade/sharpen/blur), color shaping
  (`toneCurve: [CGPoint]`, `rgbBalance`/`lumaWeights` as `SIMD3<Float>`,
  `colorChrome`, `lightLeak`, `halation`, `bloom`), print (`borderStyle`/
  `dateStampStyle`), roll defaults, and `version`. Pure `Codable`, `Hashable`.
- **`DefaultFilmRenderer`**: deterministic Core Image chains.
  - Color: exposure → temp/tint → highlight-shadow → tone curve → color controls
    → RGB balance → vibrance(colorChrome) → fade → bloom → halation → vignette →
    sharpen → blur → grain, cropped to source extent.
  - B&W: exposure → temp/tint → highlight-shadow → RGB→luma matrix
    (`lumaWeights`) → tone curve → contrast (sat 0) → fade → sharpen → vignette →
    grain.
- **`DefaultGrainRenderer`**: seeded, size-scaled, overlay-blended grain;
  reproducible per recipe (FNV-1a `stableSeed`, not the randomized `hashValue`).
- **`ImageProcessingService`**: shared **Metal** `CIContext`, extended-linear
  working space, **Display P3** output, JPEG to protected disk, off the main
  thread, cropped to the original extent.
- **30 brand-safe recipes** across all six categories (10 color-neg, 7 slide,
  2 cine, 1 experimental, 10 B&W). `inspiration` keeps the internal reference.
- **`LivePreviewApproximation`**: encodes the preview clamp rule (≤35% tone,
  ≤20% saturation, ≤40% temp, no grain/border/stamp) so any styled preview is
  correct by construction. Live preview otherwise stays clean.
- **Tests**: catalog count == 30, unique ids, user-facing names match spec,
  round-trip serialization, mono-flag derivation, tone-curve math, seed
  determinism.

## Carried forward

- `lightLeak`, split-toning, borders, and date-stamp compositors are modeled but
  rendered as TODO (Phase 6 print options). Halation is approximated via bloom.
- Determinism verified by construction + seed test; pixel-level golden tests need
  a device/sim GPU and are listed in the final QA manual plan.

---

## Calibration pass (PROMPT 3 parameter table applied)

- All 30 recipes recalibrated to the exact engineering values from the parameter
  table (EV, C, S, T, Ti, H, Sh, grain @ size, vignette @ radius, fade, sharpen,
  blur, 5-point curve, RGB multipliers, CC, leak, halation, bloom, border, date
  stamp, frames, default unlock; B&W luma weights). These are calibrated starting
  points based on analog film characteristics, **not** manufacturer LUTs.
- **New: `MatrixBasePreset`** — the 11 named color-mixing matrices
  (consumerWarmCN … xproSlide) with full r/g/b rows + bias, added as
  `FilmRecipe.colorBase` and applied via `CIColorMatrix` in the color path
  (after RGB balance). B&W recipes use `.identity` and the luma path.
- Builder exposes the color base as "Color profile"; grain-size range widened to
  accommodate high-ISO stocks (up to ~2.1).
- **Developer catalog** (`RecipeCatalogDebugView`, `#if DEBUG`, linked from
  Settings) lists every recipe's metadata with a **procedural demo preview**
  only — never a user photo.
- Tests: exact-value spot checks (gold-daylight, cross-process-slide), B&W
  luma/neutral-base invariant, color-recipes-have-a-base invariant.
