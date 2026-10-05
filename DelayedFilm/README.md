# Delayed Film

An iPhone camera app that behaves like a beautiful retro disposable analog
camera. You shoot photos through film-inspired recipes — but you **cannot see
them** until a chosen development moment: end of week, month, quarter, year, or a
custom date. After the shutter, each frame disappears into a locked film roll.
No preview. No thumbnail. No peeking.

> **The one rule that governs everything:** the user must never see a captured
> photo before its roll unlocks. See `docs/product-decisions.md` for how this is
> enforced in the architecture.

## Status

**Phase 1 — Foundation** complete: project structure, domain models, service
protocols + stubs, seed recipe catalog, persistence + the locked-storage gate,
unit tests, and documentation. The live camera, full recipe engine (30 recipes),
reveal flow, and premium retro UI are built in later phases.

## Stack

SwiftUI · SwiftData · AVFoundation · Core Image (Metal-backed) · PhotoKit
(export only) · UserNotifications · iOS 17+. No cloud, no analytics.

## Building

This repo stores Swift sources only; the Xcode project is generated from
`project.yml`:

```sh
brew install xcodegen
xcodegen generate          # creates DelayedFilm.xcodeproj
open DelayedFilm.xcodeproj  # ⌘B to build, ⌘U to test
```

## Layout

```
DelayedFilm/
  App/         entry point + router
  Models/      FilmRecipe, FilmRoll, CapturedFrame, DevelopmentSchedule, CameraLensOption
  Services/    camera, permission, roll store, image processing, scheduler, export, haptics
  RecipeEngine/ catalog, renderer, color matrices, tone curve, grain
  Views/       Camera / Recipes / Rolls / Settings
  Tests/       roll logic, scheduler, recipe serialization, no-preview rule
docs/          product decisions, acceptance checklist, agent reviews
```
