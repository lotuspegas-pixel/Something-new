/**
 * Vector renderer: CardDocument -> SVG string.
 *
 * This is the export source of truth. PNG rasterises this SVG at high DPI; the
 * PDF is produced from this SVG via svg2pdf.js (vector paths + selectable text).
 * No screenshot path exists anywhere in the export pipeline (Build Spec §4.5, §7).
 *
 * Units: the SVG viewBox is in millimetres so 1 unit == 1 mm == physical size.
 */

import {
  ARTBOARD,
  PRINT,
  resolveBoundText,
  type CardDocument,
  type CardElement,
  type TextElement,
  type PhotoElement,
  type ShapeElement,
  type QrElement,
  type IconElement,
} from "./card-model";

const MM_PER_PT = 0.352778; // 1 pt = 0.352778 mm

export interface RenderOptions {
  /** Drop the background so PNG/SVG/PDF have a transparent canvas (§4.5). */
  transparent?: boolean;
  /** Add bleed, crop marks and a CMYK note for the print-ready export (§4.5). */
  printReady?: boolean;
  /** Map of QR element id -> image href (data URL) rendered by the QR lib. */
  qrHrefs?: Record<string, string>;
  /** Override for photo hrefs (e.g. an embedded data URL for portable export). */
  photoHrefs?: Record<string, string>;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textEl(el: TextElement, doc: CardDocument): string {
  const raw = resolveBoundText(el, doc.contact);
  const content = el.uppercase ? raw.toUpperCase() : raw;
  const sizeMm = el.fontSize * MM_PER_PT;
  const lineH = (el.lineHeight ?? 1.2) * sizeMm;
  const anchor =
    el.align === "center" ? "middle" : el.align === "right" ? "end" : "start";
  const tx = el.align === "center" ? el.x + el.w / 2 : el.align === "right" ? el.x + el.w : el.x;

  const lines = content.split("\n");
  const tspans = lines
    .map((line, i) => {
      // First baseline sits ~0.8em below the top of the box.
      const dy = i === 0 ? sizeMm * 0.8 : lineH;
      return `<tspan x="${tx}" dy="${dy}">${esc(line)}</tspan>`;
    })
    .join("");

  const style = [
    `font-family:${el.fontFamily}`,
    `font-size:${sizeMm}px`,
    `font-weight:${el.fontWeight}`,
    `fill:${el.color}`,
    el.italic ? "font-style:italic" : "",
    el.letterSpacing ? `letter-spacing:${el.letterSpacing * sizeMm}px` : "",
  ]
    .filter(Boolean)
    .join(";");

  return `<text y="${el.y}" text-anchor="${anchor}" style="${style}">${tspans}</text>`;
}

function photoEl(el: PhotoElement, opts: RenderOptions): string {
  const href = opts.photoHrefs?.[el.id] ?? el.src;
  const clipId = `clip-${el.id}`;
  const isCircle = el.radius >= Math.min(el.w, el.h) / 2;
  const rx = isCircle ? Math.min(el.w, el.h) / 2 : el.radius;
  const clip = isCircle
    ? `<ellipse cx="${el.x + el.w / 2}" cy="${el.y + el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}"/>`
    : `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="${rx}" ry="${rx}"/>`;

  if (!href) {
    // Placeholder frame when no photo is set yet.
    return `<g><clipPath id="${clipId}">${clip}</clipPath><rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="${rx}" fill="#e6e6ea" clip-path="url(#${clipId})"/></g>`;
  }
  return `<g><clipPath id="${clipId}">${clip}</clipPath><image href="${esc(
    href
  )}" x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" preserveAspectRatio="${
    el.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"
  }" clip-path="url(#${clipId})"/></g>`;
}

function shapeEl(el: ShapeElement): string {
  const common = `fill="${el.fill}" ${
    el.stroke ? `stroke="${el.stroke}" stroke-width="${el.strokeWidth ?? 0.3}"` : ""
  } ${el.opacity != null ? `opacity="${el.opacity}"` : ""}`;
  if (el.shape === "ellipse") {
    return `<ellipse cx="${el.x + el.w / 2}" cy="${el.y + el.h / 2}" rx="${
      el.w / 2
    }" ry="${el.h / 2}" ${common}/>`;
  }
  if (el.shape === "line") {
    return `<line x1="${el.x}" y1="${el.y + el.h / 2}" x2="${el.x + el.w}" y2="${
      el.y + el.h / 2
    }" stroke="${el.stroke ?? el.fill}" stroke-width="${el.strokeWidth ?? 0.3}"/>`;
  }
  return `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="${
    el.radius ?? 0
  }" ${common}/>`;
}

function qrEl(el: QrElement, opts: RenderOptions): string {
  const href = opts.qrHrefs?.[el.id];
  if (!href) {
    return `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="${el.background}" stroke="#ccc" stroke-width="0.2"/>`;
  }
  return `<image href="${esc(href)}" x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}"/>`;
}

function iconEl(el: IconElement): string {
  // Icons are rendered as simple bullet marks in export; the editor uses lucide.
  return `<circle cx="${el.x + el.w / 2}" cy="${el.y + el.h / 2}" r="${
    Math.min(el.w, el.h) / 2
  }" fill="${el.color}"/>`;
}

function renderElement(
  el: CardElement,
  doc: CardDocument,
  opts: RenderOptions
): string {
  let body: string;
  switch (el.type) {
    case "text":
      body = textEl(el, doc);
      break;
    case "photo":
      body = photoEl(el, opts);
      break;
    case "shape":
      body = shapeEl(el);
      break;
    case "qr":
      body = qrEl(el, opts);
      break;
    case "icon":
      body = iconEl(el);
      break;
    default:
      body = "";
  }
  if (el.rotation) {
    const cx = el.x + el.w / 2;
    const cy = el.y + el.h / 2;
    return `<g transform="rotate(${el.rotation} ${cx} ${cy})">${body}</g>`;
  }
  return body;
}

function cropMarks(offset: number): string {
  const w = ARTBOARD.width;
  const h = ARTBOARD.height;
  const m = PRINT.cropMarkMm;
  const s = 0.15;
  const mark = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="${s}"/>`;
  return [
    // top-left
    mark(offset - m, offset, offset, offset),
    mark(offset, offset - m, offset, offset),
    // top-right
    mark(offset + w, offset, offset + w + m, offset),
    mark(offset + w, offset - m, offset + w, offset),
    // bottom-left
    mark(offset - m, offset + h, offset, offset + h),
    mark(offset, offset + h, offset, offset + h + m),
    // bottom-right
    mark(offset + w, offset + h, offset + w + m, offset + h),
    mark(offset + w, offset + h, offset + w, offset + h + m),
  ].join("");
}

export function renderCardSvg(doc: CardDocument, opts: RenderOptions = {}): string {
  const bleed = opts.printReady ? PRINT.bleedMm : 0;
  const totalW = ARTBOARD.width + bleed * 2;
  const totalH = ARTBOARD.height + bleed * 2;
  const off = bleed;

  const bg = doc.background;
  let bgLayer = "";
  if (!opts.transparent) {
    if (bg.type === "gradient") {
      const angle = bg.angle ?? 90;
      bgLayer = `<defs><linearGradient id="bg" gradientTransform="rotate(${angle})"><stop offset="0%" stop-color="${bg.color}"/><stop offset="100%" stop-color="${
        bg.color2 ?? bg.color
      }"/></linearGradient></defs><rect x="${-off}" y="${-off}" width="${totalW}" height="${totalH}" fill="url(#bg)"/>`;
    } else {
      bgLayer = `<rect x="${-off}" y="${-off}" width="${totalW}" height="${totalH}" fill="${bg.color}"/>`;
    }
  }

  const els = doc.elements
    .map((el) => renderElement(el, doc, opts))
    .join("\n    ");

  const printExtras = opts.printReady
    ? cropMarks(off) +
      `<text x="${off}" y="${totalH - off + 2.4}" style="font-family:Helvetica;font-size:1.8px;fill:#666">Print-ready · 3mm bleed · convert to CMYK before printing</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}mm" height="${totalH}mm" viewBox="${-off} ${-off} ${totalW} ${totalH}">
  <g>
    ${bgLayer}
    ${els}
    ${printExtras}
  </g>
</svg>`;
}
