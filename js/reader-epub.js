// EPUB reader — uses epub.js (loaded from CDN via <script> tag in index.html,
// so window.ePub is available).

export async function createEpubReader({ file, container, viewMode, prefs }) {
  if (!window.ePub) {
    throw new Error('epub.js failed to load. Check your network connection.');
  }

  container.innerHTML = '';
  const holder = document.createElement('div');
  holder.className = 'epub-view-container';
  holder.style.width = '100%';
  holder.style.height = '100%';
  container.appendChild(holder);

  const arrayBuf = await file.arrayBuffer();
  const book = window.ePub(arrayBuf);

  let mode = viewMode || 'paginated';
  let progressCb = null;

  function renditionOptions() {
    if (mode === 'paginated') {
      return {
        width: '100%',
        height: '100%',
        flow: 'paginated',
        spread: 'none',
        manager: 'default',
      };
    }
    return {
      width: '100%',
      height: '100%',
      flow: 'scrolled-doc',
      manager: 'continuous',
    };
  }

  let rendition = book.renderTo(holder, renditionOptions());

  function applyThemeToRendition() {
    // Pull the theme-derived CSS vars from the parent document and push them into epub.js iframe.
    const cs = getComputedStyle(document.body);
    const bg = cs.getPropertyValue('--bg').trim();
    const text = cs.getPropertyValue('--text').trim();
    const accent = cs.getPropertyValue('--accent').trim();
    const font = cs.getPropertyValue('--reader-font').trim();
    const size = cs.getPropertyValue('--reader-size').trim();
    const lh = cs.getPropertyValue('--reader-line-height').trim();
    const ls = cs.getPropertyValue('--reader-letter-spacing').trim();

    rendition.themes.override('background', bg);
    rendition.themes.override('color', text);

    rendition.themes.default({
      'html, body': {
        background: `${bg} !important`,
        color: `${text} !important`,
        'font-family': `${font} !important`,
        'font-size': `${size} !important`,
        'line-height': `${lh} !important`,
        'letter-spacing': `${ls} !important`,
        padding: '0 !important',
      },
      p: {
        color: `${text} !important`,
        'font-family': `${font} !important`,
        'line-height': `${lh} !important`,
      },
      'h1,h2,h3,h4,h5,h6': {
        color: `${text} !important`,
        'font-family': `${font} !important`,
      },
      a: { color: `${accent} !important` },
      img: { 'max-width': '100% !important', height: 'auto !important' },
    });
  }

  applyThemeToRendition();

  // Display first page or saved position
  await rendition.display();

  // Generate locations for stable progress % and page count.
  // This can take a moment on large books but runs in the background.
  book.ready.then(() => book.locations.generate(1024)).then(() => {
    if (progressCb) emitProgress();
  });

  function emitProgress() {
    const loc = rendition.currentLocation();
    if (!loc || !loc.start) return;
    let percent = 0;
    let currentPage = 0;
    let totalPages = 0;
    if (book.locations && book.locations.length()) {
      percent = book.locations.percentageFromCfi(loc.start.cfi);
      totalPages = book.locations.length();
      currentPage = Math.max(1, Math.round(percent * totalPages));
    }
    if (progressCb) {
      progressCb({ currentPage, totalPages, percent });
    }
  }

  rendition.on('relocated', emitProgress);

  return {
    type: 'epub',
    get totalPages() { return book.locations?.length?.() || 0; },
    get currentPage() {
      const loc = rendition.currentLocation();
      if (!loc || !loc.start || !book.locations?.length?.()) return 0;
      const pct = book.locations.percentageFromCfi(loc.start.cfi);
      return Math.max(1, Math.round(pct * book.locations.length()));
    },

    async next() { await rendition.next(); },
    async prev() { await rendition.prev(); },

    async goToPage(n) {
      if (!book.locations?.length?.()) return;
      const pct = Math.max(0, Math.min(1, n / book.locations.length()));
      const cfi = book.locations.cfiFromPercentage(pct);
      await rendition.display(cfi);
    },

    async setViewMode(newMode) {
      if (newMode === mode) return;
      mode = newMode;
      // Save current location, destroy rendition, recreate with new flow
      const currentCfi = rendition.currentLocation()?.start?.cfi;
      rendition.destroy();
      holder.innerHTML = '';
      rendition = book.renderTo(holder, renditionOptions());
      applyThemeToRendition();
      await rendition.display(currentCfi);
      rendition.on('relocated', emitProgress);
    },

    applyTypography() {
      applyThemeToRendition();
    },

    async getTOC() {
      const nav = await book.loaded.navigation;
      const flat = [];
      function walk(items, depth) {
        for (const item of items) {
          flat.push({ label: item.label.trim(), depth, target: item.href });
          if (item.subitems && item.subitems.length) walk(item.subitems, depth + 1);
        }
      }
      walk(nav.toc, 0);
      return flat;
    },

    async goToTarget(target) {
      await rendition.display(target);
    },

    onProgress(cb) { progressCb = cb; emitProgress(); },

    getPosition() {
      const loc = rendition.currentLocation();
      return { cfi: loc?.start?.cfi || null };
    },

    async setPosition(pos) {
      if (pos && pos.cfi) await rendition.display(pos.cfi);
    },

    async getTitle() {
      try {
        const meta = await book.loaded.metadata;
        return meta?.title || null;
      } catch {
        return null;
      }
    },

    destroy() {
      rendition.destroy();
      book.destroy();
      container.innerHTML = '';
    },
  };
}
