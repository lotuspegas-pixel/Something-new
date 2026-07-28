/**
 * Curated business-card templates (Build Spec §4.2).
 *
 * Each template is a factory that produces a full CardDocument seeded with a
 * coordinated font pairing chosen for print legibility. Font families are drawn
 * from the PDF base-14 / web-safe set (Helvetica, Georgia, Times, Courier) so the
 * vector PDF export embeds correctly and "prints correctly anywhere" (§4.5) —
 * custom-font outlining is a documented future enhancement.
 */

import {
  ARTBOARD,
  EMPTY_CONTACT,
  type CardDocument,
  type CardElement,
  type FieldKey,
} from "./card-model";
import { shortId, slugify } from "./utils";

export interface Template {
  id: string;
  name: string;
  category: "Minimal" | "Corporate" | "Creative" | "Bold";
  /** Short description for the gallery card. */
  blurb: string;
  fontPairing: string;
  /** Accent + background swatches for the gallery preview chip. */
  swatch: [string, string];
  build: () => Omit<CardDocument, "id" | "slug" | "updatedAt">;
}

const W = ARTBOARD.width;
const H = ARTBOARD.height;

const sampleContact = {
  name: "Jordan Avery",
  title: "Product Designer",
  company: "Northwind Studio",
  email: "jordan@northwind.studio",
  phone: "+1 (415) 555-0142",
  website: "northwind.studio",
  tagline: "Designing calm software",
};

