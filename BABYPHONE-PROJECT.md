# BabyPhone.online — Project Documentation

Complete overview of the BabyPhone.online web app: what it is, how it's built,
and everything added during this development effort.

- **Live domain:** https://babyphone.online/
- **Repository:** `lotuspegas-pixel/Something-new`
- **Working branch:** `claude/baby-monitor-web-app-5szu4t` (PR #3)
- **Stack:** Vanilla HTML/CSS/JS, WebRTC (PeerJS), no backend required to run
- **License:** MIT

---

## 1. What it is

BabyPhone.online is a **serverless, browser-based baby monitor**. Two of the
user's own devices become a baby unit (camera + mic, stays in the nursery)
and a parent unit (watches/listens elsewhere). Video and audio stream
**peer-to-peer via WebRTC** — nothing is uploaded to a server, nothing is
recorded, no account or app install is required.

Core flow:
1. Device A opens the site, taps **"Start baby unit"** → gets a 6-character
   room code + QR code, grants camera/mic access.
2. Device B opens the site, taps **"Connect as parent"** → types the code or
   scans the QR.
3. The two devices connect directly (WebRTC/PeerJS, STUN, TURN fallback) and
   the parent sees/hears the baby live.

## 2. Source of truth

- Design reference screenshots: `/design-reference`
- Product/brand name is **always** "BabyPhone.online" — never "Luna Unit" in
  user-facing copy (internal codename only).
- Design rules are codified in `CLAUDE.md` at the repo root (dark premium
  nursery aesthetic — see section 11 below).

## 3. Repository layout

```
serverless/              ← THE working app (single-page, no server needed)
  index.html             ← all screens: landing, pairing, both dashboards
  luna.css                ← landing + pairing + shared design tokens
  dash.css                ← dashboard-specific styles
  js/
    app.js                ← pairing, WebRTC/PeerJS, dashboard logic (main)
    i18n.js               ← 30-language translation tables + engine
    lullaby.js             ← playlist / lullaby playback logic
    codec.js               ← SDP/codec helpers
    qr.js                  ← QR generation/scanning glue
    plus.js                ← Plus/monetization entitlement UI hooks
  vendor/                  ← third-party libs (peerjs, qrcode, jsQR) + LICENSES.md
  assets/                  ← brand assets (logo.png, camera.png, hero-devices.png)
  fonts/                   ← self-hosted Quicksand + Nunito (base64-inlined at build)
  music/                   ← lullaby MP3s + playlist.json
  privacy.html, terms.html, refunds.html, contact.html,
  accessibility.html, how-it-works.html   ← legal & support pages
  robots.txt, sitemap.xml, llms.txt, manifest.webmanifest,
  favicon-32.png, icon-192.png, icon-512.png, apple-touch-icon.png, og-image.png

public/                  ← OLDER app version, now served at /legacy/ (kept for continuity)
functions/                ← entitlement-worker.mjs — Stripe/Plus token issuing (Cloudflare-style worker)
test/                    ← Playwright e2e suites
  e2e.js                   ← legacy /legacy/ app flow
  e2e-serverless.js         ← main serverless app flow (24 assertions)
  e2e-reconnect.js           ← forced-drop / reconnect-with-backoff flow
.github/workflows/ci.yml  ← runs the e2e suites on push/PR
build.js                  ← bundles serverless/ into a single self-contained dist/index.html
server.js                 ← Express server: serves serverless/ at root, public/ at /legacy/
CLAUDE.md                  ← design rules & workflow contract for this repo
```

## 4. Build & run

```bash
npm install
npm start                  # Express server on :3000 — serverless/ at /, legacy app at /legacy/
npm run build              # produces dist/ — one self-contained index.html + assets/, music/, legal pages
npm run lint                # node -c syntax check on all JS
npm run test:serverless     # Playwright e2e — main app (24 checks)
npm run test:reconnect      # Playwright e2e — forced disconnect/reconnect
npm test                    # Playwright e2e — legacy app
```

`build.js` inlines `luna.css`/`dash.css` as `<style>`, all `js/*.js` as
`<script>`, and fonts as base64 directly into `index.html`. Images
(`assets/`, `music/`, icons) are copied alongside as real files — the result
is a single HTML file plus a handful of asset folders that can be uploaded
to any static host (e.g. Hostinger) with zero server-side code required.

## 5. Feature roadmap executed (P0 → P3)

Built in response to a full audit-and-monetization roadmap. All items below
are complete and merged into the working branch.

### P0 — Launch blockers
- **Legal pages**: Privacy Policy, Terms, Refund/Cancellation Policy, Contact
  & Operator Information (imprint) — required before any paid tier.
- **TURN relay + reconnect-with-backoff**: added a TURN fallback (Open
  Relay) alongside STUN so calls survive symmetric NATs/mobile networks;
  added automatic reconnect with exponential backoff plus a visible
  "Reconnecting… (n/m)" state and a manual retry button after exhausted
  attempts.
- **Language-signal fix**: `<html lang="en">` now matches the English head
  metadata (was mismatched with Dutch description).

### P1 — Growth foundations
- **SEO fundamentals**: `robots.txt`, `sitemap.xml`, hreflang variants for
  the 30 supported languages, Open Graph image, PWA `manifest.webmanifest`,
  JSON-LD structured data.
- **GEO (AI answer engines)**: `llms.txt` plus a dedicated, citable
  `how-it-works.html` page with `HowTo` JSON-LD and a FAQ section, written
  so AI assistants can answer "how does BabyPhone.online work" accurately.
- **Accessibility pass**: `aria-label`s on every icon-only control
  (mic/camera/fullscreen/settings/monitor buttons), visible keyboard focus
  states, full keyboard operability, and a published
  `accessibility.html` statement (WCAG 2.1 AA target).

### P2 — Product depth & monetization
- **Real sidebar views**: the dashboard sidebar (Monitor, Talk back,
  Lullabies, Night light, Alerts, Event log, Settings) now routes to real,
  functional views instead of placeholders; finished the sleep timer,
  audio-only mode, and privacy-shade (sound-without-video) sync between
  units.
- **Monetization scaffold**: Stripe Checkout integration point + entitlement
  token issuing via `functions/entitlement-worker.mjs`, with a "Plus" upgrade
  panel wired into the dashboard (`js/plus.js`).

### P3 — Engineering health
- **CI**: `.github/workflows/ci.yml` runs the Playwright e2e suites on every
  push/PR, with concurrency cancel-in-progress to avoid double-runs.
- **Code health**: replaced unsafe `innerHTML` usage with safe DOM
  construction, removed dead `slimSdp` code, split the monolithic script
  into `app.js` / `codec.js` / `i18n.js` / `lullaby.js` / `qr.js` / `plus.js`,
  and made the build reproducible.
- **i18n parity**: all 30 supported languages now carry all 225 interface
  translation keys (previously several languages had partial coverage that
  silently fell back to English).

## 6. Design / homepage rebuild

- Rebuilt the landing page and both dashboards from reference screenshots
  to a dark, premium, "nursery-at-night" aesthetic (see design tokens in
  section 11) — replacing an earlier generic-SaaS-template look.
- Reworked the homepage **"Choose your role"** section into a single framed
  container (`.lp-framed`) with an internal divider line and a floating
  "or" badge between the Baby-unit and Parent-unit cards, matching a
  provided reference design exactly (desktop side-by-side, mobile stacked).
- Ported the hero and role-card illustrations (camera product shot, laptop/
  phone device outlines) from a reference homepage build, keeping the
  original app's functionality untouched.

## 7. Brand asset integration (real logo & camera illustration)

A real brand asset pack (`onderdelen.zip`) was integrated to replace all
placeholder mockups/logos:

- **`serverless/assets/logo.png`** (1351×353, transparent) — camera icon +
  "BabyPhone.online" wordmark (coral "Baby" + blue "Phone.online"). Used:
  - As the site logo/header brand link (landing page, all legal pages)
  - In the footer brand
  - In both dashboard topbars (`.dash-brand` → `.dash-logo-img`)
- **`serverless/assets/camera.png`** (228×353, transparent, cropped cleanly
  from the logo) — the babyphone camera illustration. Used:
  - As the baby-role card illustration on the homepage (`.lp-illus.baby`)
  - As the pairing-screen unit badges for **both** baby and parent screens
    (`.unit-badge.cam`, replacing the previous crib/eye SVG icons)
  - As the dashboard title icon for **both** the baby unit and parent unit
    (`.dash-title-ic.cam`, replacing previous heart/camera SVG icons)
- **`serverless/assets/hero-devices.png`** (1126×694) — camera + tablet +
  phone photo, used as the homepage hero visual (`.lp-hero-img`).
- **Favicons/icons regenerated** from the camera illustration: `favicon-32.png`,
  `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (camera centered on
  a dark navy rounded tile), plus a new `og-image.png` (1200×630 social
  preview crop).

All of the above were applied **without changing any functionality** —
element IDs used by `js/app.js` (pairing, WebRTC signaling, dashboard
controls) were preserved exactly; only markup around icons/images and
supporting CSS changed.

## 8. Local recording (baby unit video + audio)

The parent dashboard's control row has a **Record** button
(`#btnRecord`, next to Talk back / Lullaby / Night light / Cry alert /
Stop) that records the live incoming baby-unit stream — video and audio
together — and saves it straight to the parent's own device. Nothing is
uploaded; this stays consistent with the app's "no cloud, no recordings
stored on a server" privacy claim, since the file never leaves the
browser.

