/**
 * The Card Document Model.
 *
 * A card is a serializable, resolution-independent *vector* document: an ordered
 * list of positioned elements plus global style. This model is the single source
 * of truth that the editor mutates, the preview renders, and — critically — the
 * export engine (PNG / vector PDF / SVG) renders from. Because export reads this
 * vector model (see `render-svg.ts`), the PDF/SVG are true vector output with
 * selectable text, never a raster screenshot (Build Spec §2, §4.5, §7).
 *
 * Coordinates are in millimetres on a standard business-card artboard so the
 * print export maps 1:1 to physical size.
 */

/** Standard business-card artboard, in millimetres (85.6 × 53.98, ISO/IEC 7810 ID-1). */
export const ARTBOARD = { width: 85.6, height: 53.98 } as const;

/** Bleed and safe margins for the print-ready export (§4.5). */
export const PRINT = {
  bleedMm: 3,
  safeMm: 3,
  cropMarkMm: 3,
} as const;

export type ElementType = "text" | "photo" | "shape" | "icon" | "qr";

export interface BaseElement {
  id: string;
  type: ElementType;
  /** Top-left position in mm on the artboard. */
  x: number;
  y: number;
  /** Size in mm. */
  w: number;
  h: number;
  rotation?: number;
  /** Locked elements can't be selected/moved in the editor. */
  locked?: boolean;
  /** Optional data-binding key; auto-fill writes into bound elements (e.g. "name"). */
  bind?: FieldKey;
}

export type FieldKey =
  | "name"
  | "title"
  | "company"
  | "email"
  | "phone"
  | "website"
  | "tagline";

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number; // pt
  fontWeight: number;
  letterSpacing?: number; // em
  lineHeight?: number;
  color: string;
  align: "left" | "center" | "right";
  italic?: boolean;
  uppercase?: boolean;
}

export interface PhotoElement extends BaseElement {
  type: "photo";
  /** Object URL / hosted URL. LinkedIn photos are re-hosted first (§4.4). */
  src: string | null;
  radius: number; // corner radius in mm; >= h/2 => circle
  fit: "cover" | "contain";
}

export interface ShapeElement extends BaseElement {
  type: "shape";
  shape: "rect" | "ellipse" | "line";
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  opacity?: number;
}

export interface IconElement extends BaseElement {
  type: "icon";
  /** lucide icon name */
  icon: string;
  color: string;
  strokeWidth?: number;
}

export interface QrElement extends BaseElement {
  type: "qr";
  /** Rendered at export time to encode the digital-card URL (§4.6). */
  color: string;
  background: string;
}

export type CardElement =
  | TextElement
  | PhotoElement
  | ShapeElement
  | IconElement
  | QrElement;

export interface CardBackground {
  type: "solid" | "gradient";
  color: string;
  /** For gradients. */
  color2?: string;
  angle?: number;
  /** Transparent export means the background is dropped from PNG/SVG/PDF (§4.5). */
  transparent?: boolean;
}

/** The contact data that powers the vCard + digital card, independent of layout. */
export interface CardContact {
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  tagline: string;
}

export interface CardLink {
  id: string;
  label: string;
  url: string;
}

export interface CardDocument {
  id: string;
  slug: string;
  templateId: string;
  background: CardBackground;
  elements: CardElement[];
  contact: CardContact;
  /** Extra buttons on the digital card beyond LinkedIn (§4.6). */
  links: CardLink[];
  linkedInUrl?: string;
  updatedAt: number;
}

export const EMPTY_CONTACT: CardContact = {
  name: "",
  title: "",
  company: "",
  email: "",
  phone: "",
  website: "",
  tagline: "",
};

/** Resolve the visible text for a bound element from the contact record. */
export function resolveBoundText(
  el: TextElement,
  contact: CardContact
): string {
  if (el.bind && contact[el.bind]) return contact[el.bind];
  return el.text;
}
