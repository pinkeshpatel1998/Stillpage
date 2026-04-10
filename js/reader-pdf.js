// PDF reader — uses PDF.js (loaded lazily from CDN).
// Exposes the same interface as the EPUB and text readers:
//   { init, goToPage, next, prev, setViewMode, applyTypography, getTOC,
//     onProgress, getPosition, setPosition, destroy, totalPages, currentPage }

let pdfjsLib = null;

async function ensurePdfJs() {
  if (pdfjsLib) return pdfjsLib;
  // Load pdf.js as an ES module from CDN
  pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
  return pdfjsLib;
}

export async function createPdfReader({ file, container, viewMode }) {
  const lib = await ensurePdfJs();
  const arrayBuf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuf }).promise;

  let currentPage = 1;
  let mode = viewMode || 'paginated';
  let progressCb = null;
  const pageCache = new Map(); // pageNumber -> canvas

  container.innerHTML = '';
  const column = document.createElement('div');
  column.className = 'reader-column pdf-column';
  container.appendChild(column);

  async function renderPage(pageNum) {
    if (pageCache.has(pageNum)) return pageCache.get(pageNum);

    const page = await pdf.getPage(pageNum);

    // Compute scale to fit current column width
    const containerWidth = Math.min(
      column.clientWidth || 640,
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reader-line-width')) || 640,
    );
    const unscaled = page.getViewport({ scale: 1 });
    const scale = Math.min(2, containerWidth / unscaled.width) * (window.devicePixelRatio || 1);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page';
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = (viewport.width / (window.devicePixelRatio || 1)) + 'px';
    canvas.style.height = (viewport.height / (window.devicePixelRatio || 1)) + 'px';
    canvas.dataset.page = String(pageNum);

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    pageCache.set(pageNum, canvas);
    return canvas;
  }

  async function drawPaginated() {
    column.innerHTML = '';
    const c = await renderPage(currentPage);
    column.appendChild(c);
    container.scrollTop = 0;
    emitProgress();
  }

  async function drawScroll() {
    column.innerHTML = '';
    // Render progressively — first a batch, then on-demand while scrolling
    const initialBatch = Math.min(3, pdf.numPages);
    for (let p = 1; p <= initialBatch; p++) {
      const c = await renderPage(p);
      column.appendChild(c);
    }
    // Lazy-load remaining on scroll
    container.onscroll = async () => {
      const rendered = column.childElementCount;
      if (rendered >= pdf.numPages) {
        container.onscroll = null;
        return;
      }
      const nearBottom = container.scrollTop + container.clientHeight > column.scrollHeight - 800;
      if (nearBottom) {
        const next = rendered + 1;
        if (next <= pdf.numPages && !document.querySelector(`.pdf-page[data-page="${next}"]`)) {
          const c = await renderPage(next);
          column.appendChild(c);
        }
      }
      // Update current page based on what's centered
      const mid = container.scrollTop + container.clientHeight / 2;
      const pages = column.querySelectorAll('.pdf-page');
      for (const canv of pages) {
        if (canv.offsetTop <= mid && canv.offsetTop + canv.offsetHeight > mid) {
          const n = parseInt(canv.dataset.page, 10);
          if (n && n !== currentPage) {
            currentPage = n;
            emitProgress();
          }
          break;
        }
      }
    };
    emitProgress();
  }

  function emitProgress() {
    if (progressCb) {
      progressCb({
        currentPage,
        totalPages: pdf.numPages,
        percent: currentPage / pdf.numPages,
      });
    }
  }

  async function draw() {
    if (mode === 'paginated') await drawPaginated();
    else await drawScroll();
  }

  // TOC (outline) extraction
  async function getTOC() {
    const outline = await pdf.getOutline();
    if (!outline || outline.length === 0) return [];
    const flat = [];
    async function walk(nodes, depth) {
      for (const node of nodes) {
        let page = null;
        try {
          if (typeof node.dest === 'string') {
            const dest = await pdf.getDestination(node.dest);
            if (dest) {
              const ref = dest[0];
              page = (await pdf.getPageIndex(ref)) + 1;
            }
          } else if (Array.isArray(node.dest) && node.dest[0]) {
            page = (await pdf.getPageIndex(node.dest[0])) + 1;
          }
        } catch {
          /* ignore navigation errors */
        }
        flat.push({ label: node.title, depth, target: page });
        if (node.items && node.items.length) await walk(node.items, depth + 1);
      }
    }
    await walk(outline, 0);
    return flat;
  }

  await draw();

  return {
    type: 'pdf',
    get totalPages() { return pdf.numPages; },
    get currentPage() { return currentPage; },

    async next() {
      if (mode === 'paginated') {
        if (currentPage < pdf.numPages) {
          currentPage++;
          await drawPaginated();
        }
      } else {
        container.scrollBy({ top: container.clientHeight * 0.9, behavior: 'smooth' });
      }
    },

    async prev() {
      if (mode === 'paginated') {
        if (currentPage > 1) {
          currentPage--;
          await drawPaginated();
        }
      } else {
        container.scrollBy({ top: -container.clientHeight * 0.9, behavior: 'smooth' });
      }
    },

    async goToPage(n) {
      n = Math.max(1, Math.min(pdf.numPages, n));
      currentPage = n;
      if (mode === 'paginated') {
        await drawPaginated();
      } else {
        // Render missing pages up to target then scroll
        while (column.childElementCount < n) {
          const nextNum = column.childElementCount + 1;
          const c = await renderPage(nextNum);
          column.appendChild(c);
        }
        const target = column.querySelector(`.pdf-page[data-page="${n}"]`);
        if (target) container.scrollTo({ top: target.offsetTop - 20, behavior: 'smooth' });
        emitProgress();
      }
    },

    async setViewMode(newMode) {
      if (newMode === mode) return;
      mode = newMode;
      await draw();
    },

    applyTypography() {
      // PDF is rendered as canvases — re-render on significant change
      pageCache.clear();
      draw();
    },

    getTOC,
    onProgress(cb) { progressCb = cb; emitProgress(); },

    getPosition() { return { page: currentPage }; },
    async setPosition(pos) {
      if (pos && pos.page) await this.goToPage(pos.page);
    },

    destroy() {
      pageCache.clear();
      container.onscroll = null;
      container.innerHTML = '';
      pdf.destroy?.();
    },
  };
}