- Uses the browser's native `MediaRecorder` API on `remoteStream` (the
  same WebRTC stream already rendered in the `<video>` element), so no
  extra permissions or connections are needed.
- Picks the best supported codec automatically (`vp9`/`vp8`+`opus`
  WebM, falling back to MP4 where WebM isn't supported).
- On stop, saves via the File System Access API (`showSaveFilePicker`)
  where available, so the user picks the destination folder directly;
  falls back to a normal browser download (`babyunit-<ISO
  timestamp>.webm`) everywhere else.
- The button turns red and its label switches to "Stop" while
  recording (`.ctrlbtn.active`, with a pulsing icon), and reverts once
  the file is saved.
- If the page is closed mid-recording, the existing `pagehide` handler
  stops the recorder so the in-progress clip is still finalized and
  saved rather than lost.
- Fully localized: the "Record" label was added as a new `recordVideo`
  i18n key across all 30 supported languages (the "Recording
  started" / "Saved" / "Recording not supported" toast strings already
  existed from earlier i18n work and were simply wired up).

This reused an existing `toggleRecord()`/`saveBlob()` scaffold in
`js/app.js` that had been written earlier but never connected to a
button — the only new code was the UI wiring, the button markup, the
`.ctrlbtn.active` styling, and the label-swap logic.

## 9. Camera selection & LED light (parent-controlled)

Two device controls the parent can drive on the baby device, both routed
over the existing control channel and surfaced in the parent's **Settings**
view (they appear only when the baby device actually reports the
capability).

- **Camera selection**: the baby unit enumerates its own cameras
  (`navigator.mediaDevices.enumerateDevices()`, video inputs) and reports
  the list + the active device to the parent (`cameraList`). If there are
  two or more cameras, the parent sees a **Camera** dropdown; picking one
  sends `selectCamera` and the baby switches via
  `getUserMedia({video:{deviceId}})` + `RTCRtpSender.replaceTrack()` — the
  same swap pattern already used by `flipCamera()`/recovery. Handy for
  phones/tablets with multiple back lenses or front/back cameras.
- **LED light (flashlight)**: where the baby device's camera track exposes
  the `torch` capability (`getCapabilities().torch`, mainly Android/Chrome),
  the parent gets an **LED light** toggle that turns the physical
  flashlight on/off via `applyConstraints({advanced:[{torch}]})`. The row
  is shown only when the baby reports torch support, so it never appears as
  a dead control on devices (e.g. iOS Safari) that can't do it. Note:
  torch is on/off only — brightness/strength is not a web capability, so
  there's no strength slider for the physical LED (the separate "Night
  light" feature already gives an adjustable soft glow on the baby device's
  *screen*).

