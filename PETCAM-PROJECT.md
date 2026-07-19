# PetCam.online — Project Documentation

Complete overview of the PetCam.online web app: what it is, how it's built,
and what changed when it was forked from the BabyPhone.online codebase into
a dedicated pet-monitor product.

- **Repository:** `lotuspegas-pixel/Something-new`
- **Working branch:** `claude/pet-monitor-webapp-design-skj0ba`
- **Origin:** forked from `claude/baby-monitor-web-app-5szu4t` (BabyPhone.online)
- **Stack:** Vanilla HTML/CSS/JS, WebRTC (PeerJS), no backend required to run
- **License:** MIT

---

## 1. What it is

PetCam.online is a **serverless, browser-based pet monitor**. Two of the
user's own devices become a pet cam (camera + mic, stays with the pet) and
an owner unit (watches/listens elsewhere). Video and audio stream
**peer-to-peer via WebRTC** — nothing is uploaded to a server, nothing is
recorded, no account or app install is required.

Core flow:
1. Device A opens the site, taps **"Start pet cam"** → gets a 6-character
   room code + QR code, grants camera/mic access.
2. Device B opens the site, taps **"Connect as owner"** → types the code or
   scans the QR.
3. The two devices connect directly (WebRTC/PeerJS, STUN, TURN fallback) and
   the owner sees/hears the pet live.

## 2. Why this fork exists

BabyPhone.online proved out the whole mechanism (pairing, WebRTC, i18n,
dashboard UX, legal-page scaffolding, monetization scaffold). Rather than
build a pet-monitor app from scratch, this repo starts from that working
`serverless/` app and re-themes it end-to-end: new brand ("PetCam.online"),
new "Rustige Schemering" (warm charcoal/amber "cozy den") design tokens
replacing the navy/coral "nursery-at-night" palette, new hand-drawn brand
assets (paw + camera device mark, no borrowed baby imagery), and pet-specific
terminology throughout the UI, marketing pages, and default-language copy.

The `public/` legacy "Luna Unit" app and its `test/e2e.js` suite were **not**
carried over — this fork only builds on the current `serverless/` app.

## 3. Repository layout

```
serverless/              ← THE working app (single-page, no server needed)
  index.html             ← all screens: landing, pairing, both dashboards
  luna.css                ← landing + pairing + shared design tokens
  dash.css                ← dashboard-specific styles
  js/
    app.js                ← pairing, WebRTC/PeerJS, dashboard logic (main)
    i18n.js               ← 30-language table; only en/nl fully translated
    lullaby.js             ← comfort-sound / playlist playback logic
    codec.js               ← SDP/codec helpers
    qr.js                  ← QR generation/scanning glue
    plus.js                ← Plus/monetization entitlement UI hooks
  vendor/                  ← third-party libs (peerjs, qrcode, jsQR) + LICENSES.md
  assets/                  ← brand assets (logo.png, camera.png, hero-devices.png, blog/)
  fonts/                   ← self-hosted Quicksand + Nunito
  music/                   ← comfort-sound MP3s + playlist.json
  privacy.html, terms.html, refunds.html, contact.html,
  accessibility.html, how-it-works.html, blog.html  ← legal & marketing pages
  robots.txt, sitemap.xml, llms.txt, manifest.webmanifest,
  favicon-32.png, icon-192.png, icon-512.png, apple-touch-icon.png, og-image.png

functions/                ← entitlement-worker.mjs — Stripe/Plus token issuing
test/                    ← Playwright e2e suites
  e2e-serverless.js         ← main serverless app flow
  e2e-reconnect.js           ← forced-drop / reconnect-with-backoff flow
.github/workflows/ci.yml  ← runs the e2e suites on push/PR
build.js                  ← bundles serverless/ into a single self-contained dist/index.html
server.js                 ← Express server: serves serverless/ at root (local dev only)
CLAUDE.md                  ← design rules & workflow contract for this repo
```

## 4. Build & run

