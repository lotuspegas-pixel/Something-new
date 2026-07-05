/*
 * App bootstrap: file upload, toolbar wiring, zoom, undo/redo, properties
 * bar, toasts, loading overlay, signature modal glue.
 */
(function (App) {
  const State = App.State;
  const Render = App.Render;
  const Pages = App.Pages;
  const Tools = App.Tools;
  const Geometry = App.Geometry;

  const COLORS = ['#14161a', '#e5484d', '#e8590c', '#f2b705', '#2f9e44', '#3b5bfd', '#7048e8', '#ffffff'];

  // ---------------- toast / loading ----------------
  App.toast = function (message, isError) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' toast-error' : '');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  };
  App.showLoading = function (text) {
    document.getElementById('loading-text').textContent = text || 'Loading…';
    document.getElementById('loading-overlay').classList.remove('hidden');
  };
  App.hideLoading = function () {
    document.getElementById('loading-overlay').classList.add('hidden');
  };

  App.getCurrentVisiblePageId = function () {
    const area = document.getElementById('canvas-area');
    const wraps = Array.from(document.querySelectorAll('.page-wrap'));
    if (!wraps.length) return null;
    const areaRect = area.getBoundingClientRect();
    const centerY = areaRect.top + areaRect.height / 2;
    let best = wraps[0], bestDist = Infinity;
    for (const w of wraps) {
      const r = w.getBoundingClientRect();
      const dist = Math.abs((r.top + r.height / 2) - centerY);
      if (dist < bestDist) { bestDist = dist; best = w; }
    }
    return best.dataset.pageId;
  };

  // ---------------- tool switching ----------------
  App.setTool = function (tool) {
    State.data.tool = tool;
    document.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    document.querySelectorAll('.draw-layer').forEach((svg) => {
      svg.classList.toggle('tool-active', ['draw'].includes(tool));
    });
    document.getElementById('shapes-menu').classList.remove('open');
    document.getElementById('add-page-menu').classList.remove('open');
    if (tool !== 'select') State.setSelected(null);
    renderPropertiesBar();
  };

  function wireToolbar() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => App.setTool(btn.dataset.tool));
    });
    document.getElementById('shapes-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('shapes-menu').classList.toggle('open');
    });
    document.addEventListener('click', () => {
      document.getElementById('shapes-menu').classList.remove('open');
      document.getElementById('add-page-menu').classList.remove('open');
    });
    document.getElementById('shapes-menu').addEventListener('click', (e) => e.stopPropagation());
    document.getElementById('add-page-menu').addEventListener('click', (e) => e.stopPropagation());

    document.getElementById('undo-btn').addEventListener('click', () => State.undo());
    document.getElementById('redo-btn').addEventListener('click', () => State.redo());
    document.getElementById('download-btn').addEventListener('click', () => App.Export.downloadEditedPdf());

    document.getElementById('zoom-in-btn').addEventListener('click', () => setZoom(State.data.zoom + 0.1));
    document.getElementById('zoom-out-btn').addEventListener('click', () => setZoom(State.data.zoom - 0.1));

    document.getElementById('new-file-btn').addEventListener('click', () => {
      if (State.data.pdfDoc && !confirm('Open a different PDF? Any unsaved edits to the current one will be lost.')) return;
      showHero();
    });

    document.getElementById('add-page-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('add-page-menu').classList.toggle('open');
    });
    document.querySelectorAll('#add-page-menu [data-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('add-page-menu').classList.remove('open');
        Pages.addBlankPage(btn.dataset.size);
      });
    });
    document.getElementById('insert-pdf-btn').addEventListener('click', () => document.getElementById('insert-pdf-input').click());
    document.getElementById('insert-pdf-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) Pages.insertPdfFile(file);
      e.target.value = '';
    });

    document.getElementById('zoom-fit-btn').addEventListener('click', fitWidth);

    document.getElementById('shortcuts-btn').addEventListener('click', () => document.getElementById('shortcuts-modal').classList.remove('hidden'));
    document.getElementById('shortcuts-close-btn').addEventListener('click', () => document.getElementById('shortcuts-modal').classList.add('hidden'));
    document.getElementById('shortcuts-done-btn').addEventListener('click', () => document.getElementById('shortcuts-modal').classList.add('hidden'));

    document.getElementById('canvas-area').addEventListener('scroll', () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => { updateCurrentPageIndicator(); scrollTicking = false; });
    });

    window.addEventListener('beforeunload', (e) => {
      if (State.data.pdfDoc && State.data.objects.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    document.addEventListener('keydown', (e) => {
      const editing = document.activeElement && document.activeElement.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) State.redo(); else State.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); State.redo(); return; }
      if (editing) return;
      const map = { v: 'select', t: 'add-text', i: 'add-image', d: 'draw', h: 'highlight', u: 'underline', s: 'strikethrough', w: 'whiteout' };
      if (!mod && map[e.key.toLowerCase()]) App.setTool(map[e.key.toLowerCase()]);
    });
  }

  function setZoom(z) {
    State.data.zoom = Geometry.clamp(Math.round(z * 100) / 100, 0.4, 3);
    document.getElementById('zoom-level').textContent = Math.round(State.data.zoom * 100) + '%';
    Render.renderAll();
  }

  function fitWidth() {
    const pageId = App.getCurrentVisiblePageId();
    const pd = pageId && State.getPageById(pageId);
    if (!pd) return;
    const totalRotation = ((pd.baseRotation || 0) + (pd.rotation || 0)) % 180;
    const naturalWidth = totalRotation === 90 ? pd.height : pd.width;
    const area = document.getElementById('canvas-area');
    const available = area.clientWidth - 64;
    setZoom(available / naturalWidth);
  }

  // Highlights, in the page sidebar, the thumbnail for whichever page is
  // currently centered in the scrollable canvas area.
  let scrollTicking = false;
  function updateCurrentPageIndicator() {
    const id = App.getCurrentVisiblePageId();
    document.querySelectorAll('.thumb-item.selected').forEach((el) => el.classList.remove('selected'));
    if (!id) return;
    const el = document.querySelector(`.thumb-item[data-page-id="${id}"]`);
    if (el) el.classList.add('selected');
  }
  App.updateCurrentPageIndicator = updateCurrentPageIndicator;

  // ---------------- properties bar ----------------
  function swatchRow(current, onPick) {
    const row = document.createElement('div');
    row.className = 'swatch-row';
    const isPreset = COLORS.some((c) => c.toLowerCase() === (current || '').toLowerCase());
    COLORS.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-swatch' + (c.toLowerCase() === (current || '').toLowerCase() ? ' active' : '');
      btn.style.background = c;
      if (c === '#ffffff') btn.style.boxShadow = 'inset 0 0 0 1px #ddd';
      btn.addEventListener('click', () => onPick(c));
      row.appendChild(btn);
    });

    // Custom color picker, shown as one more swatch. Native <input type=color>
    // proxied behind a styled button so it matches the preset swatches.
    const customWrap = document.createElement('div');
    customWrap.className = 'color-swatch custom-swatch' + (!isPreset ? ' active' : '');
    customWrap.title = 'Custom color';
    customWrap.style.background = !isPreset ? current : 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)';
    customWrap.style.position = 'relative';
    customWrap.style.padding = '0';
    customWrap.style.overflow = 'hidden';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = /^#[0-9a-f]{6}$/i.test(current || '') ? current : '#000000';
    colorInput.style.position = 'absolute';
    colorInput.style.inset = '-4px';
    colorInput.style.width = '30px';
    colorInput.style.height = '30px';
    colorInput.style.opacity = '0';
    colorInput.style.cursor = 'pointer';
    colorInput.addEventListener('input', () => onPick(colorInput.value));
    customWrap.appendChild(colorInput);
    row.appendChild(customWrap);
    return row;
  }

  function opacityInput(current, onChange) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '6px';
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '10'; range.max = '100'; range.step = '5';
    range.value = String(Math.round((current != null ? current : 1) * 100));
    range.style.width = '80px';
    const pct = document.createElement('span');
    pct.textContent = range.value + '%';
    pct.style.width = '34px';
    pct.style.fontVariantNumeric = 'tabular-nums';
    range.addEventListener('input', () => { pct.textContent = range.value + '%'; });
    range.addEventListener('change', () => onChange(Number(range.value) / 100));
    wrap.appendChild(range);
    wrap.appendChild(pct);
    return wrap;
  }

  function labeled(text, el) {
    const label = document.createElement('label');
    label.textContent = text;
    label.appendChild(el);
    return label;
  }

  function mutateSelected(patch) {
    const id = State.data.selectedObjectId;
    State.mutate(() => State.updateObject(id, patch));
    State.commit();
    renderPropertiesBar();
  }

  function deleteSelectedBtn(bar) {
    const spacer = document.createElement('div');
    spacer.className = 'prop-spacer';
    bar.appendChild(spacer);
    const del = document.createElement('button');
    del.className = 'prop-danger-btn';
    del.textContent = '🗑 Delete';
    del.addEventListener('click', () => Tools.deleteObject(State.data.selectedObjectId));
    bar.appendChild(del);
  }

  function fontFamilySelect(current, onChange) {
    const select = document.createElement('select');
    ['Helvetica', 'TimesRoman', 'Courier'].forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v === 'TimesRoman' ? 'Times' : v;
      if (v === current) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  function sizeInput(current, onChange) {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '4'; input.max = '200';
    input.style.width = '58px';
    input.value = current;
    input.addEventListener('change', () => onChange(Number(input.value) || current));
    return input;
  }

  function toggleBtn(text, active, onClick, extraStyle) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn';
    btn.textContent = text;
    btn.style.width = 'auto';
    btn.style.padding = '0 10px';
    if (active) { btn.style.background = 'var(--accent-soft)'; btn.style.color = 'var(--accent-dark)'; }
    if (extraStyle) Object.assign(btn.style, extraStyle);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function renderPropertiesBar() {
    const bar = document.getElementById('properties-bar');
    bar.innerHTML = '';
    const selected = State.getSelected();
    const tool = State.data.tool;
    let show = true;

    if (selected && (selected.type === 'text-edit' || selected.type === 'text-add')) {
      bar.appendChild(labeled('Font', fontFamilySelect(selected.base, (v) => mutateSelected({ base: v }))));
      bar.appendChild(labeled('Size', sizeInput(selected.size, (v) => mutateSelected({ size: v }))));
      bar.appendChild(toggleBtn('B', selected.bold, () => mutateSelected({ bold: !selected.bold }), { fontWeight: '700' }));
      bar.appendChild(toggleBtn('I', selected.italic, () => mutateSelected({ italic: !selected.italic }), { fontStyle: 'italic' }));
      bar.appendChild(swatchRow(selected.color, (c) => mutateSelected({ color: c })));
      deleteSelectedBtn(bar);
    } else if (selected && selected.type === 'highlight') {
      bar.appendChild(labeled('Color', swatchRow(selected.color, (c) => mutateSelected({ color: c }))));
      bar.appendChild(labeled('Opacity', opacityInput(selected.opacity, (v) => mutateSelected({ opacity: v }))));
      deleteSelectedBtn(bar);
    } else if (selected && (selected.type === 'underline' || selected.type === 'strikethrough' || selected.type === 'whiteout')) {
      bar.appendChild(labeled('Color', swatchRow(selected.color, (c) => mutateSelected({ color: c }))));
      deleteSelectedBtn(bar);
    } else if (selected && (selected.type === 'draw' || selected.type === 'shape')) {
      bar.appendChild(swatchRow(selected.color, (c) => mutateSelected({ color: c })));
      bar.appendChild(labeled('Stroke', sizeInput(selected.strokeWidth, (v) => mutateSelected({ strokeWidth: v }))));
      bar.appendChild(labeled('Opacity', opacityInput(selected.opacity, (v) => mutateSelected({ opacity: v }))));
      if (selected.type === 'shape' && (selected.shapeType === 'rect' || selected.shapeType === 'ellipse')) {
        bar.appendChild(toggleBtn('Fill', !!selected.fill, () => mutateSelected({ fill: selected.fill ? null : selected.color })));
      }
      deleteSelectedBtn(bar);
    } else if (selected && (selected.type === 'image' || selected.type === 'signature')) {
      deleteSelectedBtn(bar);
    } else if (tool === 'add-text') {
      bar.appendChild(labeled('Font', fontFamilySelect(State.data.fontChoice, (v) => { State.data.fontChoice = v; })));
      bar.appendChild(labeled('Size', sizeInput(State.data.fontSize, (v) => { State.data.fontSize = v; })));
      bar.appendChild(swatchRow(State.data.textColor, (c) => { State.data.textColor = c; renderPropertiesBar(); }));
    } else if (['draw', 'shape-rect', 'shape-ellipse', 'shape-line', 'shape-arrow', 'underline', 'strikethrough', 'whiteout'].includes(tool)) {
      bar.appendChild(swatchRow(State.data.activeColor, (c) => { State.data.activeColor = c; renderPropertiesBar(); }));
      if (tool === 'draw' || tool.startsWith('shape-')) {
        bar.appendChild(labeled('Stroke', sizeInput(State.data.strokeWidth, (v) => { State.data.strokeWidth = v; })));
        bar.appendChild(labeled('Opacity', opacityInput(State.data.shapeOpacity, (v) => { State.data.shapeOpacity = v; renderPropertiesBar(); })));
      }
    } else if (tool === 'highlight') {
      bar.appendChild(labeled('Color', swatchRow(State.data.highlightColor, (c) => { State.data.highlightColor = c; renderPropertiesBar(); })));
      bar.appendChild(labeled('Opacity', opacityInput(State.data.highlightOpacity, (v) => { State.data.highlightOpacity = v; renderPropertiesBar(); })));
    } else {
      show = false;
    }
    bar.classList.toggle('hidden', !show);
  }

  // ---------------- signature modal ----------------
  function wireSignatureModal() {
    Tools.initSignaturePad();
    document.getElementById('signature-close-btn').addEventListener('click', Tools.closeSignatureModal);
    document.getElementById('signature-cancel-btn').addEventListener('click', Tools.closeSignatureModal);
    document.getElementById('signature-insert-btn').addEventListener('click', Tools.insertSignature);
    document.querySelectorAll('.modal-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.modal-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('signature-draw-pane').classList.toggle('hidden', tab.dataset.sigTab !== 'draw');
        document.getElementById('signature-type-pane').classList.toggle('hidden', tab.dataset.sigTab !== 'type');
      });
    });
  }

  // ---------------- upload / bootstrap ----------------
  function showHero() {
    document.getElementById('hero-screen').classList.remove('hidden');
    document.getElementById('editor-screen').classList.add('hidden');
    document.getElementById('file-input').value = '';
  }

  async function openPdf(file) {
    App.showLoading('Opening your PDF…');
    try {
      const buf = await file.arrayBuffer();
      // pdf.js may transfer/detach the buffer behind the Uint8Array it's given
      // (it hands it to a worker), so hand it a copy and keep `buf` intact for
      // pdf-lib to read from later at export time.
      const pdfDoc = await Render.loadPdfFromBytes(new Uint8Array(buf.slice(0)));
      const descriptors = await Render.describeDoc(pdfDoc);

      State.data.originalBytes = buf;
      State.data.pdfDoc = pdfDoc;
      State.data.fileName = file.name || 'document.pdf';
      State.data.zoom = 1;
      State.data.selectedObjectId = null;
      State.data.insertedDocs = {};
      State.data.pages = descriptors.map((d, i) => ({
        id: Geometry.uid(), kind: 'original', originalIndex: i,
        width: d.width, height: d.height, baseRotation: d.baseRotation, rotation: 0,
      }));
      State.data.objects = [];
      State.initHistory();

      document.getElementById('hero-screen').classList.add('hidden');
      document.getElementById('editor-screen').classList.remove('hidden');
      document.getElementById('zoom-level').textContent = '100%';
      App.setTool('select');

      await Render.renderAll();
      await Pages.renderSidebar();
      App.toast(`Loaded ${State.data.pages.length} page${State.data.pages.length === 1 ? '' : 's'}`);
    } catch (err) {
      console.error(err);
      App.toast('Could not open that PDF. Please try another file.', true);
    } finally {
      App.hideLoading();
    }
  }

  function wireUpload() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const chooseBtn = document.getElementById('choose-file-btn');

    const open = (file) => {
      if (!file) return;
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
        App.toast('Please choose a PDF file', true);
        return;
      }
      openPdf(file);
    };

    chooseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
    fileInput.addEventListener('change', (e) => open(e.target.files[0]));

    ['dragenter', 'dragover'].forEach((evt) => dropzone.addEventListener(evt, (e) => {
      e.preventDefault(); dropzone.classList.add('drag-over');
    }));
    ['dragleave', 'drop'].forEach((evt) => dropzone.addEventListener(evt, (e) => {
      e.preventDefault(); dropzone.classList.remove('drag-over');
    }));
    dropzone.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      open(file);
    });
  }

  function init() {
    wireUpload();
    wireToolbar();
    wireSignatureModal();
    Tools.init();

    State.onChange(() => Render.refreshObjectLayers());
    State.onSelectionChange((id) => {
      Render.applySelectionHighlight(id);
      renderPropertiesBar();
    });
    State.onHistoryChange((canUndo, canRedo) => {
      document.getElementById('undo-btn').disabled = !canUndo;
      document.getElementById('redo-btn').disabled = !canRedo;
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.App = window.App || {});
