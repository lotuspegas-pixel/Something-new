/*
 * Page management: thumbnail sidebar, drag-to-reorder, delete/rotate,
 * adding blank pages and merging in another PDF's pages.
 */
(function (App) {
  const State = App.State;
  const Render = App.Render;
  const Geometry = App.Geometry;

  const Pages = {};
  const thumbCache = {};
  let dragSrcId = null;

  function uid() { return Geometry.uid(); }

  Pages.addBlankPage = function () {
    const last = State.data.pages[State.data.pages.length - 1];
    const width = last ? last.width : 612;
    const height = last ? last.height : 792;
    const pd = { id: uid(), kind: 'blank', width, height, baseRotation: 0, rotation: 0 };
    State.mutate((s) => s.pages.push(pd));
    State.commit();
    return rebuildAndFocus(pd.id);
  };

  Pages.insertPdfFile = async function (file) {
    App.showLoading('Adding pages…');
    try {
      const buf = await file.arrayBuffer();
      const docId = uid();
      // Give pdf.js a copy; it may detach the buffer it's handed when it
      // transfers the data to its worker, and we need `buf` intact later for
      // pdf-lib at export time.
      const pdfDoc = await Render.loadPdfFromBytes(new Uint8Array(buf.slice(0)));
      State.data.insertedDocs[docId] = { bytes: buf, pdfDoc, name: file.name };
      const descriptors = await Render.describeDoc(pdfDoc);
      const newPages = descriptors.map((d, i) => ({
        id: uid(), kind: 'inserted', sourceDocId: docId, sourcePageIndex: i,
        width: d.width, height: d.height, baseRotation: d.baseRotation, rotation: 0,
      }));
      State.mutate((s) => { s.pages.push(...newPages); });
      State.commit();
      await rebuildAndFocus(newPages[0] && newPages[0].id);
      App.toast(`Added ${newPages.length} page${newPages.length === 1 ? '' : 's'} from ${file.name}`);
    } catch (err) {
      console.error(err);
      App.toast('Could not read that PDF file', true);
    } finally {
      App.hideLoading();
    }
  };

  Pages.deletePage = function (pageId) {
    if (State.data.pages.length <= 1) {
      App.toast('A document needs at least one page', true);
      return;
    }
    State.mutate((s) => App.State.removePage(pageId));
    State.setSelected(null);
    State.commit();
    return rebuildAndFocus();
  };

  Pages.rotatePage = function (pageId) {
    const pd = State.getPageById(pageId);
    if (!pd) return;
    delete thumbCache[pageId];
    State.mutate(() => { pd.rotation = ((pd.rotation || 0) + 90) % 360; });
    State.commit();
    return rebuildAndFocus(pageId);
  };

  Pages.reorder = function (fromId, toId, placeAfter) {
    const pages = State.data.pages;
    const fromIdx = pages.findIndex((p) => p.id === fromId);
    if (fromIdx === -1) return;
    const [moved] = pages.splice(fromIdx, 1);
    let toIdx = pages.findIndex((p) => p.id === toId);
    if (toIdx === -1) toIdx = pages.length;
    else if (placeAfter) toIdx += 1;
    State.mutate(() => { pages.splice(toIdx, 0, moved); });
    State.commit();
    return rebuildAndFocus();
  };

  async function rebuildAndFocus(focusPageId) {
    await Render.renderAll();
    await Pages.renderSidebar();
    if (focusPageId) {
      const wrap = document.querySelector(`.page-wrap[data-page-id="${focusPageId}"]`);
      if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  Pages.rebuildAndFocus = rebuildAndFocus;

  Pages.renderSidebar = async function () {
    const list = document.getElementById('thumb-list');
    list.innerHTML = '';
    const pages = State.data.pages;
    for (let i = 0; i < pages.length; i++) {
      const pd = pages[i];
      const item = document.createElement('div');
      item.className = 'thumb-item';
      item.draggable = true;
      item.dataset.pageId = pd.id;

      const img = document.createElement('img');
      if (!thumbCache[pd.id]) {
        try { thumbCache[pd.id] = await Render.thumbnailDataUrl(pd, 150); }
        catch (e) { thumbCache[pd.id] = ''; }
      }
      img.src = thumbCache[pd.id];
      item.appendChild(img);

      const num = document.createElement('div');
      num.className = 'thumb-num';
      num.textContent = String(i + 1);
      item.appendChild(num);

      const actions = document.createElement('div');
      actions.className = 'thumb-actions';
      const rotateBtn = document.createElement('button');
      rotateBtn.className = 'thumb-action-btn';
      rotateBtn.title = 'Rotate 90°';
      rotateBtn.textContent = '⟳';
      rotateBtn.addEventListener('click', (e) => { e.stopPropagation(); Pages.rotatePage(pd.id); });
      const delBtn = document.createElement('button');
      delBtn.className = 'thumb-action-btn';
      delBtn.title = 'Delete page';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', (e) => { e.stopPropagation(); Pages.deletePage(pd.id); });
      actions.appendChild(rotateBtn);
      actions.appendChild(delBtn);
      item.appendChild(actions);

      item.addEventListener('click', () => {
        const wrap = document.querySelector(`.page-wrap[data-page-id="${pd.id}"]`);
        if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      item.addEventListener('dragstart', (e) => {
        dragSrcId = pd.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', pd.id);
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        const rect = item.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        item.classList.toggle('drag-over-top', before);
        item.classList.toggle('drag-over-bottom', !before);
      });
      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const placeAfter = item.classList.contains('drag-over-bottom');
        item.classList.remove('drag-over-top', 'drag-over-bottom');
        if (dragSrcId && dragSrcId !== pd.id) Pages.reorder(dragSrcId, pd.id, placeAfter);
        dragSrcId = null;
      });

      list.appendChild(item);
    }
  };

  App.Pages = Pages;
})(window.App = window.App || {});
