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
    document.addEventListener('click', () => document.getElementById('shapes-menu').classList.remove('open'));
    document.getElementById('shapes-menu').addEventListener('click', (e) => e.stopPropagation());

    document.getElementById('undo-btn').addEventListener('click', () => State.undo());
    document.getElementById('redo-btn').addEventListener('click', () => State.redo());
    document.getElementById('download-btn').addEventListener('click', () => App.Export.downloadEditedPdf());

    document.getElementById('zoom-in-btn').addEventListener('click', () => setZoom(State.data.zoom + 0.1));
    document.getElementById('zoom-out-btn').addEventListener('click', () => setZoom(State.data.zoom - 0.1));

    document.getElementById('new-file-btn').addEventListener('click', () => {
      if (State.data.pdfDoc && !confirm('Open a different PDF? Any unsaved edits to the current one will be lost.')) return;
      showHero();
    });

    document.getElementById('add-page-btn').addEventListener('click', () => Pages.addBlankPage());
    document.getElementById('insert-pdf-btn').addEventListener('click', () => document.getElementById('insert-pdf-input').click());
    document.getElementById('insert-pdf-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) Pages.insertPdfFile(file);
      e.target.value = '';
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

  // ---------------- properties bar ----------------
  function swatchRow(current, onPick) {
    const row = document.createElement('div');
    row.className = 'swatch-row';
    COLORS.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-swatch' + (c.toLowerCase() === (current || '').toLowerCase() ? ' active' : '');
      btn.style.background = c;
      if (c === '#ffffff') btn.style.boxShadow = 'inset 0 0 0 1px #ddd';
      btn.addEventListener('click', () => onPick(c));
      row.appendChild(btn);
    });
    return row;
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
    } else if (selected && (selected.type === 'highlight' || selected.type === 'underline' || selected.type === 'strikethrough' || selected.type === 'whiteout')) {
      bar.appendChild(labeled('Color', swatchRow(selected.color, (c) => mutateSelected({ color: c }))));
      deleteSelectedBtn(bar);
    } else if (selected && (selected.type === 'draw' || selected.type === 'shape')) {
      bar.appendChild(swatchRow(selected.color, (c) => mutateSelected({ color: c })));
      bar.appendChild(labeled('Stroke', sizeInput(selected.strokeWidth, (v) => mutateSelected({ strokeWidth: v }))));
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
      }
    } else if (tool === 'highlight') {
      bar.appendChild(labeled('Color', swatchRow(State.data.highlightColor, (c) => { State.data.highlightColor = c; renderPropertiesBar(); })));
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
