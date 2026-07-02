/*
 * Central application state: document structure (page order/rotation/origin),
 * all edit objects (text edits, drawings, images, shapes, whiteouts, signatures),
 * and a snapshot-based undo/redo history.
 *
 * `pages` and `objects` are the only undoable data. UI state (zoom, active tool,
 * selection) lives outside history, matching how a real editor's undo behaves.
 */
(function (App) {
  const state = {
    originalBytes: null,   // ArrayBuffer of the uploaded PDF (source of truth for 'original' pages)
    pdfDoc: null,          // pdf.js document proxy for the uploaded PDF
    fileName: 'document.pdf',
    zoom: 1,
    tool: 'select',
    activeColor: '#e5484d',
    textColor: '#14161a',
    highlightColor: '#ffe066',
    strokeWidth: 3,
    fontChoice: 'Helvetica',
    fontSize: 14,
    selectedObjectId: null,
    // insertedDocs: cache of extra PDFs the user merged in, keyed by an id, so we
    // can re-render their pages and re-copy them at export time.
    insertedDocs: {},
    pages: [],   // [{id, kind:'original'|'blank'|'inserted', originalIndex, sourceDocId, sourcePageIndex, rotation, width, height, baseRotation}]
    objects: [], // [{id, page: pageId, type, ...type-specific fields, all geometry in PDF points}]
  };

  let historyStack = [];
  let historyIndex = -1;
  const HISTORY_LIMIT = 80;

  function snapshot() {
    return JSON.stringify({ pages: state.pages, objects: state.objects });
  }
  function restoreSnapshot(json) {
    const data = JSON.parse(json);
    state.pages = data.pages;
    state.objects = data.objects;
  }

  const historyListeners = [];
  const changeListeners = [];
  const selectionListeners = [];

  function canUndo() { return historyIndex > 0; }
  function canRedo() { return historyIndex < historyStack.length - 1; }
  function fireHistory() { historyListeners.forEach((fn) => fn(canUndo(), canRedo())); }
  function fireChange() { changeListeners.forEach((fn) => fn()); }
  function fireSelection() { selectionListeners.forEach((fn) => fn(state.selectedObjectId)); }

  const State = {
    data: state,

    onHistoryChange(fn) { historyListeners.push(fn); },
    onChange(fn) { changeListeners.push(fn); },
    onSelectionChange(fn) { selectionListeners.push(fn); },

    initHistory() {
      historyStack = [snapshot()];
      historyIndex = 0;
      fireHistory();
    },

    // Mutate state.pages/state.objects via `fn(state)`. Does not touch history;
    // call commit() afterwards (once per user-visible action).
    mutate(fn) {
      fn(state);
    },

    commit() {
      historyStack = historyStack.slice(0, historyIndex + 1);
      historyStack.push(snapshot());
      if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
      historyIndex = historyStack.length - 1;
      fireHistory();
      fireChange();
    },

    undo() {
      if (!canUndo()) return;
      historyIndex--;
      restoreSnapshot(historyStack[historyIndex]);
      fireHistory();
      fireChange();
    },

    redo() {
      if (!canRedo()) return;
      historyIndex++;
      restoreSnapshot(historyStack[historyIndex]);
      fireHistory();
      fireChange();
    },

    setSelected(id) {
      state.selectedObjectId = id;
      fireSelection();
    },

    getSelected() {
      if (!state.selectedObjectId) return null;
      return state.objects.find((o) => o.id === state.selectedObjectId) || null;
    },

    getPageById(id) {
      return state.pages.find((p) => p.id === id) || null;
    },

    getPageIndex(id) {
      return state.pages.findIndex((p) => p.id === id);
    },

    objectsForPage(pageId) {
      return state.objects.filter((o) => o.page === pageId);
    },

    addObject(obj) {
      if (!obj.id) obj.id = App.Geometry.uid();
      state.objects.push(obj);
      return obj;
    },

    removeObject(id) {
      state.objects = state.objects.filter((o) => o.id !== id);
      if (state.selectedObjectId === id) state.selectedObjectId = null;
    },

    updateObject(id, patch) {
      const obj = state.objects.find((o) => o.id === id);
      if (obj) Object.assign(obj, patch);
      return obj;
    },

    removePage(pageId) {
      state.pages = state.pages.filter((p) => p.id !== pageId);
      state.objects = state.objects.filter((o) => o.page !== pageId);
    },
  };

  App.State = State;
})(window.App = window.App || {});
