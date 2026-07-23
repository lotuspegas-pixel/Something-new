# Card Studio — Digital Business Card Studio

A visual business-card design tool with LinkedIn auto-fill, print-ready export, and a
QR-code-powered digital business card / networking layer.

This repository is being built in phases. **This PR delivers Phase 1 — Foundation:**

- Project scaffold: Next.js (App Router) + TypeScript + Tailwind CSS v4
- Design system: color/type/motion tokens, dark mode, hand-rolled shadcn/ui-style
  primitives (button, card, badge, tabs, dialog, separator)
- Marketing/landing page: hero, feature walkthrough, pricing section
- Static template gallery: 8 templates across 4 categories, each with a distinct font
  pairing, live-rendered preview (no images), and a full-size preview dialog

No editor, auth, export engine, or QR/digital-card layer yet — those are later phases.

## Stack

- Next.js 16 (App Router, Turbopack) + TypeScript + React 19
- Tailwind CSS v4 (CSS-based theme, no `tailwind.config.js`)
- Hand-rolled shadcn/ui-style components (Radix UI primitives + CVA) — the `shadcn`
  CLI's registry (`ui.shadcn.com`) isn't reachable from this environment, so components
  were added by hand following the same conventions (`components.json` is still present
  for anyone running the CLI from an environment that can reach it)
- next-themes for dark mode, Framer Motion for scroll/hover motion
- next/font/google for all typefaces (Fraunces + Inter site-wide; Manrope, Playfair
  Display, Space Grotesk, and IBM Plex Mono for template previews only)

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. The template gallery is at `/templates`.

```bash
npm run build   # production build
npm run lint    # eslint
```

## Notes for the next phase

- `lib/templates.ts` defines the template data model (`CardLayoutConfig`,
  `CardFieldSample`) that the Phase 2 canvas editor should extend rather than replace.
- `components/ui/button.tsx` is marked `"use client"` because the installed
  `@radix-ui/react-slot@1.3.1` calls `React.createContext` without its own `"use client"`
  directive — if it's ever imported into a Server Component without that boundary, the
  build fails during page-data collection. Worth re-checking on a Radix upgrade.

---

This repo also contains `cosmos.py`, an unrelated terminal particle-simulation toy
predating this project — left untouched.
