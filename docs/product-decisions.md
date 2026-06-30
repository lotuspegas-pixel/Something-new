# Delayed Film — Product Decisions

> Maintained by **Agent 1 — Product Orchestrator**.
> This log records binding decisions. If a later phase wants to deviate, it must
> update this file first.

## North Star

Delayed Film is a disposable analog camera reimagined. You shoot now and **wait**
to see your photos. The waiting is the product. Every decision serves the
feeling of trust, anticipation, and analog tactility.

## The Critical Product Rule (non-negotiable)

**The user must never see a captured photo before its roll unlocks.**

Concretely, the app must have **no code path** that does any of the following
before unlock:

- post-capture preview or "last shot" view
- generated visible thumbnail of a locked frame
- hidden/debug gallery in a production build
- export to Photos
- any image display in the roll list or roll detail

Locked rolls may show **only**: title, recipe name, frame count, development
countdown/date, and analog placeholder graphics.

### How the rule is enforced architecturally

1. **`CapturedFrame` stores no pixels and no thumbnail** — only a file name
   pointing into a protected directory. (`Models/CapturedFrame.swift`)
2. **`FilmRollStore.revealedImageData(for:now:)` is the single read path** for
   image bytes, and it throws `RollLockedError` unless the roll is unlocked.
   (`Services/FilmRollStore.swift`)
3. **The camera layer never returns a displayable image.** `CapturedPhoto`
   carries a `CIImage` that flows capture → render → disk, never back to a view.
4. **Files are written with `.completeFileProtection`.**
5. **`NoPreviewRuleTests`** asserts locked rolls refuse bytes and unlocked rolls
   return them.

## Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD-1 | SwiftUI + `@Observable` for state, MVVM-lite. | iOS 17 baseline; keeps views thin. |
| AD-2 | SwiftData for roll/frame metadata. | Native persistence, relationships, migrations. |
| AD-3 | Persist a **resolved `unlockDate`**, not just a schedule enum. | Deterministic lock; immune to clock changes and enum-with-associated-value persistence pitfalls. |
| AD-4 | Recipes are **pure `Codable` data**, no `CIFilter`s. | Serializable (built-in + custom), deterministic, testable without a GPU. |
| AD-5 | Recipes are **versioned** (`formulaVersion`); frames record the version used. | A revealed photo always looks the way it did at capture. |
| AD-6 | Image processing runs on a **Metal-backed `CIContext`** off the main thread. | Full-res performance without UI jank. |
| AD-7 | Locked images live in an **app-private, file-protected** per-roll directory. | Security at rest; not in Photos. |
| AD-8 | Services are defined as **protocols** with real + mock implementations. | Simulator-safe, testable, swappable. |
| AD-9 | No `.xcodeproj` in git; generated from `project.yml` via **XcodeGen**. | Clean diffs, auditable structure. |
| AD-10 | MVP scope excludes cloud sync, analytics, and pre-reveal Photos saving. | Focus + privacy. |

## Phase Plan & Status

1. **Project architecture and models** — ✅ complete
2. **Camera capture MVP** — ✅ complete
3. **Recipe engine with 30 recipes** — ✅ complete
4. **Locked rolls, development logic, reveal** — ✅ complete
5. **Premium retro disposable camera UI** — ✅ complete
6. **Custom recipe builder** — ✅ complete
7. Export/share flow + settings + final QA — ⏳ in progress

### Custom recipe provenance (AD-11)
Captured frames are rendered to disk at capture time and store the recipe id +
`version`. Reveal reads the developed JPEG and never re-renders, so editing a
recipe later cannot alter an already-captured photo. Custom recipes persist as a
JSON `payload` in `CustomRecipeRecord` (avoids SwiftData migrations as the
parameter model evolves); `RecipeResolver` checks built-ins first, then custom.

## Open Questions (for later phases)

- Default roll capacity: currently 27 (mimics a 27-exposure disposable). Revisit.
- Should a roll auto-develop on its unlock date, or wait for the user's
  ceremonial "develop" tap? Current model supports both (`developedAt`).
- Reveal reminders via `UserNotifications`: opt-in, scheduled at `unlockDate`.
