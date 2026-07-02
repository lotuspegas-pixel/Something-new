/*
 * Geometry helpers: all edit/annotation data is stored in PDF point space
 * (origin bottom-left, y-up) so it stays valid across zoom levels and is
 * ready to feed straight into pdf-lib at export time. These helpers convert
 * to/from the on-screen viewport pixel space produced by pdf.js.
 */
(function (App) {
  const Geometry = {};

  // rect: [x1, y1, x2, y2] in PDF space -> {left, top, width, height} in viewport px
  Geometry.pdfRectToViewport = function (viewport, rect) {
    const vr = viewport.convertToViewportRectangle(rect);
    const x1 = Math.min(vr[0], vr[2]);
    const x2 = Math.max(vr[0], vr[2]);
    const y1 = Math.min(vr[1], vr[3]);
    const y2 = Math.max(vr[1], vr[3]);
    return { left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
  };

  Geometry.viewportPointToPdf = function (viewport, x, y) {
    const p = viewport.convertToPdfPoint(x, y);
    return { x: p[0], y: p[1] };
  };

  // Convert a screen-space rect (left, top, width, height in px) to a
  // normalized PDF-space rect {x1,y1,x2,y2} (x1<x2, y1<y2).
  Geometry.viewportRectToPdf = function (viewport, left, top, width, height) {
    const p1 = viewport.convertToPdfPoint(left, top);
    const p2 = viewport.convertToPdfPoint(left + width, top + height);
    return {
      x1: Math.min(p1.x !== undefined ? p1.x : p1[0], p2.x !== undefined ? p2.x : p2[0]),
      y1: Math.min(p1.y !== undefined ? p1.y : p1[1], p2.y !== undefined ? p2.y : p2[1]),
      x2: Math.max(p1.x !== undefined ? p1.x : p1[0], p2.x !== undefined ? p2.x : p2[0]),
      y2: Math.max(p1.y !== undefined ? p1.y : p1[1], p2.y !== undefined ? p2.y : p2[1]),
    };
  };

  // Best-effort mapping from a pdf.js textContent style entry to one of the
  // base 14 PDF font families (always embeddable, always accurate metrics).
  // pdf.js does not expose reliable bold/italic flags for standard fonts via
  // getTextContent, so weight/style are left as separate user-toggleable
  // flags (see standardFontKey) rather than guessed here.
  Geometry.mapFontFamily = function (styleEntry, itemFontName) {
    const family = ((styleEntry && styleEntry.fontFamily) || '').toLowerCase();
    const hint = ((itemFontName || '') + ' ' + family).toLowerCase();

    let base = 'Helvetica';
    if (/serif/.test(family) && !/sans-serif/.test(family)) base = 'TimesRoman';
    else if (/monospace/.test(family)) base = 'Courier';
    else if (/times|georgia|garamond|minion|cambria|book\s?antiqua|cardo/.test(hint)) base = 'TimesRoman';
    else if (/courier|consolas|menlo|typewriter/.test(hint)) base = 'Courier';

    const cssFamily = base === 'TimesRoman'
      ? "'Times New Roman', Times, serif"
      : base === 'Courier'
        ? "'Courier New', Courier, monospace"
        : 'Arial, Helvetica, sans-serif';

    return { base, cssFamily };
  };

  // Resolve {base, bold, italic} into a pdf-lib StandardFonts key.
  Geometry.standardFontKey = function (base, bold, italic) {
    if (base === 'TimesRoman') {
      return bold && italic ? 'TimesRomanBoldItalic' : bold ? 'TimesRomanBold' : italic ? 'TimesRomanItalic' : 'TimesRoman';
    }
    if (base === 'Courier') {
      return bold && italic ? 'CourierBoldOblique' : bold ? 'CourierBold' : italic ? 'CourierOblique' : 'Courier';
    }
    return bold && italic ? 'HelveticaBoldOblique' : bold ? 'HelveticaBold' : italic ? 'HelveticaOblique' : 'Helvetica';
  };

  Geometry.cssFamilyForBase = function (base) {
    return base === 'TimesRoman'
      ? "'Times New Roman', Times, serif"
      : base === 'Courier'
        ? "'Courier New', Courier, monospace"
        : 'Arial, Helvetica, sans-serif';
  };

  Geometry.STANDARD_FONT_CHOICES = [
    { label: 'Helvetica', value: 'Helvetica', css: 'Arial, Helvetica, sans-serif' },
    { label: 'Helvetica Bold', value: 'HelveticaBold', css: 'Arial, Helvetica, sans-serif', weight: '700' },
    { label: 'Times Roman', value: 'TimesRoman', css: "'Times New Roman', Times, serif" },
    { label: 'Times Bold', value: 'TimesRomanBold', css: "'Times New Roman', Times, serif", weight: '700' },
    { label: 'Courier', value: 'Courier', css: "'Courier New', Courier, monospace" },
    { label: 'Courier Bold', value: 'CourierBold', css: "'Courier New', Courier, monospace", weight: '700' },
  ];

  Geometry.clamp = function (v, min, max) { return Math.max(min, Math.min(max, v)); };

  // Minimal reimplementation of pdf.js's PageViewport (which pdf.js's UMD
  // browser bundle does not re-export publicly). Used for pages that have no
  // pdf.js page proxy behind them (blank pages we create ourselves). Mirrors
  // pdf.js's own matrix math exactly so blank pages behave identically to
  // real ones for zoom/rotation coordinate conversion.
  function applyTransform(p, m) { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }
  function applyInverseTransform(p, m) {
    const det = m[0] * m[3] - m[1] * m[2];
    const inv = [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
      (m[2] * m[5] - m[4] * m[3]) / det, (m[4] * m[1] - m[5] * m[0]) / det];
    return [inv[0] * p[0] + inv[2] * p[1] + inv[4], inv[1] * p[0] + inv[3] * p[1] + inv[5]];
  }

  Geometry.createSimpleViewport = function ({ viewBox, scale, rotation, offsetX = 0, offsetY = 0, dontFlip = false }) {
    const centerX = (viewBox[2] + viewBox[0]) / 2;
    const centerY = (viewBox[3] + viewBox[1]) / 2;
    let rotateA, rotateB, rotateC, rotateD;
    let rot = ((rotation % 360) + 360) % 360;
    switch (rot) {
      case 180: rotateA = -1; rotateB = 0; rotateC = 0; rotateD = 1; break;
      case 90: rotateA = 0; rotateB = 1; rotateC = 1; rotateD = 0; break;
      case 270: rotateA = 0; rotateB = -1; rotateC = -1; rotateD = 0; break;
      default: rotateA = 1; rotateB = 0; rotateC = 0; rotateD = -1; break;
    }
    if (dontFlip) { rotateC = -rotateC; rotateD = -rotateD; }
    let offsetCanvasX, offsetCanvasY, width, height;
    if (rotateA === 0) {
      offsetCanvasX = Math.abs(centerY - viewBox[1]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerX - viewBox[0]) * scale + offsetY;
      width = (viewBox[3] - viewBox[1]) * scale;
      height = (viewBox[2] - viewBox[0]) * scale;
    } else {
      offsetCanvasX = Math.abs(centerX - viewBox[0]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerY - viewBox[1]) * scale + offsetY;
      width = (viewBox[2] - viewBox[0]) * scale;
      height = (viewBox[3] - viewBox[1]) * scale;
    }
    const transform = [
      rotateA * scale, rotateB * scale, rotateC * scale, rotateD * scale,
      offsetCanvasX - rotateA * scale * centerX - rotateC * scale * centerY,
      offsetCanvasY - rotateB * scale * centerX - rotateD * scale * centerY,
    ];
    return {
      viewBox, scale, rotation: rot, width, height, transform,
      convertToViewportPoint(x, y) { return applyTransform([x, y], transform); },
      convertToViewportRectangle(rect) {
        const tl = applyTransform([rect[0], rect[1]], transform);
        const br = applyTransform([rect[2], rect[3]], transform);
        return [tl[0], tl[1], br[0], br[1]];
      },
      convertToPdfPoint(x, y) { return applyInverseTransform([x, y], transform); },
    };
  };

  Geometry.uid = function () {
    return 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  App.Geometry = Geometry;
})(window.App = window.App || {});
