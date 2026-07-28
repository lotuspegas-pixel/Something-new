# CardStudio — Digital Business Card Studio

Design a print-ready business card, auto-fill your name and photo from LinkedIn,
export vector files, and share a **QR-powered digital card** that saves straight
to a recipient's contacts.

Built with **Next.js (App Router) + TypeScript**, **Tailwind CSS**, **Framer
Motion**, and a serializable **vector card model** that drives both the editor
and the export engine.

## What's implemented

| Phase | Area | Status |
| ----- | ---- | ------ |
| 1 | Marketing page, design system (light/dark), live template gallery | ✅ |
| 2 | Canvas card editor — every field editable, drag/snap, undo/redo, autosave | ✅ |
| 3 | Auth.js + LinkedIn OIDC scaffold, name/photo auto-fill, manual title/company, photo re-hosting | ✅ (env-gated) |
| 4 | Export engine — transparent PNG, **vector** PDF (print-ready toggle), editable SVG | ✅ |
| 5 | Hosted `/c/[slug]` digital card, branded QR, vCard 3.0 "Save to Contacts", custom links | ✅ |
| 6 | Privacy-conscious scan logging + analytics dashboard | ✅ |
| 5.6 | Multi-language recipient page | ✅ |
| 6–8 | Wallet passes, AI scanner, lead capture, team tier | Scaffolded in data model / UI, not built |

## Key architecture decision — the vector card model

Each card is a serializable **vector document** (`src/lib/card-model.ts`) rendered
to SVG (`src/lib/render-svg.ts`). This one model is the single source of truth for
editing, on-screen preview, and export:

- **SVG export** is the raw vector document — fully editable in Illustrator/Figma/Inkscape.
- **PDF export** is produced with `svg2pdf.js` → `jsPDF`, so text stays selectable
  vector content. It is **never** a screenshot re-encoded as PDF (Build Spec §4.5, §7).
- **PNG export** rasterizes the same SVG at ~305 DPI onto a transparent canvas.

Template fonts use the PDF base-14 / web-safe set (Helvetica, Georgia, Times,
Courier) so vector PDFs embed correctly and print anywhere.

## Compliance notes (from the spec's non-negotiables)

- **LinkedIn:** OpenID Connect only (`openid profile email`) — no scraping, no
  "paste a URL and fetch everything." Company/title are **not** provided by
  consumer sign-in and are ordinary manual fields (§4.4).
- **QR encodes the card URL**, never a raw vCard — so info can be updated without
  reprinting and scans are analyzable. The photo is **never** embedded in a QR or
  base64'd into the vCard (§4.6, §7).
- **No `.ai` export** — the vector download is labeled honestly as "Vector PDF/SVG,
  opens and edits fully in Illustrator" (§4.5).
- Scan logs store only timestamp, referrer, and coarse country/region (GDPR, §4.7).

## Running locally

```bash
npm install
cp .env.example .env        # optional: add LinkedIn / DB / storage creds
npm run dev                 # http://localhost:3000
```

The app runs **with no external services**. Without `DATABASE_URL`, a JSON
file-store fallback (`src/lib/store.ts`) persists published cards + scans so the
whole publish → QR → scan → analytics loop works locally. LinkedIn sign-in stays
disabled until you set `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` and flip
`NEXT_PUBLIC_LINKEDIN_ENABLED=true`.

### Production data model

`prisma/schema.prisma` defines the full PostgreSQL model (User, Card, Template,
Link, ScanEvent, LeadCapture, Team, TeamMember). Set `DATABASE_URL`, run
`npm run prisma:push`, and wire the Prisma client into `src/lib/store.ts` to swap
the file-store for Postgres.

## Try the loop

1. `/templates` → pick a template → the editor opens.
2. Edit fields in **Content**, style elements in **Design**, drag on the canvas.
3. **Publish digital card** → get a `/c/[slug]` URL.
4. Open it on a phone (or scan the exported QR) → **Save to Contacts** downloads a
   working `.vcf`.
5. `/analytics/[slug]` shows scan counts.

## Project layout

```
src/
  app/                    routes: marketing, templates, editor, /c/[slug], api/*
  components/
    marketing/            hero, template gallery
    editor/               artboard, inspector, content & export panels
    card/                 card-svg renderer, digital-card recipient page
  lib/
    card-model.ts         the vector document model
    render-svg.ts         model -> SVG (export source of truth)
    export.ts             PNG / vector PDF / SVG
    templates.ts          curated templates
    vcard.ts              hand-rolled vCard 3.0 (RFC 2426)
    qr.ts                 branded QR generation
    store.ts              server store (Postgres | file fallback)
    auth.ts               Auth.js + LinkedIn OIDC
prisma/schema.prisma      production data model
```
