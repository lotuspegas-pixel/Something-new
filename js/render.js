/*
 * Rendering: loads the PDF via pdf.js, draws each page to a <canvas>, builds
 * an invisible text-run layer over the original text (click targets for the
 * "edit text" tool), and (re)builds the object layer from App.State data.
 *
 * The canvas is only ever a picture of the ORIGINAL page. Every edit (text
 * replacement, whiteout, drawing, image, shape, signature) lives in the DOM
 * as an "object" layered on top, driven entirely by App.State.data.objects.
 * This keeps every edit non-destructive and undo-friendly.
 */
(function (App) {
  const Geometry = App.Geometry;

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  const Render = {
    viewports: {},   // pageId -> pdf.js-compatible viewport
    textRuns: {},    // pageId -> [{ x1,y1,x2,y2, str, size, base }]
    pageEls: {},     // pageId -> { wrap, canvas, textLayer, objLayer, drawLayer }
  };

  async function loadPdfFromBytes(bytes) {
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    return loadingTask.promise;
  }
  Render.loadPdfFromBytes = loadPdfFromBytes;

  // Build page descriptors for a freshly loaded pdf.js document.
  async function describeDoc(pdfDoc) {
    const pages = [];
    for (let i = 0; i < pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i + 1);
      const view = page.view; // [x0,y0,x1,y1] unrotated media box
      pages.push({
        width: view[2] - view[0],
        height: view[3] - view[1],
        baseRotation: page.rotate || 0,
      });
    }
    return pages;
  }
  Render.describeDoc = describeDoc;

  async function getProxyForPage(pd) {
    if (pd.kind === 'blank') return null;
    if (pd.kind === 'original') return App.State.data.pdfDoc.getPage(pd.originalIndex + 1);
    if (pd.kind === 'inserted') {
      const src = App.State.data.insertedDocs[pd.sourceDocId];
      return src.pdfDoc.getPage(pd.sourcePageIndex + 1);
    }
    return null;
  }
  Render.getProxyForPage = getProxyForPage;

  function getViewportFor(pd, proxy) {
    const zoom = App.State.data.zoom;
    const totalRotation = ((pd.baseRotation || 0) + (pd.rotation || 0) + 360) % 360;
    if (proxy) {
      return proxy.getViewport({ scale: zoom, rotation: totalRotation });
    }
    return Geometry.createSimpleViewport({
      viewBox: [0, 0, pd.width, pd.height],
      scale: zoom,
      rotation: totalRotation,
      dontFlip: false,
    });
  }
  Render.getViewportFor = getViewportFor;

  // ---- text run extraction (for click-to-edit-existing-text) ----
  async function extractTextRuns(pd, proxy) {
    if (!proxy) return [];
    const tc = await proxy.getTextContent();
    const runs = [];
    for (const item of tc.items) {
      if (!item.str || !item.str.trim()) continue;
      const t = item.transform;
      // Skip rotated/skewed runs (rare) rather than risk a misplaced overlay.
      if (Math.abs(t[1]) > 1e-3 || Math.abs(t[2]) > 1e-3) continue;
      const size = Math.abs(t[3]) || Math.abs(t[0]) || 1;
      const style = tc.styles[item.fontName] || { fontFamily: 'sans-serif', ascent: 0.75, descent: -0.25 };
      const { base, cssFamily } = Geometry.mapFontFamily(style, item.fontName);
      const x1 = t[4];
      const x2 = t[4] + (item.width || 0);
      const yTop = t[5] + size * (style.ascent != null ? style.ascent : 0.75);
      const yBottom = t[5] + size * (style.descent != null ? style.descent : -0.25);
      runs.push({
        str: item.str,
        x1, x2,
        y1: Math.min(yTop, yBottom),
        y2: Math.max(yTop, yBottom),
        baselineX: t[4],
        baselineY: t[5],
        size,
        base,
        cssFamily,
      });
    }
    return runs;
  }
  Render.extractTextRuns = extractTextRuns;

  // ---- full rebuild of the pages container ----
  async function renderAll() {
    const container = document.getElementById('pages-container');
    container.innerHTML = '';
    Render.pageEls = {};
    const pages = App.State.data.pages;
    for (const pd of pages) {
      const wrap = await buildPageDom(pd);
      container.appendChild(wrap);
    }
    refreshObjectLayers();
  }
  Render.renderAll = renderAll;

  async function buildPageDom(pd) {
    const proxy = await getProxyForPage(pd);
    const viewport = getViewportFor(pd, proxy);
    Render.viewports[pd.id] = viewport;

    const wrap = document.createElement('div');
    wrap.className = 'page-wrap';
    wrap.dataset.pageId = pd.id;
    wrap.style.width = viewport.width + 'px';
    wrap.style.height = viewport.height + 'px';

    const canvas = document.createElement('canvas');
    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    wrap.appendChild(canvas);

    if (proxy) {
      const ctx = canvas.getContext('2d');
      const renderTask = proxy.render({
        canvasContext: ctx,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      });
      await renderTask.promise;
    } else {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const textLayer = document.createElement('div');
    textLayer.className = 'text-run-layer';
    textLayer.style.position = 'absolute';
    textLayer.style.top = '0';
    textLayer.style.left = '0';
    wrap.appendChild(textLayer);

    const runs = await extractTextRuns(pd, proxy);
    Render.textRuns[pd.id] = runs;
    runs.forEach((run, idx) => {
      const box = Geometry.pdfRectToViewport(viewport, [run.x1, run.y1, run.x2, run.y2]);
      const span = document.createElement('div');
      span.className = 'text-run';
      span.dataset.runIndex = String(idx);
      span.style.left = box.left + 'px';
      span.style.top = box.top + 'px';
      span.style.width = box.width + 'px';
      span.style.height = box.height + 'px';
      span.style.fontSize = (run.size * viewport.scale) + 'px';
      span.style.fontFamily = run.cssFamily;
      textLayer.appendChild(span);
    });

    const objLayer = document.createElement('div');
    objLayer.className = 'obj-layer';
    objLayer.style.position = 'absolute';
    objLayer.style.top = '0';
    objLayer.style.left = '0';
    wrap.appendChild(objLayer);

    const drawLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    drawLayer.setAttribute('class', 'draw-layer');
    drawLayer.setAttribute('width', String(viewport.width));
    drawLayer.setAttribute('height', String(viewport.height));
    wrap.appendChild(drawLayer);

    const badge = document.createElement('div');
    badge.className = 'page-number-badge';
    wrap.appendChild(badge);

    Render.pageEls[pd.id] = { wrap, canvas, textLayer, objLayer, drawLayer, badge };
    return wrap;
  }
  Render.buildPageDom = buildPageDom;

  function updatePageNumberBadges() {
    App.State.data.pages.forEach((pd, i) => {
      const els = Render.pageEls[pd.id];
      if (els) els.badge.textContent = String(i + 1) + ' / ' + App.State.data.pages.length;
    });
  }
  Render.updatePageNumberBadges = updatePageNumberBadges;

  // ---- object layer (edits) rendering ----
  function colorWithAlpha(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function refreshObjectLayers() {
    App.State.data.pages.forEach((pd) => refreshObjectLayerForPage(pd.id));
    updatePageNumberBadges();
  }
  Render.refreshObjectLayers = refreshObjectLayers;

  function refreshObjectLayerForPage(pageId) {
    const els = Render.pageEls[pageId];
    if (!els) return;
    const viewport = Render.viewports[pageId];
    els.objLayer.innerHTML = '';
    els.drawLayer.innerHTML = '';
    const objects = App.State.objectsForPage(pageId);
    for (const obj of objects) {
      renderOneObject(obj, viewport, els);
    }
    const selected = App.State.data.selectedObjectId;
    if (selected) {
      const node = els.objLayer.querySelector(`[data-obj-id="${selected}"]`);
      if (node) node.classList.add('selected');
    }
  }
  Render.refreshObjectLayerForPage = refreshObjectLayerForPage;

  // Lightweight selection toggle that does not rebuild the DOM (rebuilding
  // would blow away focus/caret inside an actively-edited text box).
  function applySelectionHighlight(selectedId) {
    document.querySelectorAll('.obj-box.selected').forEach((el) => el.classList.remove('selected'));
    if (!selectedId) return;
    const el = document.querySelector(`[data-obj-id="${selectedId}"]`);
    if (el) el.classList.add('selected');
  }
  Render.applySelectionHighlight = applySelectionHighlight;

  function renderOneObject(obj, viewport, els) {
    switch (obj.type) {
      case 'text-edit': return renderTextEdit(obj, viewport, els);
      case 'text-add': return renderTextAdd(obj, viewport, els);
      case 'whiteout': return renderWhiteout(obj, viewport, els);
      case 'highlight': return renderHighlight(obj, viewport, els);
      case 'underline': return renderLineDecoration(obj, viewport, els, 'underline');
      case 'strikethrough': return renderLineDecoration(obj, viewport, els, 'strikethrough');
      case 'image': return renderImage(obj, viewport, els);
      case 'signature': return renderImage(obj, viewport, els);
      case 'draw': return renderDraw(obj, viewport, els);
      case 'shape': return renderShape(obj, viewport, els);
      default: return null;
    }
  }

  function renderWhiteout(obj, viewport, els) {
    const box = Geometry.pdfRectToViewport(viewport, [obj.rect.x1, obj.rect.y1, obj.rect.x2, obj.rect.y2]);
    const div = document.createElement('div');
    div.className = 'obj-box';
    div.dataset.objId = obj.id;
    div.dataset.objType = obj.type;
    div.style.left = box.left + 'px';
    div.style.top = box.top + 'px';
    div.style.width = box.width + 'px';
    div.style.height = box.height + 'px';
    div.style.background = obj.color || '#ffffff';
    addHandles(div);
    els.objLayer.appendChild(div);
    return div;
  }

  function renderTextEdit(obj, viewport, els) {
    // white (or sampled) cover for the original glyphs
    const coverBox = Geometry.pdfRectToViewport(viewport, [obj.coverRect.x1, obj.coverRect.y1, obj.coverRect.x2, obj.coverRect.y2]);
    const cover = document.createElement('div');
    cover.className = 'obj-box text-edit-cover';
    cover.style.left = coverBox.left + 'px';
    cover.style.top = coverBox.top + 'px';
    cover.style.width = coverBox.width + 'px';
    cover.style.height = (coverBox.height + 2) + 'px';
    cover.style.background = obj.coverColor || '#ffffff';
    cover.style.pointerEvents = 'none';
    els.objLayer.appendChild(cover);

    const div = document.createElement('div');
    div.className = 'obj-box text-edit-box-wrap';
    div.dataset.objId = obj.id;
    div.dataset.objType = obj.type;
    div.style.left = coverBox.left + 'px';
    div.style.top = coverBox.top + 'px';
    div.style.width = Math.max(coverBox.width, 20) + 'px';
    div.style.height = coverBox.height + 'px';

    const textEl = document.createElement('div');
    textEl.className = 'text-content';
    textEl.contentEditable = 'true';
    textEl.textContent = obj.text;
    textEl.style.fontSize = (obj.size * viewport.scale) + 'px';
    textEl.style.lineHeight = (obj.size * viewport.scale) + 'px';
    textEl.style.fontFamily = Geometry.cssFamilyForBase(obj.base);
    textEl.style.fontWeight = obj.bold ? '700' : '400';
    textEl.style.fontStyle = obj.italic ? 'italic' : 'normal';
    textEl.style.color = obj.color || '#14161a';
    textEl.style.whiteSpace = 'pre';
    div.appendChild(textEl);
    addHandles(div, false);
    els.objLayer.appendChild(div);
    return div;
  }

  function renderTextAdd(obj, viewport, els) {
    const box = Geometry.pdfRectToViewport(viewport, [obj.rect.x1, obj.rect.y1, obj.rect.x2, obj.rect.y2]);
    const div = document.createElement('div');
    div.className = 'obj-box';
    div.dataset.objId = obj.id;
    div.dataset.objType = obj.type;
    div.style.left = box.left + 'px';
    div.style.top = box.top + 'px';
    div.style.width = box.width + 'px';
    div.style.height = box.height + 'px';

    const textEl = document.createElement('div');
    textEl.className = 'text-content';
    textEl.contentEditable = obj.editing ? 'true' : 'false';
    textEl.textContent = obj.text;
    textEl.style.fontSize = (obj.size * viewport.scale) + 'px';
    textEl.style.lineHeight = 1.2;
    textEl.style.fontFamily = Geometry.cssFamilyForBase(obj.base);
    textEl.style.fontWeight = obj.bold ? '700' : '400';
    textEl.style.fontStyle = obj.italic ? 'italic' : 'normal';
    textEl.style.color = obj.color || '#14161a';
    div.appendChild(textEl);
    addHandles(div);
    els.objLayer.appendChild(div);
    return div;
  }

  function renderImage(obj, viewport, els) {
    const box = Geometry.pdfRectToViewport(viewport, [obj.rect.x1, obj.rect.y1, obj.rect.x2, obj.rect.y2]);
    const div = document.createElement('div');
    div.className = 'obj-box';
    div.dataset.objId = obj.id;
    div.dataset.objType = obj.type;
    div.style.left = box.left + 'px';
    div.style.top = box.top + 'px';
    div.style.width = box.width + 'px';
    div.style.height = box.height + 'px';
    const img = document.createElement('img');
    img.src = obj.dataUrl;
    img.draggable = false;
    div.appendChild(img);
    addHandles(div);
    els.objLayer.appendChild(div);
    return div;
  }

  function renderHighlight(obj, viewport, els) {
    const box = Geometry.pdfRectToViewport(viewport, [obj.rect.x1, obj.rect.y1, obj.rect.x2, obj.rect.y2]);
    const div = document.createElement('div');
    div.className = 'obj-box';
    div.dataset.objId = obj.id;
    div.dataset.objType = obj.type;
    div.style.left = box.left + 'px';
    div.style.top = box.top + 'px';
    div.style.width = box.width + 'px';
    div.style.height = box.height + 'px';
    div.style.background = colorWithAlpha(obj.color || '#ffe066', 0.45);
    div.style.mixBlendMode = 'multiply';
    addHandles(div);
    els.objLayer.appendChild(div);
    return div;
  }

  function renderLineDecoration(obj, viewport, els, kind) {
    const box = Geometry.pdfRectToViewport(viewport, [obj.rect.x1, obj.rect.y1, obj.rect.x2, obj.rect.y2]);
    const div = document.createElement('div');
    div.className = 'obj-box';
    div.dataset.objId = obj.id;
    div.dataset.objType = obj.type;
    div.style.left = box.left + 'px';
    div.style.top = box.top + 'px';
    div.style.width = box.width + 'px';
    div.style.height = box.height + 'px';
    const line = document.createElement('div');
    line.style.position = 'absolute';
    line.style.left = '0';
    line.style.right = '0';
    line.style.height = Math.max(1.5, box.height * 0.06) + 'px';
    line.style.background = obj.color || '#e5484d';
    line.style.top = kind === 'underline' ? (box.height - 2) + 'px' : (box.height / 2) + 'px';
    div.appendChild(line);
    addHandles(div);
    els.objLayer.appendChild(div);
    return div;
  }

  function renderDraw(obj, viewport, els) {
    const pts = obj.points.map((p) => {
      const vp = viewport.convertToViewportPoint(p.x, p.y);
      return vp;
    });
    if (pts.length < 2) return null;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]} ${pts[i][1]}`;
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', obj.color || '#e5484d');
    path.setAttribute('stroke-width', String((obj.strokeWidth || 3) * viewport.scale));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.dataset.objId = obj.id;
    path.dataset.objType = obj.type;
    path.style.pointerEvents = 'stroke';
    els.drawLayer.appendChild(path);
    return path;
  }

  function renderShape(obj, viewport, els) {
    const p1 = viewport.convertToViewportPoint(obj.rect.x1, obj.rect.y1);
    const p2 = viewport.convertToViewportPoint(obj.rect.x2, obj.rect.y2);
    const left = Math.min(p1[0], p2[0]);
    const top = Math.min(p1[1], p2[1]);
    const w = Math.abs(p2[0] - p1[0]);
    const h = Math.abs(p2[1] - p1[1]);
    const ns = 'http://www.w3.org/2000/svg';
    let el;
    const strokeW = (obj.strokeWidth || 2) * viewport.scale;
    if (obj.shapeType === 'rect') {
      el = document.createElementNS(ns, 'rect');
      el.setAttribute('x', left); el.setAttribute('y', top);
      el.setAttribute('width', w); el.setAttribute('height', h);
    } else if (obj.shapeType === 'ellipse') {
      el = document.createElementNS(ns, 'ellipse');
      el.setAttribute('cx', left + w / 2); el.setAttribute('cy', top + h / 2);
      el.setAttribute('rx', w / 2); el.setAttribute('ry', h / 2);
    } else if (obj.shapeType === 'line' || obj.shapeType === 'arrow') {
      el = document.createElementNS(ns, 'line');
      el.setAttribute('x1', p1[0]); el.setAttribute('y1', p1[1]);
      el.setAttribute('x2', p2[0]); el.setAttribute('y2', p2[1]);
      if (obj.shapeType === 'arrow') {
        const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
        const headLen = 10 + strokeW * 2;
        const wing = Math.PI / 7;
        const hx1 = p2[0] - headLen * Math.cos(angle - wing);
        const hy1 = p2[1] - headLen * Math.sin(angle - wing);
        const hx2 = p2[0] - headLen * Math.cos(angle + wing);
        const hy2 = p2[1] - headLen * Math.sin(angle + wing);
        const head = document.createElementNS(ns, 'polygon');
        head.setAttribute('points', `${p2[0]},${p2[1]} ${hx1},${hy1} ${hx2},${hy2}`);
        head.setAttribute('fill', obj.color || '#e5484d');
        head.dataset.objId = obj.id;
        els.drawLayer.appendChild(head);
      }
    }
    if (!el) return null;
    el.setAttribute('stroke', obj.color || '#e5484d');
    el.setAttribute('stroke-width', String(strokeW));
    el.setAttribute('fill', obj.fill || 'none');
    el.dataset.objId = obj.id;
    el.dataset.objType = obj.type;
    el.style.pointerEvents = obj.fill ? 'all' : 'stroke';
    els.drawLayer.appendChild(el);
    return el;
  }

  function addHandles(div, resizable) {
    if (resizable === undefined) resizable = true;
    const del = document.createElement('div');
    del.className = 'obj-delete-handle';
    del.textContent = '✕';
    del.dataset.role = 'delete-handle';
    div.appendChild(del);
    if (resizable) {
      const rh = document.createElement('div');
      rh.className = 'resize-handle';
      rh.dataset.role = 'resize-handle';
      div.appendChild(rh);
    }
  }

  // ---- thumbnails ----
  async function thumbnailDataUrl(pd, maxWidth) {
    maxWidth = maxWidth || 150;
    const proxy = await getProxyForPage(pd);
    const totalRotation = ((pd.baseRotation || 0) + (pd.rotation || 0) + 360) % 360;
    const baseViewport = proxy
      ? proxy.getViewport({ scale: 1, rotation: totalRotation })
      : Geometry.createSimpleViewport({ viewBox: [0, 0, pd.width, pd.height], scale: 1, rotation: totalRotation });
    const scale = maxWidth / baseViewport.width;
    const viewport = proxy
      ? proxy.getViewport({ scale, rotation: totalRotation })
      : Geometry.createSimpleViewport({ viewBox: [0, 0, pd.width, pd.height], scale, rotation: totalRotation });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (proxy) {
      await proxy.render({ canvasContext: ctx, viewport }).promise;
    }
    return canvas.toDataURL('image/png');
  }
  Render.thumbnailDataUrl = thumbnailDataUrl;

  App.Render = Render;
})(window.App = window.App || {});
