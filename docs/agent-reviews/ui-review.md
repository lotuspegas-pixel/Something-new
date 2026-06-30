# UI / Visual Design Agent — Phase 1 Review

**Agent 4.** Phase 1 lays out the view file structure and routing only; the
premium retro treatment is Phase 6.

## Delivered

- View file skeleton across `Camera/`, `Recipes/`, `Rolls/`, `Settings/`.
- `RootView` `TabView` scaffold (Camera / Rolls / Settings), dark scheme.
- `AppRouter` (`@Observable`) with tabs + a typed navigation `Route` enum, so
  reveal reminders and deep links have a home.
- `RollListView` already renders **metadata only** (lock icon, recipe, frame
  count, development date) — an early, visible commitment to the no-preview rule.
- Placeholder views for camera body, shutter, frame counter, lens dial, exposure
  control, recipe cards/picker/builder, locked detail, reveal, gallery, contact
  sheet — each annotated with the phase that implements it.

## Design intent recorded for Phase 6

- Feel: a 1990s disposable camera, re-machined with premium materials —
  textured shell, recessed shutter, mechanical frame-counter wheel, film
  sticker, winding animation, flash lamp.
- One-handed reachability: shutter and lens dial in the thumb arc.
- Motion: a tactile "wind" between frames; a ceremonial reveal animation.
- Accessibility: Dynamic Type, VoiceOver labels (shutter/frame counter already
  labeled), reduced-motion fallback for winding/reveal, AA contrast on chrome.
- Avoid the generic Apple-sample look: custom typography, grain textures, warm
  neutral palette.

## Notes / risks

- The reveal animation must not pre-render frame imagery before unlock.
- Keep views thin — push logic into services/view-models (Agent 6 to enforce).

---

## Phase 5 — Delivered (premium retro UI) + review

**Design system (`FilmTheme`)**: warm plastic gradient shell, raised panel
modifier, angular accent ring, LCD palette, cream sticker palette, deterministic
scratch overlay, screws — one source of truth for the look.

**Camera body**: `RetroCameraBodyView` shell; top plate with `FilmStickerView`
(recipe label) + `FlashLampView` (glows when armed) + `LensWindowView`;
`viewfinder` window with plastic bezel and corner brackets; `FrameCounterView`
LCD; tactile `ShutterButton` (accent ring + press depth via `ButtonStyle`);
`WindingLeverView` thumbwheel; styled `LensSelectorView` dial. Locked roll detail
reimagined as a sealed canister with a live countdown.

### Review against criteria

- **Visual hierarchy**: sticker/viewfinder/shutter form a clear top-to-bottom
  read; shutter is the dominant element. ✅
- **Spacing**: consistent 14–22pt rhythm; viewfinder uses a fixed 4:5 ratio. ✅
- **Tap targets**: shutter 64–84pt; flash/grid 40×36; lens chips ≥38×30 (≥ the
  44pt guidance met on the shutter, close on secondary controls — acceptable,
  flagged). 🟡
- **One-handed**: shutter centered low; primary actions in the thumb arc. ✅
- **Accessibility**: labels on shutter, flash, grid, lens, counter, sticker;
  lens chips expose `.isSelected`; decorative parts `accessibilityHidden`. ✅
- **Contrast**: LCD green on near-black and accent on dark shell pass AA for the
  text sizes used. ✅
- **Motion reduction**: winding respects `accessibilityReduceMotion`; reveal uses
  gentle fades. ✅
- **Premium vs amateur**: layered plastic, embossed type, glowing LCD, and the
  sticker move it well away from a generic photo-editor look. ✅
- **Still feels like a camera**: viewfinder + shutter + winder + frame counter —
  yes, reads as a camera, not an editor. ✅

### Follow-ups

- Nudge secondary control hit areas toward 44pt in a polish pass.
- Settings/Recipe forms inherit the dark scheme but aren't yet bespoke; fine for
  MVP, candidates for a later visual pass.
