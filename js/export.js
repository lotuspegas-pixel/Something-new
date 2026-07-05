/*
 * Bakes the current document (page structure + all edit objects) into a
 * fresh PDF using pdf-lib, and triggers a download. Nothing here touches
 * the network — the whole export happens locally in the browser.
 */
(function (App) {
  const { PDFDocument, StandardFonts, rgb, degrees, LineCapStyle } = window.PDFLib;
  const State = App.State;
  const Geometry = App.Geometry;

  const Export = {};

  function hexToRgb01(hex) {
    if (!hex) return rgb(0, 0, 0);
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    return rgb(r, g, b);
  }

  function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Build one filled polygon (arrowhead) as an SVG path, compensating for
  // pdf-lib's drawSvgPath Y-flip so it lands at absolute PDF coordinates.
  function svgPathFromPoints(points) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${-p.y}`).join(' ');
  }

  async function buildOutputDoc(onProgress, pagesOverride) {
    const state = State.data;
    const mainDoc = await PDFDocument.load(state.originalBytes);
    const insertedDocCache = {};
    for (const docId of Object.keys(state.insertedDocs)) {
      insertedDocCache[docId] = await PDFDocument.load(state.insertedDocs[docId].bytes);
    }

    const outDoc = await PDFDocument.create();
    const fontCache = {};
    async function getFont(key) {
      if (!fontCache[key]) fontCache[key] = await outDoc.embedFont(StandardFonts[key]);
      return fontCache[key];
    }
    const imageCache = {};
    async function getImage(dataUrl) {
      if (!imageCache[dataUrl]) {
        const bytes = dataUrlToBytes(dataUrl);
        imageCache[dataUrl] = dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')
          ? await outDoc.embedJpg(bytes)
          : await outDoc.embedPng(bytes);
      }
      return imageCache[dataUrl];
    }

    const pages = pagesOverride || state.pages;
    for (let i = 0; i < pages.length; i++) {
      const pd = pages[i];
      if (onProgress) onProgress(i + 1, pages.length);

      let page;
      if (pd.kind === 'blank') {
        page = outDoc.addPage([pd.width, pd.height]);
      } else if (pd.kind === 'original') {
        const [copied] = await outDoc.copyPages(mainDoc, [pd.originalIndex]);
        page = outDoc.addPage(copied);
      } else if (pd.kind === 'inserted') {
        const srcDoc = insertedDocCache[pd.sourceDocId];
        const [copied] = await outDoc.copyPages(srcDoc, [pd.sourcePageIndex]);
        page = outDoc.addPage(copied);
      }
      if (!page) continue;

      const extraRotation = pd.rotation || 0;
      if (extraRotation) {
        const current = page.getRotation().angle || 0;
        page.setRotation(degrees((current + extraRotation) % 360));
      }

      const objects = State.objectsForPage(pd.id);
      for (const obj of objects) {
        await drawObject(page, obj, getFont, getImage);
      }
    }
    return outDoc;
  }

  async function drawObject(page, obj, getFont, getImage) {
    switch (obj.type) {
      case 'text-edit': {
        const c = obj.coverRect;
        page.drawRectangle({
          x: c.x1, y: c.y1, width: c.x2 - c.x1, height: (c.y2 - c.y1) + 1,
          color: hexToRgb01(obj.coverColor || '#ffffff'),
        });
        if (obj.text) {
          const font = await getFont(Geometry.standardFontKey(obj.base, obj.bold, obj.italic));
          page.drawText(obj.text, {
            x: obj.baseline.x, y: obj.baseline.y, size: obj.size,
            font, color: hexToRgb01(obj.color || '#14161a'),
          });
        }
        break;
      }
      case 'text-add': {
        if (!obj.text) break;
        const font = await getFont(Geometry.standardFontKey(obj.base, obj.bold, obj.italic));
        const lines = obj.text.split('\n');
        const lineHeight = obj.size * 1.2;
        let y = obj.rect.y2 - obj.size;
        for (const line of lines) {
          page.drawText(line, { x: obj.rect.x1, y, size: obj.size, font, color: hexToRgb01(obj.color || '#14161a') });
          y -= lineHeight;
        }
        break;
      }
      case 'whiteout': {
        const r = obj.rect;
        page.drawRectangle({ x: r.x1, y: r.y1, width: r.x2 - r.x1, height: r.y2 - r.y1, color: hexToRgb01(obj.color || '#ffffff') });
        break;
      }
      case 'highlight': {
        const r = obj.rect;
        page.drawRectangle({
          x: r.x1, y: r.y1, width: r.x2 - r.x1, height: r.y2 - r.y1,
          color: hexToRgb01(obj.color || '#ffe066'),
          opacity: obj.opacity != null ? obj.opacity : 0.45,
        });
        break;
      }
      case 'underline':
      case 'strikethrough': {
        const r = obj.rect;
        const h = Math.max(1, (r.y2 - r.y1) * 0.06);
        const y = obj.type === 'underline' ? r.y1 : (r.y1 + r.y2) / 2 - h / 2;
        page.drawRectangle({ x: r.x1, y, width: r.x2 - r.x1, height: h, color: hexToRgb01(obj.color || '#e5484d') });
        break;
      }
      case 'image':
      case 'signature': {
        const img = await getImage(obj.dataUrl);
        const r = obj.rect;
        page.drawImage(img, { x: r.x1, y: r.y1, width: r.x2 - r.x1, height: r.y2 - r.y1 });
        break;
      }
      case 'draw': {
        if (!obj.points || obj.points.length < 2) break;
        const path = svgPathFromPoints(obj.points);
        page.drawSvgPath(path, {
          x: 0, y: 0, borderColor: hexToRgb01(obj.color || '#e5484d'),
          borderWidth: obj.strokeWidth || 3, borderLineCap: LineCapStyle.Round,
          borderOpacity: obj.opacity != null ? obj.opacity : 1,
        });
        break;
      }
      case 'shape': {
        drawShape(page, obj);
        break;
      }
      default: break;
    }
  }

  function drawShape(page, obj) {
    const r = obj.rect;
    const color = hexToRgb01(obj.color || '#e5484d');
    const strokeWidth = obj.strokeWidth || 2;
    const opacity = obj.opacity != null ? obj.opacity : 1;
    if (obj.shapeType === 'rect') {
      page.drawRectangle({
        x: Math.min(r.x1, r.x2), y: Math.min(r.y1, r.y2),
        width: Math.abs(r.x2 - r.x1), height: Math.abs(r.y2 - r.y1),
        borderColor: color, borderWidth: strokeWidth, borderOpacity: opacity,
        color: obj.fill ? hexToRgb01(obj.fill) : undefined,
        opacity: obj.fill ? opacity : undefined,
      });
    } else if (obj.shapeType === 'ellipse') {
      page.drawEllipse({
        x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2,
        xScale: Math.abs(r.x2 - r.x1) / 2, yScale: Math.abs(r.y2 - r.y1) / 2,
        borderColor: color, borderWidth: strokeWidth, borderOpacity: opacity,
        color: obj.fill ? hexToRgb01(obj.fill) : undefined,
        opacity: obj.fill ? opacity : undefined,
      });
    } else if (obj.shapeType === 'line' || obj.shapeType === 'arrow') {
      page.drawLine({
        start: { x: r.x1, y: r.y1 }, end: { x: r.x2, y: r.y2 },
        color, thickness: strokeWidth, lineCap: LineCapStyle.Round, opacity,
      });
      if (obj.shapeType === 'arrow') {
        const angle = Math.atan2(r.y2 - r.y1, r.x2 - r.x1);
        const headLen = 8 + strokeWidth * 3;
        const wing = Math.PI / 7;
        const p1 = { x: r.x2, y: r.y2 };
        const p2 = { x: r.x2 - headLen * Math.cos(angle - wing), y: r.y2 - headLen * Math.sin(angle - wing) };
        const p3 = { x: r.x2 - headLen * Math.cos(angle + wing), y: r.y2 - headLen * Math.sin(angle + wing) };
        const path = svgPathFromPoints([p1, p2, p3]) + ' Z';
        page.drawSvgPath(path, { x: 0, y: 0, color, opacity });
      }
    }
  }

  Export.buildOutputDoc = buildOutputDoc;

  Export.downloadEditedPdf = async function () {
    App.showLoading('Preparing your download…');
    try {
      const outDoc = await buildOutputDoc();
      const bytes = await outDoc.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const base = (State.data.fileName || 'document.pdf').replace(/\.pdf$/i, '');
      a.download = `${base}-edited.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      App.toast('Your PDF is ready — download started');
    } catch (err) {
      console.error(err);
      App.toast('Something went wrong while preparing the PDF', true);
    } finally {
      App.hideLoading();
    }
  };

  Export.downloadSinglePage = async function (pageId) {
    const pd = State.getPageById(pageId);
    if (!pd) return;
    const pageIndex = State.getPageIndex(pageId) + 1;
    App.showLoading('Preparing that page…');
    try {
      const outDoc = await buildOutputDoc(null, [pd]);
      const bytes = await outDoc.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const base = (State.data.fileName || 'document.pdf').replace(/\.pdf$/i, '');
      a.download = `${base}-page-${pageIndex}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      App.toast(`Page ${pageIndex} downloaded`);
    } catch (err) {
      console.error(err);
      App.toast('Could not export that page', true);
    } finally {
      App.hideLoading();
    }
  };

  App.Export = Export;
})(window.App = window.App || {});
