/*
 * Tool interactions: everything that happens when the user clicks or drags
 * on the page canvas — editing existing text, adding text/images, drawing,
 * highlighting, shapes, whiteout and signatures. Reads/writes App.State and
 * asks App.Render to reflect the result.
 */
(function (App) {
  const State = App.State;
  const Render = App.Render;
  const Geometry = App.Geometry;

  const Tools = {};
  const ONE_SHOT_TOOLS = new Set([
    'add-text', 'add-image', 'highlight', 'underline', 'strikethrough',
    'shape-rect', 'shape-ellipse', 'shape-line', 'shape-arrow', 'whiteout',
  ]);

  let container;
  let dragState = null; // active pointer interaction
  let pendingImagePlacement = null;

  function pageWrapFromEl(el) { return el.closest ? el.closest('.page-wrap') : null; }

  function pdfPointFromClient(pageWrap, viewport, clientX, clientY) {
    const rect = pageWrap.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return Geometry.viewportPointToPdf(viewport, x, y);
  }

  function normRect(x1, y1, x2, y2) {
    return { x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) };
  }

  function revertToolIfOneShot() {
    if (ONE_SHOT_TOOLS.has(State.data.tool)) {
      App.setTool('select');
    }
  }

  function samplePageColor(canvas, viewportX, viewportY) {
    try {
      const scale = canvas.width / canvas.clientWidth;
      const ctx = canvas.getContext('2d');
      const px = Math.max(0, Math.min(canvas.width - 1, Math.round(viewportX * scale)));
      const py = Math.max(0, Math.min(canvas.height - 1, Math.round(viewportY * scale)));
      const data = ctx.getImageData(px, py, 1, 1).data;
      return '#' + [data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return '#ffffff';
    }
  }

  // ---------------------------------------------------------------
  // Click-to-edit existing text
  // ---------------------------------------------------------------
  function handleTextRunClick(runSpan, pageWrap) {
    const pageId = pageWrap.dataset.pageId;
    const runIndex = Number(runSpan.dataset.runIndex);
    const run = (Render.textRuns[pageId] || [])[runIndex];
    if (!run) return;
    const runKey = pageId + ':' + runIndex;

    const existing = State.data.objects.find((o) => o.type === 'text-edit' && o.sourceRunKey === runKey);
    if (existing) {
      focusTextEditObject(existing.id);
      return;
    }

    const viewport = Render.viewports[pageId];
    const els = Render.pageEls[pageId];
    const coverBox = Geometry.pdfRectToViewport(viewport, [run.x1, run.y1, run.x2, run.y2]);
    const coverColor = samplePageColor(els.canvas, coverBox.left - 1, coverBox.top + coverBox.height / 2);

    const obj = {
      type: 'text-edit',
      page: pageId,
      sourceRunKey: runKey,
      coverRect: { x1: run.x1, y1: run.y1, x2: run.x2, y2: run.y2 },
      baseline: { x: run.baselineX, y: run.baselineY },
      coverColor,
      text: run.str,
      base: run.base,
      bold: false,
      italic: false,
      size: run.size,
      color: '#14161a',
    };
    State.mutate(() => State.addObject(obj));
    State.commit();
    focusTextEditObject(obj.id);
  }

  function focusTextEditObject(id) {
    State.setSelected(id);
    focusObjectText(id);
  }

  function focusObjectText(id) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-obj-id="${id}"] .text-content`);
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }

  function enterTextAddEditMode(objId) {
    State.mutate(() => State.updateObject(objId, { editing: true }));
    State.commit();
    focusObjectText(objId);
  }

  // ---------------------------------------------------------------
  // Generic rect-drag creation (highlight/underline/strike/whiteout/shapes/add-text)
  // ---------------------------------------------------------------
  function beginRectDrag(e, pageWrap, viewport, kind) {
    const rect = pageWrap.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    const els = Render.pageEls[pageWrap.dataset.pageId];

    let previewEl;
    if (kind === 'shape-line' || kind === 'shape-arrow') {
      previewEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      previewEl.setAttribute('stroke', State.data.activeColor);
      previewEl.setAttribute('stroke-width', String(State.data.strokeWidth));
      previewEl.setAttribute('stroke-dasharray', '4 3');
      els.drawLayer.appendChild(previewEl);
    } else {
      previewEl = document.createElement('div');
      previewEl.style.position = 'absolute';
      previewEl.style.border = '1.5px dashed ' + (State.data.activeColor || '#3b5bfd');
      previewEl.style.background = kind === 'whiteout' ? 'rgba(255,255,255,0.6)'
        : kind === 'highlight' ? 'rgba(255,224,102,0.35)' : 'transparent';
      previewEl.style.pointerEvents = 'none';
      els.objLayer.appendChild(previewEl);
    }

    dragState = {
      kind: 'rect-create', tool: kind, pageWrap, viewport, els, startX, startY, previewEl,
      lastX: startX, lastY: startY,
    };
    updateRectPreview();
  }

  function updateRectPreview() {
    const d = dragState;
    if (!d) return;
    const x1 = Math.min(d.startX, d.lastX), x2 = Math.max(d.startX, d.lastX);
    const y1 = Math.min(d.startY, d.lastY), y2 = Math.max(d.startY, d.lastY);
    if (d.tool === 'shape-line' || d.tool === 'shape-arrow') {
      d.previewEl.setAttribute('x1', d.startX); d.previewEl.setAttribute('y1', d.startY);
      d.previewEl.setAttribute('x2', d.lastX); d.previewEl.setAttribute('y2', d.lastY);
    } else {
      d.previewEl.style.left = x1 + 'px';
      d.previewEl.style.top = y1 + 'px';
      d.previewEl.style.width = Math.max(2, x2 - x1) + 'px';
      d.previewEl.style.height = Math.max(2, y2 - y1) + 'px';
    }
  }

  function finishRectDrag() {
    const d = dragState;
    dragState = null;
    if (!d) return;
    d.previewEl.remove();
    const pageId = d.pageWrap.dataset.pageId;
    let x1 = d.startX, y1 = d.startY, x2 = d.lastX, y2 = d.lastY;
    const isPoint = Math.abs(x2 - x1) < 4 && Math.abs(y2 - y1) < 4;

    if (d.tool === 'add-text') {
      if (isPoint) { x2 = x1 + 180; y2 = y1 + State.data.fontSize * 1.5; }
      createTextAddObject(pageId, d.viewport, x1, y1, x2, y2);
    } else if (d.tool === 'whiteout') {
      if (isPoint) return;
      const r = Geometry.viewportRectToPdf(d.viewport, Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      let created;
      State.mutate(() => { created = State.addObject({ type: 'whiteout', page: pageId, rect: r, color: '#ffffff' }); });
      State.commit();
      State.setSelected(created.id);
    } else if (d.tool === 'highlight' || d.tool === 'underline' || d.tool === 'strikethrough') {
      if (isPoint) return;
      const r = Geometry.viewportRectToPdf(d.viewport, Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      let created;
      State.mutate(() => {
        created = State.addObject({
          type: d.tool, page: pageId, rect: r,
          color: d.tool === 'highlight' ? State.data.highlightColor : State.data.activeColor,
          opacity: d.tool === 'highlight' ? State.data.highlightOpacity : 1,
        });
      });
      State.commit();
      State.setSelected(created.id);
    } else if (d.tool.startsWith('shape-')) {
      const shapeType = d.tool.replace('shape-', '');
      let r;
      if (shapeType === 'line' || shapeType === 'arrow') {
        if (isPoint) return;
        const p1 = Geometry.viewportPointToPdf(d.viewport, x1, y1);
        const p2 = Geometry.viewportPointToPdf(d.viewport, x2, y2);
        r = { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      } else {
        if (isPoint) { x2 = x1 + 120; y2 = y1 + 90; }
        r = Geometry.viewportRectToPdf(d.viewport, Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      }
      let created;
      State.mutate(() => {
        created = State.addObject({
          type: 'shape', shapeType, page: pageId, rect: r,
          color: State.data.activeColor, strokeWidth: State.data.strokeWidth, fill: null,
          opacity: State.data.shapeOpacity,
        });
      });
      State.commit();
      State.setSelected(created.id);
    }
    revertToolIfOneShot();
  }

  function createTextAddObject(pageId, viewport, x1, y1, x2, y2) {
    const r = Geometry.viewportRectToPdf(viewport, Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    const obj = {
      type: 'text-add', page: pageId, rect: r, text: 'Type here…',
      base: State.data.fontChoice, bold: false, italic: false,
      size: State.data.fontSize, color: State.data.textColor, editing: true,
    };
    State.mutate(() => State.addObject(obj));
    State.commit();
    State.setSelected(obj.id);
    revertToolIfOneShot();
    focusObjectText(obj.id);
  }

  // ---------------------------------------------------------------
  // Freehand drawing
  // ---------------------------------------------------------------
  function beginFreehand(e, pageWrap, viewport) {
    const rect = pageWrap.getBoundingClientRect();
    const els = Render.pageEls[pageWrap.dataset.pageId];
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', State.data.activeColor);
    path.setAttribute('stroke-width', String(State.data.strokeWidth * viewport.scale));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    els.drawLayer.appendChild(path);
    dragState = {
      kind: 'freehand', pageWrap, viewport, els, path,
      screenPts: [[e.clientX - rect.left, e.clientY - rect.top]],
    };
    updateFreehandPath();
  }

  function updateFreehandPath() {
    const d = dragState;
    if (!d || d.kind !== 'freehand') return;
    let dAttr = `M ${d.screenPts[0][0]} ${d.screenPts[0][1]}`;
    for (let i = 1; i < d.screenPts.length; i++) dAttr += ` L ${d.screenPts[i][0]} ${d.screenPts[i][1]}`;
    d.path.setAttribute('d', dAttr);
  }

  function finishFreehand() {
    const d = dragState;
    dragState = null;
    if (!d || d.screenPts.length < 2) { if (d) d.path.remove(); return; }
    const pageId = d.pageWrap.dataset.pageId;
    const points = d.screenPts.map(([x, y]) => Geometry.viewportPointToPdf(d.viewport, x, y));
    d.path.remove();
    let created;
    State.mutate(() => {
      created = State.addObject({
        type: 'draw', page: pageId, points, color: State.data.activeColor, strokeWidth: State.data.strokeWidth,
        opacity: State.data.shapeOpacity,
      });
    });
    State.commit();
    State.setSelected(created.id);
  }

  // ---------------------------------------------------------------
  // Add image
  // ---------------------------------------------------------------
  function triggerAddImage(pageWrap, viewport, clientX, clientY) {
    const pdfPoint = pdfPointFromClient(pageWrap, viewport, clientX, clientY);
    pendingImagePlacement = { pageId: pageWrap.dataset.pageId, pdfPoint };
    document.getElementById('add-image-input').click();
  }

  function handleImageFile(file) {
    if (!pendingImagePlacement) return;
    const placement = pendingImagePlacement;
    pendingImagePlacement = null;
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        // Normalize to PNG so export (pdf-lib only embeds PNG/JPEG) never fails
        // regardless of the source format (gif/webp/bmp/etc).
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');

        const targetWidthPt = 150;
        const targetHeightPt = targetWidthPt * (img.height / img.width);
        const x1 = placement.pdfPoint.x;
        const y1 = placement.pdfPoint.y - targetHeightPt;
        const obj = {
          type: 'image', page: placement.pageId,
          rect: { x1, y1, x2: x1 + targetWidthPt, y2: y1 + targetHeightPt },
          dataUrl, mime: 'image/png',
        };
        State.mutate(() => State.addObject(obj));
        State.commit();
        State.setSelected(obj.id);
        App.setTool('select');
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  }

  // ---------------------------------------------------------------
  // Object selection / move / resize / delete
  // ---------------------------------------------------------------
  function rectFieldName(obj) { return obj.type === 'text-edit' ? 'coverRect' : 'rect'; }

  function beginMove(e, box, objId) {
    const obj = State.data.objects.find((o) => o.id === objId);
    if (!obj) return;
    const pageWrap = pageWrapFromEl(box);
    const viewport = Render.viewports[pageWrap.dataset.pageId];
    dragState = {
      kind: 'move', box, objId, viewport, pageWrap,
      startClientX: e.clientX, startClientY: e.clientY,
      startLeft: parseFloat(box.style.left), startTop: parseFloat(box.style.top),
    };
  }

  function beginResize(e, box, objId) {
    const obj = State.data.objects.find((o) => o.id === objId);
    if (!obj) return;
    const pageWrap = pageWrapFromEl(box);
    const viewport = Render.viewports[pageWrap.dataset.pageId];
    dragState = {
      kind: 'resize', box, objId, viewport, pageWrap,
      startClientX: e.clientX, startClientY: e.clientY,
      startWidth: parseFloat(box.style.width), startHeight: parseFloat(box.style.height),
      startLeft: parseFloat(box.style.left), startTop: parseFloat(box.style.top),
    };
  }

  function applyMoveResizeToState() {
    const d = dragState;
    if (!d) return;
    const obj = State.data.objects.find((o) => o.id === d.objId);
    if (!obj) return;
    const left = parseFloat(d.box.style.left);
    const top = parseFloat(d.box.style.top);
    const width = parseFloat(d.box.style.width);
    const height = parseFloat(d.box.style.height);
    const field = rectFieldName(obj);
    if (obj.type === 'draw') return;
    if (obj.type === 'shape' && (obj.shapeType === 'line' || obj.shapeType === 'arrow')) return;
    const r = Geometry.viewportRectToPdf(d.viewport, left, top, width, height);
    State.mutate(() => State.updateObject(obj.id, { [field]: r }));
    State.commit();
  }

  function deleteObject(objId) {
    State.mutate(() => State.removeObject(objId));
    State.commit();
  }

  // Shifts an object's stored PDF-space geometry by (dx, dy) points. Works
  // uniformly across box-based, point-based (ink) and line-based (shape)
  // objects, so keyboard nudging and duplication apply to every type —
  // including SVG shapes/ink strokes that mouse-drag doesn't support.
  function translateObject(obj, dx, dy) {
    if (obj.type === 'draw') {
      obj.points = obj.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else if (obj.type === 'text-edit') {
      obj.coverRect.x1 += dx; obj.coverRect.x2 += dx;
      obj.coverRect.y1 += dy; obj.coverRect.y2 += dy;
      obj.baseline.x += dx; obj.baseline.y += dy;
    } else if (obj.rect) {
      obj.rect.x1 += dx; obj.rect.x2 += dx;
      obj.rect.y1 += dy; obj.rect.y2 += dy;
    }
  }

  function duplicateSelectedObject() {
    const id = State.data.selectedObjectId;
    const obj = State.data.objects.find((o) => o.id === id);
    if (!obj) return;
    const clone = JSON.parse(JSON.stringify(obj));
    clone.id = Geometry.uid();
    delete clone.sourceRunKey; // don't let it shadow the original text run
    translateObject(clone, 14, -14);
    State.mutate(() => State.addObject(clone));
    State.commit();
    State.setSelected(clone.id);
    App.toast('Duplicated');
  }

  // ---------------------------------------------------------------
  // Signature
  // ---------------------------------------------------------------
  let sigCtx, sigDrawing = false, sigHasStrokes = false;

  function initSignaturePad() {
    const canvas = document.getElementById('signature-canvas');
    sigCtx = canvas.getContext('2d');
    sigCtx.lineWidth = 2.5;
    sigCtx.lineCap = 'round';
    sigCtx.strokeStyle = '#14161a';

    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return [cx * scaleX, cy * scaleY];
    }
    function start(e) { sigDrawing = true; sigHasStrokes = true; const [x, y] = pos(e); sigCtx.beginPath(); sigCtx.moveTo(x, y); e.preventDefault(); }
    function move(e) { if (!sigDrawing) return; const [x, y] = pos(e); sigCtx.lineTo(x, y); sigCtx.stroke(); e.preventDefault(); }
    function end() { sigDrawing = false; }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    document.getElementById('signature-clear-btn').addEventListener('click', () => {
      sigCtx.clearRect(0, 0, canvas.width, canvas.height);
      sigHasStrokes = false;
    });

    document.getElementById('signature-type-input').addEventListener('input', (e) => {
      document.getElementById('signature-type-preview').textContent = e.target.value || 'Your Name';
    });
  }

  function currentSignatureDataUrl() {
    const activeTab = document.querySelector('.modal-tab.active').dataset.sigTab;
    if (activeTab === 'draw') {
      if (!sigHasStrokes) return null;
      return document.getElementById('signature-canvas').toDataURL('image/png');
    }
    const text = document.getElementById('signature-type-input').value.trim();
    if (!text) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 700; canvas.height = 220;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#14161a';
    ctx.font = "76px 'Segoe Script','Brush Script MT',cursive";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL('image/png');
  }

  function insertSignature() {
    const dataUrl = currentSignatureDataUrl();
    if (!dataUrl) { App.toast('Draw or type your signature first', true); return; }
    const pageId = App.getCurrentVisiblePageId();
    if (!pageId) return;
    const viewport = Render.viewports[pageId];
    const widthPt = 160;
    const heightPt = widthPt * (220 / 700);
    const x1 = 60, y1 = 60;
    const obj = {
      type: 'signature', page: pageId,
      rect: { x1, y1, x2: x1 + widthPt, y2: y1 + heightPt },
      dataUrl,
    };
    State.mutate(() => State.addObject(obj));
    State.commit();
    State.setSelected(obj.id);
    closeSignatureModal();
    App.setTool('select');
  }

  function openSignatureModal() {
    document.getElementById('signature-modal').classList.remove('hidden');
  }
  function closeSignatureModal() {
    document.getElementById('signature-modal').classList.add('hidden');
  }

  Tools.openSignatureModal = openSignatureModal;
  Tools.closeSignatureModal = closeSignatureModal;
  Tools.insertSignature = insertSignature;
  Tools.initSignaturePad = initSignaturePad;
  Tools.handleImageFile = handleImageFile;
  Tools.deleteObject = deleteObject;

  // ---------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------
  function init() {
    container = document.getElementById('pages-container');

    container.addEventListener('mousedown', (e) => {
      const tool = State.data.tool;

      const deleteHandle = e.target.closest('[data-role="delete-handle"]');
      if (deleteHandle) {
        const box = e.target.closest('[data-obj-id]');
        e.preventDefault();
        deleteObject(box.dataset.objId);
        return;
      }
      const resizeHandle = e.target.closest('[data-role="resize-handle"]');
      if (resizeHandle && tool === 'select') {
        const box = e.target.closest('[data-obj-id]');
        e.preventDefault();
        State.setSelected(box.dataset.objId);
        beginResize(e, box, box.dataset.objId);
        return;
      }
      const objBox = e.target.closest('[data-obj-id]');
      if (objBox && tool === 'select') {
        if (e.target.isContentEditable) {
          // actively editable text: let the browser place the caret natively
          State.setSelected(objBox.dataset.objId);
          return;
        }
        State.setSelected(objBox.dataset.objId);
        // Only plain HTML boxes (text/image/highlight/whiteout/signature) support
        // drag-move here; SVG shapes/ink strokes use raw path coordinates and are
        // repositioned by deleting and redrawing instead.
        if (objBox.tagName === 'DIV') {
          e.preventDefault();
          beginMove(e, objBox, objBox.dataset.objId);
        }
        return;
      }

      const pageWrap = pageWrapFromEl(e.target);
      if (!pageWrap) return;
      const viewport = Render.viewports[pageWrap.dataset.pageId];

      if (tool === 'select') {
        const runSpan = e.target.closest('.text-run');
        if (runSpan) { handleTextRunClick(runSpan, pageWrap); return; }
        State.setSelected(null);
        return;
      }
      if (tool === 'draw') { beginFreehand(e, pageWrap, viewport); return; }
      if (tool === 'add-image') { triggerAddImage(pageWrap, viewport, e.clientX, e.clientY); return; }
      if (tool === 'sign') { openSignatureModal(); return; }
      // rect-drag family
      beginRectDrag(e, pageWrap, viewport, tool);
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragState) return;
      if (dragState.kind === 'rect-create') {
        const rect = dragState.pageWrap.getBoundingClientRect();
        dragState.lastX = Geometry.clamp(e.clientX - rect.left, 0, rect.width);
        dragState.lastY = Geometry.clamp(e.clientY - rect.top, 0, rect.height);
        updateRectPreview();
      } else if (dragState.kind === 'freehand') {
        const rect = dragState.pageWrap.getBoundingClientRect();
        dragState.screenPts.push([e.clientX - rect.left, e.clientY - rect.top]);
        updateFreehandPath();
      } else if (dragState.kind === 'move') {
        const dx = e.clientX - dragState.startClientX;
        const dy = e.clientY - dragState.startClientY;
        dragState.box.style.left = (dragState.startLeft + dx) + 'px';
        dragState.box.style.top = (dragState.startTop + dy) + 'px';
      } else if (dragState.kind === 'resize') {
        const dx = e.clientX - dragState.startClientX;
        const dy = e.clientY - dragState.startClientY;
        dragState.box.style.width = Math.max(10, dragState.startWidth + dx) + 'px';
        dragState.box.style.height = Math.max(10, dragState.startHeight + dy) + 'px';
      }
    });

    window.addEventListener('mouseup', () => {
      if (!dragState) return;
      if (dragState.kind === 'rect-create') finishRectDrag();
      else if (dragState.kind === 'freehand') finishFreehand();
      else if (dragState.kind === 'move' || dragState.kind === 'resize') applyMoveResizeToState();
      dragState = null;
    });

    document.getElementById('add-image-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleImageFile(file);
      e.target.value = '';
    });

    // commit text-edit / text-add edits on blur
    container.addEventListener('focusout', (e) => {
      const contentEl = e.target.closest('.text-content');
      if (!contentEl) return;
      const box = contentEl.closest('[data-obj-id]');
      if (!box) return;
      const objId = box.dataset.objId;
      const obj = State.data.objects.find((o) => o.id === objId);
      if (!obj) return;
      const newText = contentEl.textContent;
      if (obj.type === 'text-add') {
        State.mutate(() => State.updateObject(objId, { text: newText, editing: false }));
      } else {
        State.mutate(() => State.updateObject(objId, { text: newText }));
      }
      State.commit();
    });

    container.addEventListener('dblclick', (e) => {
      if (State.data.tool !== 'select') return;
      const box = e.target.closest('[data-obj-id]');
      if (!box) return;
      const obj = State.data.objects.find((o) => o.id === box.dataset.objId);
      if (obj && obj.type === 'text-add' && !e.target.isContentEditable) {
        enterTextAddEditMode(obj.id);
      }
    });

    container.addEventListener('keydown', (e) => {
      const contentEl = e.target.closest && e.target.closest('.text-content');
      if (!contentEl) return;
      if (e.key === 'Enter' && !e.shiftKey && contentEl.closest('.text-edit-box-wrap')) {
        e.preventDefault();
        contentEl.blur();
      } else if (e.key === 'Escape') {
        contentEl.blur();
      }
    });

    const NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    document.addEventListener('keydown', (e) => {
      const isEditing = document.activeElement && document.activeElement.isContentEditable;
      if (isEditing) return;
      if (!State.data.selectedObjectId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteObject(State.data.selectedObjectId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelectedObject();
      } else if (NUDGE[e.key]) {
        e.preventDefault();
        const [dx, dy] = NUDGE[e.key];
        const step = e.shiftKey ? 10 : 1;
        const obj = State.data.objects.find((o) => o.id === State.data.selectedObjectId);
        if (obj) {
          State.mutate(() => translateObject(obj, dx * step, dy * step));
          State.commit();
        }
      }
    });
  }

  Tools.init = init;
  App.Tools = Tools;
})(window.App = window.App || {});