```bash
npm install
npm start                  # Express server on :3000 — serverless/ at /
npm run build              # produces dist/ — one self-contained index.html + assets/, music/, legal pages
npm run lint                # node -c syntax check on all JS
npm run test:serverless     # Playwright e2e — main app
npm run test:reconnect      # Playwright e2e — forced disconnect/reconnect
```

## 5. What changed from BabyPhone.online

### Brand & naming
- "BabyPhone.online" → "PetCam.online" everywhere: `<title>`s, meta tags,
  JSON-LD, `manifest.webmanifest`, footers, blog metadata, `llms.txt`.
- Domain references `babyphone.online` → `petcam.online` throughout.
- Internal (non-user-facing) identifiers renamed for hygiene, not required
  for correctness but cleaner: `PEER_PREFIX` (`babyfoon-9m3-` →
  `petcam-…`, so pairing sessions can't collide with the original app on
  the shared public PeerJS broker), `window.BABYFOON_*` config globals →
  `window.PETCAM_*`, `localStorage` keys (`babyfoon.lang` → `petcam.lang`,
  `babyfoon.plus` → `petcam.plus`), and the `package.json` name.
- Element IDs, CSS classes, and internal function names that `js/app.js`
  depends on (`screenBaby`, `screenParent`, `pickBaby`, `.vcard.baby`, …)
  were **deliberately left unchanged** — same rule BabyPhone's own
  `CLAUDE.md` used, to avoid regressions for zero visible benefit.

### Terminology
| BabyPhone.online | PetCam.online |
|---|---|
| Baby unit | Pet Cam |
| Parent unit | Owner Unit |
| Cry alert / "Crying detected" | Sound alert / "Sound detected" |
| Lullabies | Comfort sounds |
| Sleep timer | Rest timer |
| Event log | Activity log |