Both re-report after a camera switch or track recovery (torch support and
the active camera can change with the lens), and the parent re-requests the
capability list on connect (`getCaps`). New i18n keys (`cameraLabel`,
`ledLight`, `ledOn`, `ledOff`) ship for the seven core languages with
English fallback. Covered by `test/e2e-serverless.js` with a baby context
that simulates two cameras and torch support, asserting the selector and
LED toggle appear and the toggle round-trips.

Not built (deliberately): LiDAR/depth-based movement tracking of the child.
Browsers expose no API for a device's LiDAR or depth sensor — it is not
reachable from a web page at all — so this was left out rather than faked.
The equivalent goal (movement monitoring, also without video) would be
achievable via camera-frame motion analysis; that remains a possible future
addition.

## 10. Connection resilience (reconnect, screen-off camera, older browsers)

Added after a real-world bug report: connections sometimes dropped and the
"reconnecting…" state got stuck loading forever with no video ever coming
back. The root cause was a real gap — the app already had a solid
reconnect system (exponential backoff, a connect timeout, a data-channel
heartbeat, and `RTCPeerConnection.connectionstate` watching — see
`scheduleParentReconnect()`, `startHeartbeat()`, `watchMediaPc()` in
`js/app.js`), but **nothing re-validated that state when the tab/phone came
back to the foreground**. Mobile browsers freeze `setTimeout` timers and
suspend camera/mic tracks while a tab is backgrounded or the screen is
locked, so a phone coming out of sleep could be left showing a stale
"reconnecting" spinner with no trigger to reassess and act.