export const TEMPLATES: Template[] = [
  {
    id: "ink-minimal",
    name: "Ink Minimal",
    category: "Minimal",
    blurb: "Quiet, typographic, lots of breathing room.",
    fontPairing: "Helvetica / Helvetica",
    swatch: ["#1b2559", "#ffffff"],
    build: () => ({
      templateId: "ink-minimal",
      background: { type: "solid", color: "#ffffff" },
      contact: { ...sampleContact },
      links: [],
      elements: [
        text("name", "name", 8, 14, W - 16, "Helvetica", 16, 700, "#141414"),
        text("title", "title", 8, 22, W - 16, "Helvetica", 8.5, 400, "#5b5b66"),
        line("rule", 8, 30, 22, "#141414", 0.4),
        text("company", "company", 8, 34, W - 16, "Helvetica", 8, 600, "#141414"),
        text("email", "email", 8, 40, W - 16, "Helvetica", 7, 400, "#5b5b66"),
        text("phone", "phone", 8, 44.5, W - 16, "Helvetica", 7, 400, "#5b5b66"),
        qr("qr", W - 22, H - 22, 16),
      ],
    }),
  },
  {
    id: "corporate-slate",
    name: "Corporate Slate",
    category: "Corporate",
    blurb: "A confident sidebar and a crisp contact stack.",
    fontPairing: "Helvetica / Georgia",
    swatch: ["#0f2f4a", "#f4f6f8"],
    build: () => ({
      templateId: "corporate-slate",
      background: { type: "solid", color: "#f4f6f8" },
      contact: { ...sampleContact },
      links: [],
      elements: [
        rect("sidebar", 0, 0, 28, H, "#0f2f4a"),
        photo("avatar", 6, 8, 16, 16, 8),
        text("name", "name", 32, 12, W - 40, "Helvetica", 14, 700, "#0f2f4a"),
        text("title", "title", 32, 19.5, W - 40, "Georgia", 8, 400, "#4a5a68"),
        line("rule", 32, 26, W - 40, "#0f2f4a", 0.3),
        text("company", "company", 32, 30, W - 40, "Helvetica", 8, 600, "#0f2f4a"),
        text("email", "email", 32, 35, W - 40, "Georgia", 7, 400, "#4a5a68"),
        text("phone", "phone", 32, 39, W - 40, "Georgia", 7, 400, "#4a5a68"),
        text("website", "website", 32, 43, W - 40, "Georgia", 7, 400, "#4a5a68"),
      ],
    }),
  },
  {
    id: "bold-accent",
    name: "Bold Accent",
    category: "Bold",
    blurb: "High-contrast dark card with a punchy accent bar.",
    fontPairing: "Helvetica / Helvetica",
    swatch: ["#f97316", "#121212"],
    build: () => ({
      templateId: "bold-accent",
      background: { type: "solid", color: "#121212" },
      contact: { ...sampleContact },
      links: [],
      elements: [
        rect("bar", 0, 0, W, 6, "#f97316"),
        text("name", "name", 8, 16, W - 16, "Helvetica", 18, 800, "#ffffff"),
        text("title", "title", 8, 25, W - 16, "Helvetica", 8.5, 500, "#f97316"),
        text("company", "company", 8, 37, W - 30, "Helvetica", 8, 600, "#ffffff"),
        text("email", "email", 8, 42, W - 30, "Helvetica", 7, 400, "#b9b9c0"),
        text("phone", "phone", 8, 46, W - 30, "Helvetica", 7, 400, "#b9b9c0"),
        qr("qr", W - 22, H - 22, 16, "#ffffff", "#121212"),
      ],
    }),
  },
  {
    id: "creative-gradient",
    name: "Creative Gradient",
    category: "Creative",
    blurb: "Warm gradient wash with an editorial serif name.",
    fontPairing: "Georgia / Helvetica",
    swatch: ["#7c3aed", "#fdf2f8"],
    build: () => ({
      templateId: "creative-gradient",
      background: {
        type: "gradient",
        color: "#fdf2f8",
        color2: "#ede9fe",
        angle: 135,
      },
      contact: { ...sampleContact },
      links: [],
      elements: [
        photo("avatar", 8, 8, 18, 18, 9),
        text("name", "name", 30, 13, W - 38, "Georgia", 16, 700, "#4c1d95"),
        text("tagline", "tagline", 30, 21, W - 38, "Helvetica", 7.5, 400, "#6d28d9"),
        line("rule", 30, 27, W - 38, "#c4b5fd", 0.3),
        text("email", "email", 30, 31, W - 38, "Helvetica", 7, 400, "#5b21b6"),
        text("website", "website", 30, 35, W - 38, "Helvetica", 7, 400, "#5b21b6"),
        qr("qr", W - 20, H - 20, 14, "#4c1d95", "#ffffff"),
      ],
    }),
  },
  {
    id: "mono-tech",
    name: "Mono Tech",
    category: "Minimal",
    blurb: "Monospace, terminal-inspired, developer-friendly.",
    fontPairing: "Courier / Helvetica",
    swatch: ["#10b981", "#0b1220"],
    build: () => ({
      templateId: "mono-tech",
      background: { type: "solid", color: "#0b1220" },
      contact: { ...sampleContact },
      links: [],
      elements: [
        text("prompt", "tagline", 8, 12, W - 16, "Courier", 7, 400, "#10b981"),
        text("name", "name", 8, 20, W - 16, "Helvetica", 15, 700, "#e6edf3"),
        text("title", "title", 8, 27, W - 16, "Courier", 7.5, 400, "#8b949e"),
        text("email", "email", 8, 38, W - 16, "Courier", 7, 400, "#8b949e"),
        text("phone", "phone", 8, 42.5, W - 16, "Courier", 7, 400, "#8b949e"),
        qr("qr", W - 21, H - 21, 15, "#e6edf3", "#0b1220"),
      ],
    }),
  },
  {
    id: "executive-serif",
    name: "Executive Serif",
    category: "Corporate",
    blurb: "Classic centred layout with a formal serif hierarchy.",
    fontPairing: "Georgia / Georgia",
    swatch: ["#7a5901", "#fbfaf7"],
    build: () => ({
      templateId: "executive-serif",
      background: { type: "solid", color: "#fbfaf7" },
      contact: { ...sampleContact },
      links: [],
      elements: [
        text("company", "company", 0, 10, W, "Georgia", 8, 600, "#7a5901", "center", true),
        text("name", "name", 0, 20, W, "Georgia", 16, 700, "#1a1a1a", "center"),
        text("title", "title", 0, 28, W, "Georgia", 8, 400, "#555", "center"),
        line("rule", W / 2 - 12, 33, 24, "#7a5901", 0.3),
        text("email", "email", 0, 38, W, "Georgia", 7, 400, "#555", "center"),
        text("phone", "phone", 0, 43, W, "Georgia", 7, 400, "#555", "center"),
      ],
    }),
  },
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Build a fresh CardDocument from a template id. */
export function instantiateTemplate(id: string): CardDocument {
  const tpl = getTemplate(id) ?? TEMPLATES[0];
  const base = tpl.build();
  return {
    ...base,
    id: shortId(10),
    slug: `${slugify(base.contact.name || "card")}-${shortId(5)}`,
    updatedAt: Date.now(),
    contact: { ...EMPTY_CONTACT, ...base.contact },
  };
}

// ---- element factory helpers ----

function text(
  id: string,
  bind: FieldKey,
  x: number,
  y: number,
  w: number,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
  color: string,
  align: "left" | "center" | "right" = "left",
  uppercase = false
): CardElement {
  return {
    id,
    type: "text",
    bind,
    x,
    y,
    w,
    h: fontSize * 0.4,
    text: "",
    fontFamily,
    fontSize,
    fontWeight,
    color,
    align,
    uppercase,
    letterSpacing: uppercase ? 0.08 : 0,
  };
}

function line(id: string, x: number, y: number, w: number, color: string, sw: number): CardElement {
  return { id, type: "shape", shape: "line", x, y, w, h: 0.5, fill: color, stroke: color, strokeWidth: sw };
}

function rect(id: string, x: number, y: number, w: number, h: number, fill: string): CardElement {
  return { id, type: "shape", shape: "rect", x, y, w, h, fill };
}

function photo(id: string, x: number, y: number, w: number, h: number, radius: number): CardElement {
  return { id, type: "photo", x, y, w, h, src: null, radius, fit: "cover", bind: undefined };
}

function qr(
  id: string,
  x: number,
  y: number,
  size: number,
  color = "#141414",
  background = "#ffffff"
): CardElement {
  return { id, type: "qr", x, y, w: size, h: size, color, background };
}
