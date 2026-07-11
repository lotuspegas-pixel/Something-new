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
  nursery aesthetic — see section 8 below).

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
  e2e-serverless.js         ← main serverless app flow (20 assertions)
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
npm run test:serverless     # Playwright e2e — main app (20 checks)
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
  section 8) — replacing an earlier generic-SaaS-template look.
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

## 8. Design system (dark, premium, nocturnal)

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

## 9. Deployment

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

## 10. Testing

- `test/e2e-serverless.js` — the main regression suite for the live app: room
  code generation, pairing, live video/audio, playlist sync, battery status,
  sidebar views (Lullabies, Settings, Plus panel), sleep timer + baby-tile
  sync, audio-only ↔ camera-visible sync, wrong-code error handling, and the
  full reconnect-with-backoff → retry flow. **20/20 checks passing.**
- `test/e2e-reconnect.js` — dedicated forced-disconnect scenario (kills the
  peer connection mid-session, verifies `connectionstatechange` +
  heartbeat-based drop detection trigger reconnection).
- `test/e2e.js` — legacy `/legacy/` app regression (kept for the older
  `public/` version still reachable at that path).
- CI (`.github/workflows/ci.yml`) runs all of the above on every push and
  pull request against `main`.

## 11. Known follow-ups / not yet done

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