### Design tokens ("Rustige Schemering")
Every hex color from the babyphone navy/coral palette (`#0A101B`,
`#151E30`, `#E8825E`/`#EC8A63`/`#E0714B`, `#4ED08A`, the light-mode
crème/lavender `:root` tokens, and the various decomposed `rgba(...)`
equivalents scattered through `luna.css`/`dash.css` and every standalone
page's inline `<style>`) was replaced with a warm charcoal/umber base and
amber accent — see the token table in `CLAUDE.md`. The inline "nursery"
poster illustration (moon, stars, crib) in `serverless/index.html` was
redrawn as a cozy pet-basket scene with the same night-sky motif.

### Brand assets
`serverless/assets/logo.png`, `camera.png`, `hero-devices.png`,
`og-image.png`, the four favicon/icon files, and the three `assets/blog/`
banners were all regenerated from scratch — hand-authored SVG (a rounded
camera-device mark with a paw-print badge, plus a "Pet"/"Cam.online"
wordmark in Quicksand) rendered to PNG via a headless-Chromium/Playwright
script, since no image-generation tool was available. No BabyPhone
artwork was reused. The wordmark's aspect ratio changed from ~3.83:1 to an
exact 4:1, so `logo.png`'s `width`/`height` attributes in `index.html`
were adjusted accordingly (200×50, 170×43, 150×38).

### i18n scope
Only **English** and **Dutch** were fully rewritten with pet copy in
`serverless/js/i18n.js` (both the base per-language block and, for Dutch,
the supplemental `Object.assign(S.nl, {...})` block). The other 28
language blocks — previously fully translated for babyphone content —
were intentionally emptied to a single `// TODO: pet-copy vertalen`
comment rather than left half-translated with stale baby copy; the
existing `t()` fallback-to-English mechanism means the app is fully
usable (in English) in every language slot while real translations are
pending. The same emptied for the same reason applies to `blog.html`'s
embedded `BLOG` object — only `en`/`nl` entries remain; the `de`/`fr`/
`es`/`pt`/`it` entries that BabyPhone.online had were removed rather than
carrying baby-flavored copy forward, and `hreflang`/sitemap references
to those now-removed languages were dropped.

### Legal & marketing pages
`privacy.html`, `terms.html`, `refunds.html`, `contact.html`,
`accessibility.html`, `how-it-works.html`, `blog.html`, and `llms.txt`
were swept for baby→pet wording (see the terminology table above). Legal
substance (GDPR references, `<em class="todo">[…]</em>` operator-details
placeholders, Stripe/Plus billing clauses, liability/governing-law
clauses) was left untouched — only the monitored-subject framing changed.
Privacy policy §5 ("Children") was rewritten as a pets-specific section,
since a pet isn't a data subject with legal rights the way a child is.

## 6. What was intentionally NOT changed

- **Feature set** — same core features as BabyPhone.online: live video/
  audio, talk-back, comfort sounds (formerly lullabies) with an MP3
  playlist, night light, sound alert (formerly cry alert) with adjustable
  sensitivity, rest timer (formerly sleep timer), audio-only mode, privacy
  shade, local recording, battery status relay, activity log, connection
  resilience (reconnect-with-backoff, foreground-regain watchdog, camera/
  mic auto-recovery, hardened wake lock — see `js/app.js`), and the Plus
  monetization scaffold. None of this logic was touched.
- **Pairing model** — still strictly one-to-one (one pet cam ↔ one owner
  unit per session), matching the approved plan's scope. No multi-pet /
  multi-camera support was added.
- **Plus/Stripe billing** — the scaffold and UI copy moved over, but no
  new Stripe product or worker deployment was set up; this remains a
  placeholder ("Coming soon") exactly as it was pre-fork.
- **WebRTC/pairing engineering** (`js/app.js`, `js/codec.js`, `js/qr.js`)
  — untouched apart from the `PEER_PREFIX` value.

## 7. Design system (dark, premium, "cozy den at night")

Defined in `CLAUDE.md` and implemented via CSS custom properties:

| Token | Value | Purpose |
|---|---|---|
| `--bg` | `#12110F` / `#17130F` | base background, near-black charcoal |
| `--surface` | `#1E1A16` | glass-dark cards |
| `--line` | `rgba(255,255,255,.07)` | subtle borders |
| `--accent` | `#E8B368` (gradient `#E8B368 → #D6903F`) | warm amber accent |
| `--ok` | `#5BC98A` | success / connected states |
| `--text` | `#F2EDE6` | warm white |
| `--muted` | `#9C9184` | warm grey-brown secondary text |

Typography: **Quicksand** for headings, **Nunito** for body text. Large
border-radius (16–24px), thin translucent borders, generous whitespace,
restrained gradients — same mechanism as BabyPhone.online, new palette.

## 8. Testing

- `test/e2e-serverless.js`, `test/e2e-reconnect.js` carried over from the
  babyphone branch; selectors still work unchanged (element IDs weren't
  renamed). Text assertions that checked for baby-specific strings were
  updated to match the new pet copy — see task tracking in this session
  for the exact assertions touched.
- `test/e2e.js` (legacy `/legacy/` "Luna Unit" app regression) was **not**
  carried over, since `public/` itself wasn't forked.
- CI (`.github/workflows/ci.yml`) runs the serverless + reconnect suites
  on every push/PR.

## 9. Known follow-ups / not yet done

- 28 of 30 interface languages, and 5 of 7 blog-post languages, need real
  pet-copy translations — currently English fallback with a `// TODO`
  marker (see §5 above and `CLAUDE.md`).
- Legal pages still contain `<em class="todo">[…]</em>` placeholders for
  operator legal name, address, KvK/VAT number, and support email — must
  be filled in with real business details before going live commercially.
- Stripe Checkout is scaffolded (`js/plus.js` +
  `functions/entitlement-worker.mjs`) but needs real Stripe keys/price IDs
  and a deployed worker endpoint to go live; billing URLs in `js/plus.js`
  docs were updated to the `petcam.online`/`billing.petcam.online`
  pattern but nothing is actually deployed there.
- No production domain/hosting has been set up for `petcam.online` — all
  URLs (canonical, `og:image`, sitemap, `llms.txt`) assume that domain
  will eventually be live.
