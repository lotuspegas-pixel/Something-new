"use client";

/**
 * Client-side export engine (Build Spec §4.5).
 *
 * All three formats derive from the SVG vector model (render-svg.ts):
 *   - SVG : the raw vector document, fully editable in Illustrator/Figma/Inkscape.
 *   - PDF : produced with svg2pdf.js -> jsPDF, so text stays selectable vector
 *           content. This is NOT a screenshot re-encoded as PDF (§7).
 *   - PNG : the SVG rasterised at high DPI onto a transparent canvas.
 *
 * All exports honour a transparent background; PDF supports a print-ready toggle
 * (bleed + crop marks + CMYK note).
 */

import { jsPDF } from "jspdf";
import "svg2pdf.js";
import { ARTBOARD, PRINT, type CardDocument } from "./card-model";
import { renderCardSvg, type RenderOptions } from "./render-svg";
import { qrToDataUrl } from "./qr";

/** Build QR data URLs for every qr element, encoding the card's public URL. */
async function buildQrHrefs(
  doc: CardDocument,
  cardUrl: string
): Promise<Record<string, string>> {
  const hrefs: Record<string, string> = {};
  for (const el of doc.elements) {
    if (el.type === "qr") {
      hrefs[el.id] = await qrToDataUrl(cardUrl, {
        color: el.color,
        background: el.background,
        level: "M",
      });
    }
  }
  return hrefs;
}

async function composedSvg(
  doc: CardDocument,
  cardUrl: string,
  opts: RenderOptions
): Promise<string> {
  const qrHrefs = await buildQrHrefs(doc, cardUrl);
  return renderCardSvg(doc, { ...opts, qrHrefs });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportSvg(doc: CardDocument, cardUrl: string, transparent = true) {
  const svg = await composedSvg(doc, cardUrl, { transparent });
  triggerDownload(new Blob([svg], { type: "image/svg+xml" }), `${doc.slug}.svg`);
}

export async function exportPng(
  doc: CardDocument,
  cardUrl: string,
  { transparent = true, scale = 12 }: { transparent?: boolean; scale?: number } = {}
) {
  const svg = await composedSvg(doc, cardUrl, { transparent });
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    // scale is px per mm; 12 px/mm ≈ 305 DPI at card size — print quality.
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(ARTBOARD.width * scale);
    canvas.height = Math.round(ARTBOARD.height * scale);
    const ctx = canvas.getContext("2d")!;
    if (!transparent) {
      ctx.fillStyle = doc.background.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (blob) triggerDownload(blob, `${doc.slug}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPdf(
  doc: CardDocument,
  cardUrl: string,
  { transparent = true, printReady = false }: { transparent?: boolean; printReady?: boolean } = {}
) {
  const svg = await composedSvg(doc, cardUrl, { transparent, printReady });
  const el = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement as unknown as SVGSVGElement;

  const bleed = printReady ? PRINT.bleedMm : 0;
  const w = ARTBOARD.width + bleed * 2;
  const h = ARTBOARD.height + bleed * 2;

  const pdf = new jsPDF({
    orientation: w >= h ? "landscape" : "portrait",
    unit: "mm",
    format: [w, h],
    compress: true,
  });

  // svg2pdf.js augments jsPDF with .svg(); text remains selectable vector content.
  await (pdf as unknown as { svg: (e: Element, o: object) => Promise<jsPDF> }).svg(el, {
    x: 0,
    y: 0,
    width: w,
    height: h,
  });

  pdf.save(`${doc.slug}${printReady ? "-print-ready" : ""}.pdf`);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
