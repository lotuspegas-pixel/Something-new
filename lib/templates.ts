export type CardTemplateCategory =
  | "corporate"
  | "creative"
  | "minimal"
  | "luxury";

export type CardFieldSample = {
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  website: string;
};

export type CardLayoutConfig = {
  /** Tailwind-safe inline CSS background (solid, gradient, or split panel) */
  background: string;
  foreground: string;
  muted: string;
  accent: string;
  align: "left" | "center" | "right";
  /** CSS var name (without var()) pointing at a font loaded in lib/fonts.ts */
  headingFont: string;
  bodyFont: string;
  headingStyle?: "normal" | "italic";
  /** Visual motif rendered behind the content */
  motif: "none" | "geometric" | "radial" | "grid" | "split" | "frame";
  border?: boolean;
};

export type CardTemplate = {
  id: string;
  name: string;
  category: CardTemplateCategory;
  description: string;
  fontPairingLabel: string;
  layout: CardLayoutConfig;
  sample: CardFieldSample;
};

const defaultSample: CardFieldSample = {
  name: "Alex Morgan",
  title: "Add your title",
  company: "Northwind Studio",
  email: "alex@northwind.studio",
  phone: "+1 (555) 019-2847",
  website: "northwind.studio",
};

export const cardTemplates: CardTemplate[] = [
  {
    id: "corporate-minimal",
    name: "Corporate Minimal",
    category: "corporate",
    description: "Clean grid, generous whitespace, built for consultancies.",
    fontPairingLabel: "Manrope + Inter",
    layout: {
      background: "var(--card)",
      foreground: "var(--foreground)",
      muted: "var(--muted-foreground)",
      accent: "var(--primary)",
      align: "left",
      headingFont: "--font-manrope",
      bodyFont: "--font-body",
      motif: "none",
      border: true,
    },
    sample: defaultSample,
  },
  {
    id: "executive-serif",
    name: "Executive Serif",
    category: "corporate",
    description: "A confident serif headline for partners and principals.",
    fontPairingLabel: "Playfair Display + Inter",
    layout: {
      background: "oklch(0.2 0.015 262)",
      foreground: "oklch(0.98 0.006 90)",
      muted: "oklch(0.72 0.02 262)",
      accent: "oklch(0.78 0.13 86)",
      align: "left",
      headingFont: "--font-playfair",
      bodyFont: "--font-body",
      motif: "frame",
    },
    sample: { ...defaultSample, title: "Managing Partner" },
  },
  {
    id: "bold-geometric",
    name: "Bold Geometric",
    category: "creative",
    description: "Angular shapes and a punchy accent for design-forward teams.",
    fontPairingLabel: "Space Grotesk + Manrope",
    layout: {
      background:
        "linear-gradient(135deg, oklch(0.5 0.19 276) 0%, oklch(0.62 0.19 300) 100%)",
      foreground: "oklch(0.99 0.006 90)",
      muted: "oklch(0.92 0.02 276)",
      accent: "oklch(0.78 0.13 86)",
      align: "left",
      headingFont: "--font-space-grotesk",
      bodyFont: "--font-manrope",
      motif: "geometric",
    },
    sample: { ...defaultSample, title: "Creative Director" },
  },
  {
    id: "creative-gradient",
    name: "Creative Gradient",
    category: "creative",
    description: "Soft radial glow behind an expressive display headline.",
    fontPairingLabel: "Fraunces + Manrope",
    layout: {
      background:
        "linear-gradient(160deg, oklch(0.96 0.03 40) 0%, oklch(0.9 0.06 20) 100%)",
      foreground: "oklch(0.22 0.03 30)",
      muted: "oklch(0.4 0.05 30)",
      accent: "oklch(0.5 0.19 276)",
      align: "center",
      headingFont: "--font-display",
      bodyFont: "--font-manrope",
      motif: "radial",
    },
    sample: { ...defaultSample, title: "Freelance Photographer" },
  },
  {
    id: "classic-monochrome",
    name: "Classic Monochrome",
    category: "minimal",
    description: "Black, white, and a monospace detail row. Timeless.",
    fontPairingLabel: "Playfair Display + IBM Plex Mono",
    layout: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.15 0 0)",
      muted: "oklch(0.4 0 0)",
      accent: "oklch(0.15 0 0)",
      align: "left",
      headingFont: "--font-playfair",
      bodyFont: "--font-plex-mono",
      motif: "grid",
      border: true,
    },
    sample: { ...defaultSample, title: "Architect" },
  },
  {
    id: "tech-circuit",
    name: "Tech Circuit",
    category: "creative",
    description: "Dark surface with a monospace contact block for builders.",
    fontPairingLabel: "Space Grotesk + IBM Plex Mono",
    layout: {
      background: "oklch(0.14 0.01 262)",
      foreground: "oklch(0.95 0.02 160)",
      muted: "oklch(0.62 0.03 160)",
      accent: "oklch(0.75 0.16 160)",
      align: "left",
      headingFont: "--font-space-grotesk",
      bodyFont: "--font-plex-mono",
      motif: "grid",
    },
    sample: { ...defaultSample, title: "Software Engineer" },
  },
  {
    id: "warm-editorial",
    name: "Warm Editorial",
    category: "creative",
    description: "Italic display serif on warm paper — feels hand-set.",
    fontPairingLabel: "Fraunces Italic + Inter",
    layout: {
      background: "oklch(0.97 0.015 80)",
      foreground: "oklch(0.24 0.02 60)",
      muted: "oklch(0.45 0.03 60)",
      accent: "oklch(0.55 0.14 40)",
      align: "center",
      headingFont: "--font-display",
      headingStyle: "italic",
      bodyFont: "--font-body",
      motif: "split",
    },
    sample: { ...defaultSample, title: "Editor in Chief" },
  },
  {
    id: "luxury-foil",
    name: "Luxury Foil",
    category: "luxury",
    description: "Deep ink background with a gold-foil accent line.",
    fontPairingLabel: "Playfair Display + Manrope",
    layout: {
      background: "oklch(0.12 0.01 262)",
      foreground: "oklch(0.96 0.01 86)",
      muted: "oklch(0.68 0.03 86)",
      accent: "oklch(0.78 0.13 86)",
      align: "center",
      headingFont: "--font-playfair",
      bodyFont: "--font-manrope",
      motif: "frame",
      border: true,
    },
    sample: { ...defaultSample, title: "Founder & CEO" },
  },
];

export function getTemplateById(id: string) {
  return cardTemplates.find((t) => t.id === id);
}

export const templateCategories: { value: CardTemplateCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "corporate", label: "Corporate" },
  { value: "creative", label: "Creative" },
  { value: "minimal", label: "Minimal" },
  { value: "luxury", label: "Luxury" },
];