This also folds in three related asks: the parent unit reconnecting
reliably even when backgrounded, the baby unit's camera/mic surviving a
screen-off phone, and support across older/varied browsers. Two of those
run into genuine browser-platform limits that are worth being explicit
about: **a web page cannot execute with zero tabs open** (so "reconnect
even after the site is fully closed" isn't achievable without adding a
server-side push-notification relay — deliberately **not** built here, to
keep the app's fully serverless, no-account design), and **no web API can
prevent the whole browser app being switched to the background** (Wake
Lock only keeps the *screen* on; switching to a different app on the phone
is an OS-level suspension no website can override).

What was built, all client-side, no backend:

- **Foreground-regain watchdog** — a `visibilitychange`/`pageshow`/`focus`
  listener that, when the page becomes visible again, re-checks real
  connection health (`RTCPeerConnection.connectionState`, live video track
  `readyState`, time since the last heartbeat) instead of trusting
  whatever state a frozen backoff timer left behind, and immediately forces
  a fresh reconnect attempt if anything looks stale. This is the direct fix
  for "reconnect blijft laden."
- **Local connection-lost alert** — a short two/three-tone Web Audio beep
  plus `navigator.vibrate()` fires the moment a real drop is detected
  (`onPeerDrop()`) and again if retries are exhausted, so a parent whose
  phone is screen-off nearby notices immediately rather than discovering
  later that the spinner had been stuck. Distinct tone pattern from the
  existing cry-alert sound so the two can't be confused.
- **Camera/mic auto-recovery** (baby side) — `track.onended` listeners on
  the local video/audio tracks trigger a silent re-`getUserMedia()` +
  `RTCRtpSender.replaceTrack()` swap (the same pattern `flipCamera()`
  already used for manual camera flips), so if the OS kills the camera
  outright, the app tries to bring it back on its own instead of leaving a
  frozen frame with no way back. The foreground-regain watchdog also
  triggers this check on resume.
- **Hardened wake lock** — the native Screen Wake Lock API is still tried
  first, but there's now a fallback for browsers that don't have it at all
  (older Android WebViews, desktop Firefox, Safari before 16.4): a hidden
  1×1 `<canvas>` fed into a looping muted `<video>` via
  `canvas.captureStream()` — the classic "keep the screen on by playing
  video" trick, no external asset needed. The lock is also proactively
  re-requested every 20s in case a browser/power-saving mode silently
  released it outside of a visibility change. The baby-unit tip banner
  (`babyTip`, already shown in all 30 languages) now also says not to
  switch to another app, since that's the one thing wake lock can't cover.
- **Proactive browser-support check** — on load, before any role is
  picked, the app checks for `RTCPeerConnection` and
  `navigator.mediaDevices.getUserMedia`. If either is missing, a clear,
  translated "this browser can't run BabyPhone.online" screen
  (`#browserBlock`) is shown immediately instead of only failing later
  inside the camera-permission flow. This is a hard floor, not a bug: any
  browser with WebRTC support works (all evergreen browsers, and most
  non-ancient ones — roughly 2017+); a browser that never implemented
  WebRTC at all (e.g. Internet Explorer) genuinely cannot run this app, and
  no polyfill changes that.

New i18n keys (`unsupportedTitle`, `unsupportedBody`, and the extended
`babyTip`) were added across all 30 languages, following the same
script-assisted insertion approach used for `recordVideo`.

Covered by `test/e2e-serverless.js`: a synthetic `ended` event on the
baby's video track proves the auto-recovery path works and the parent
keeps receiving video; a dedicated slow-backoff baby/parent pair proves a
`visibilitychange` event forces an immediate reconnect attempt instead of
waiting out the scheduled backoff delay.

## 11. Design system (dark, premium, nocturnal)

Defined in `CLAUDE.md` and implemented via CSS custom properties:

| Token | Value | Purpose |
|---|---|---|
| `--bg` | `#0A101B` / `#0D1524` | base background, near-black navy |
| `--surface` | `#151E30` | glass-dark cards |
| `--line` | `rgba(255,255,255,.07)` | subtle borders |
| `--accent` | `#E8825E` (gradient `#EC8A63 → #E0714B`) | warm coral accent |
| `--ok` | `#4ED08A` | success / connected states |
| `--text` | `#EDEFF4` | warm white |
| `--muted` | `#8C95A8` | grey-blue secondary text |

Typography: **Quicksand** for headings, **Nunito** for body text. Large
border-radius (16–24px), thin translucent borders, generous whitespace,
restrained gradients. Explicitly avoids: generic SaaS-template look,
overly bright colors, childish pastels, cluttered dashboards, "AI landing
page" clichés.

### Liquid Glass (v4)

The whole site — landing, pairing screens, both dashboards, legal pages and
the blog — is styled as **liquid glass** on a single nocturnal backdrop.

- **Background** (site-wide, fixed so it doesn't scroll):
  `radial-gradient(circle at center, #08172D 0%, #041022 45%, #020615 100%)`.
  `theme-color` and the PWA manifest were aligned to it (`#041022` /
  `#020615`).
- **Glass tokens** live on `:root` in `luna.css` (`--lg-fill`, `--lg-edge`,
  `--lg-sheen`, `--lg-inset`, `--lg-shadow`, `--lg-blur`) and are reused by
  `dash.css`, so landing and app share one system. The recipe per surface:
  a translucent white fill, a diagonal specular sheen, a hairline border,
  `backdrop-filter: blur(22px) saturate(165%)`, an inset top highlight and a
  soft drop shadow.
- Applied as an **append-override block** at the end of `luna.css` and
  `dash.css`, so it restyles existing surfaces without touching structure or
  element IDs.
- **Depth rule:** glass panes are never nested. `.lp-framed` sits inside
  `.lp-choose`, so it is an outline only — stacking two translucent fills
  turns the panel milky.
- The dashboard topbar is a **floating glass pill** (rounded, inset margin)
  rather than a full-bleed bar, because `.dash-topbar` is a centered
  1200px container and an edge-to-edge background would look cut off.
- **Legibility guardrails:** a `@supports not (backdrop-filter…)` fallback
  makes fills near-opaque on browsers without backdrop blur; the pairing
  screens got explicit light text colours, since their base tokens still
  come from the original light theme and would otherwise render dark text
  on a dark glass card.
- Video imagery stays opaque — only the chrome around and on top of it
  (badges, focus pill, HD pill) is glass, where see-through is the point.

The homepage hero is a real nursery photo (`assets/hero-nursery.jpg`) whose
dark cloud vignette blends into the backdrop; the social preview
(`og-image.jpg`) is a 1200×630 crop of the same image. Both are JPEG —
as photographs they are ~200 KB instead of ~1.5 MB as PNG.

## 12. Blog / content marketing (`blog.html`)

A multilingual guide post — "Two phones, one baby monitor: everything
BabyPhone.online can do" — that doubles as an SEO/GEO landing page. It
covers the benefits (reusing an old phone or tablet as the camera, using
the two phones you already carry on holiday because the link runs over the
internet rather than a short-range base station), a one-minute setup
walkthrough, and every feature with a one-line "what it's for", plus the
privacy and browser-support story. Illustrated with real product
screenshots in `assets/blog/` (home, parent dashboard, baby dashboard).

- **Self-contained** (`serverless/blog.html`), like the other sub-pages:
  inline dark-theme CSS and inline JS, no external references — so the
  production build just copies it.
- **Multilingual** using the same `?lang=xx` + `localStorage['babyfoon.lang']`
  convention as the app, so it opens in the platform language the visitor
  picked. The language selector lists all 30 languages; full translations
  ship for **English, Dutch, German, French, Spanish, Portuguese and
  Italian**, and any other language falls back to English (the same
  graceful fallback the app's i18n uses). App links from the post preserve
  the chosen language.
- **SEO**: `BlogPosting` JSON-LD, canonical, Open Graph/Twitter cards, and
  `hreflang` alternates **only for the languages that are genuinely
  translated** (advertising a language variant that is really English would
  be a misleading signal). Added to `sitemap.xml` (the post plus its
  translated variants) and cross-linked from the homepage footer and every
  sub-page footer (new `footGuide` i18n key, translated for the seven core
  languages).
- **GEO / "agent SEO"**: `llms.txt` gained a dedicated summary block so AI
  answer engines can cite the guide's key points (no dedicated hardware,
  travel use, the full feature list, browser support).

Note on ranking: proper on-page SEO/GEO is in place, but no code change can
*guarantee* a #1 Google position — that depends on external factors
(backlinks, competition, domain authority, crawl/index timing). This makes
the site as eligible as possible; actual ranking builds over time.

## 13. Deployment

- **Target**: static hosting (currently Hostinger, GitHub auto-deploy from a
  connected repo).
- **What to upload**: the contents of `dist/` (produced by `npm run build`)
  — a single `index.html`, plus `assets/`, `music/`, the legal HTML pages,
  and the SEO/PWA files (`robots.txt`, `sitemap.xml`, `manifest.webmanifest`,
  favicons, `og-image.png`).
- **Note**: the `music/` folder (~34MB of MP3s) is excluded from delivery
  zips due to a 30MB transfer limit — it must be uploaded separately
  alongside the rest of `dist/`.
- `server.js` (Express) is only needed for local dev / the legacy `/legacy/`
  app; the production `serverless/` build needs no backend at all except for
  the optional Plus/Stripe entitlement worker (`functions/entitlement-worker.mjs`),
  which is designed to run on a serverless function platform (e.g.
  Cloudflare Workers) if/when the paid tier is activated.

## 14. Testing

- `test/e2e-serverless.js` — the main regression suite for the live app: room
  code generation, pairing, live video/audio, playlist sync, battery status,
  sidebar views (Lullabies, Settings, Plus panel), sleep timer + baby-tile
  sync, audio-only ↔ camera-visible sync, camera/mic auto-recovery after a
  simulated track `ended` event, wrong-code error handling, the full
  reconnect-with-backoff → retry flow, and a `visibilitychange`-forced
  immediate reconnect. **24/24 checks passing.**
- `test/e2e-reconnect.js` — dedicated forced-disconnect scenario (kills the
  peer connection mid-session, verifies `connectionstatechange` +
  heartbeat-based drop detection trigger reconnection).
- `test/e2e.js` — legacy `/legacy/` app regression (kept for the older
  `public/` version still reachable at that path).
- CI (`.github/workflows/ci.yml`) runs all of the above on every push and
  pull request against `main`.

## 15. Known follow-ups / not yet done

- Legal pages (`contact.html`, `refunds.html`, `accessibility.html`) still
  contain `<em class="todo">[…]</em>` placeholders for operator legal name,
  address, KvK/VAT numbers, and support email — must be filled in with real
  business details before going live commercially.
- Stripe Checkout is scaffolded (`js/plus.js` + `functions/entitlement-worker.mjs`)
  but needs real Stripe keys/price IDs and a deployed worker endpoint to go
  live.
- Some of the 30 interface languages may still have edge-case untranslated
  strings falling back to English (flagged in the accessibility statement).
- The exact production deployment pipeline (GitHub → Hostinger auto-deploy)
  connects to a repo (`lotuspegas-pixel/Babyphone-online`) that may be
  separate from this source repo (`lotuspegas-pixel/Something-new`) —
  worth confirming so pushes here reliably reach production.
