// Stillpage — main entry point.
// Orchestrates upload, reader lifecycle, settings panel, TOC, bookmarks,
// keyboard shortcuts, and auto-hiding chrome.

import {
  loadPrefs, savePrefs, bookIdFor,
  loadBookState, saveBookState, updateBookPosition,
  addBookmark, removeBookmark,
  loadRecent, addRecent, removeRecent,
} from './storage.js';
import { applyPrefs, cycleTheme } from './theme.js';
import { createPdfReader } from './reader-pdf.js';
import { createEpubReader } from './reader-epub.js';
import { createTextReader } from './reader-text.js';

// ----- State -----
const state = {
  prefs: loadPrefs(),
  reader: null,        // active reader instance
  bookId: null,        // current book id
  bookTitle: '',
  bookFormat: '',
  bookmarks: [],
  file: null,          // last loaded File object (kept only in-memory)
  chromeHideTimer: null,
};

// ----- Element references -----
const $ = (id) => document.getElementById(id);
const els = {
  body: document.body,
  home: $('home'),
  reader: $('reader'),
  dropZone: $('drop-zone'),
  fileInput: $('file-input'),
  errorBanner: $('error-banner'),
  recentSection: $('recent-section'),
  recentList: $('recent-list'),
  viewer: $('viewer'),
  loading: $('loading'),
  topBar: $('top-bar'),
  bottomBar: $('bottom-bar'),
  bookTitle: $('book-title'),
  btnHome: $('btn-home'),
  btnToc: $('btn-toc'),
  btnSettings: $('btn-settings'),
  btnBookmark: $('btn-bookmark'),
  btnFullscreen: $('btn-fullscreen'),
  btnPrev: $('btn-prev'),
  btnNext: $('btn-next'),
  btnGoto: $('btn-goto'),
  progressBar: $('progress-bar'),
  progressFill: $('progress-fill'),
  bookmarkDots: $('bookmark-dots'),
  pageLabel: $('page-label'),
  edgeLeft: $('page-prev-hit'),
  edgeRight: $('page-next-hit'),
  settingsPanel: $('settings-panel'),
  tocPanel: $('toc-panel'),
  panelScrim: $('panel-scrim'),
  gotoModal: $('goto-modal'),
  gotoInput: $('goto-input'),
  gotoCancel: $('goto-cancel'),
  gotoGo: $('goto-go'),
  themeGrid: $('theme-grid'),
  fontFamily: $('font-family'),
  fontSize: $('font-size'),
  fontSizeVal: $('font-size-val'),
  lineHeight: $('line-height'),
  lineWidth: $('line-width'),
  letterSpacing: $('letter-spacing'),
  viewMode: $('view-mode'),
  tocList: $('toc-list'),
  tocEmpty: $('toc-empty'),
  bookmarksList: $('bookmarks-list'),
};

// ============================================================
// Initialization
// ============================================================
function init() {
  applyPrefs(state.prefs);
  syncControlsFromPrefs();
  renderRecentList();
  bindHomeEvents();
  bindReaderEvents();
  bindSettingsPanel();
  bindKeyboard();
}

// ============================================================
// Home screen / file upload
// ============================================================
function bindHomeEvents() {
  // File input
  els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  });

  // Drag and drop — attach to whole body for a full-page drop target
  ['dragenter', 'dragover'].forEach((evt) => {
    document.addEventListener(evt, (e) => {
      e.preventDefault();
      els.dropZone.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    document.addEventListener(evt, (e) => {
      e.preventDefault();
      if (evt === 'dragleave' && e.target !== document.body && e.target !== els.dropZone) return;
      els.dropZone.classList.remove('dragging');
    });
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  // Keyboard activation of drop zone
  els.dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      els.fileInput.click();
    }
  });
}

function showError(msg) {
  els.errorBanner.textContent = msg;
  els.errorBanner.hidden = false;
  setTimeout(() => { els.errorBanner.hidden = true; }, 4000);
}

function detectFormat(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.epub')) return 'epub';
  if (name.endsWith('.txt')) return 'text';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';
  return null;
}

async function handleFile(file) {
  const format = detectFormat(file);
  if (!format) {
    showError(`Sorry — "${file.name}" isn't a supported format. Try PDF, EPUB, TXT, or Markdown.`);
    return;
  }

  state.file = file;
  state.bookId = bookIdFor(file);
  state.bookFormat = format;
  state.bookTitle = file.name.replace(/\.[^.]+$/, '');

  // Switch to reader view
  els.home.hidden = true;
  els.reader.hidden = false;
  els.body.dataset.view = 'reader';
  els.bookTitle.textContent = state.bookTitle;
  els.loading.hidden = false;
  els.viewer.innerHTML = '';

  try {
    if (state.reader) {
      try { state.reader.destroy(); } catch {}
      state.reader = null;
    }

    const common = {
      file,
      container: els.viewer,
      viewMode: state.prefs.viewMode,
      prefs: state.prefs,
    };

    if (format === 'pdf') {
      state.reader = await createPdfReader(common);
    } else if (format === 'epub') {
      state.reader = await createEpubReader(common);
      // Prefer the book's real title if available
      const realTitle = await state.reader.getTitle?.();
      if (realTitle) {
        state.bookTitle = realTitle;
        els.bookTitle.textContent = realTitle;
      }
    } else {
      state.reader = await createTextReader(common);
    }

    // Wire progress updates
    state.reader.onProgress(updateProgressUI);

    // Restore last position if available
    const book = loadBookState(state.bookId);
    state.bookmarks = book.bookmarks || [];
    if (book.position) {
      await state.reader.setPosition(book.position);
    }
    renderBookmarks();

    // Populate TOC (lazy — load on first open)
    els.tocList.innerHTML = '';
    els.tocEmpty.hidden = true;

    // Save to recents
    addRecent({
      id: state.bookId,
      name: file.name,
      format,
      size: file.size,
      lastOpened: Date.now(),
    });

    // Start auto-hide chrome
    resetChromeTimer();
  } catch (err) {
    console.error(err);
    showError(`Failed to open this file: ${err.message || err}`);
    exitToHome();
    return;
  } finally {
    els.loading.hidden = true;
  }
}

function renderRecentList() {
  const list = loadRecent();
  if (list.length === 0) {
    els.recentSection.hidden = true;
    return;
  }
  els.recentSection.hidden = false;
  els.recentList.innerHTML = '';
  for (const entry of list) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.innerHTML = `
      <span class="recent-name">${escapeHtml(entry.name)}</span>
      <span class="recent-meta">${entry.format.toUpperCase()} · ${formatDate(entry.lastOpened)}</span>
    `;
    btn.title = 'Re-open requires selecting the file again (browsers cannot store file content)';
    btn.addEventListener('click', () => {
      // We cannot store the actual file content in localStorage, so opening a
      // recent entry just prompts the user to re-pick the file.
      els.fileInput.click();
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'recent-remove';
    removeBtn.setAttribute('aria-label', 'Remove from recents');
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeRecent(entry.id);
      renderRecentList();
    });

    btn.appendChild(removeBtn);
    li.appendChild(btn);
    els.recentList.appendChild(li);
  }
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// ============================================================
// Reader events & navigation
// ============================================================
function bindReaderEvents() {
  els.btnHome.addEventListener('click', exitToHome);
  els.btnPrev.addEventListener('click', () => state.reader?.prev());
  els.btnNext.addEventListener('click', () => state.reader?.next());
  els.edgeLeft.addEventListener('click', () => state.reader?.prev());
  els.edgeRight.addEventListener('click', () => state.reader?.next());

  els.btnSettings.addEventListener('click', () => openPanel(els.settingsPanel));
  els.btnToc.addEventListener('click', async () => {
    openPanel(els.tocPanel);
    await loadTOC();
  });
  els.btnBookmark.addEventListener('click', toggleBookmarkAtCurrent);
  els.btnFullscreen.addEventListener('click', toggleFullscreen);

  els.progressBar.addEventListener('click', (e) => {
    if (!state.reader) return;
    const rect = els.progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const total = state.reader.totalPages;
    if (total) state.reader.goToPage(Math.max(1, Math.round(pct * total)));
  });

  els.btnGoto.addEventListener('click', openGotoModal);
  els.gotoCancel.addEventListener('click', () => { els.gotoModal.hidden = true; });
  els.gotoGo.addEventListener('click', submitGoto);
  els.gotoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitGoto();
  });

  els.panelScrim.addEventListener('click', closeAllPanels);

  document.querySelectorAll('.panel-close').forEach((btn) => {
    btn.addEventListener('click', closeAllPanels);
  });

  // Mouse-movement auto-hides chrome
  document.addEventListener('mousemove', resetChromeTimer);
}

function exitToHome() {
  if (state.reader) {
    try { state.reader.destroy(); } catch {}
    state.reader = null;
  }
  state.bookId = null;
  state.file = null;
  els.reader.hidden = true;
  els.home.hidden = false;
  els.body.dataset.view = 'home';
  els.reader.classList.remove('chrome-hidden');
  clearTimeout(state.chromeHideTimer);
  closeAllPanels();
  renderRecentList();
}

function updateProgressUI({ currentPage, totalPages, percent }) {
  if (totalPages > 0) {
    els.progressFill.style.width = (percent * 100).toFixed(1) + '%';
    els.pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;
  } else {
    els.progressFill.style.width = '0%';
    els.pageLabel.textContent = '';
  }
  // Persist position
  if (state.bookId && state.reader) {
    updateBookPosition(state.bookId, state.reader.getPosition());
  }
  renderBookmarkDots();
}

// ============================================================
// Settings panel controls
// ============================================================
function bindSettingsPanel() {
  // Theme swatches
  els.themeGrid.querySelectorAll('.theme-swatch').forEach((btn) => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });

  els.fontFamily.addEventListener('change', () => {
    state.prefs.fontFamily = els.fontFamily.value;
    persistAndApply();
  });

  els.fontSize.addEventListener('input', () => {
    state.prefs.fontSize = parseInt(els.fontSize.value, 10);
    els.fontSizeVal.textContent = state.prefs.fontSize + 'px';
    persistAndApply();
  });

  bindSegControl(els.lineHeight, (v) => {
    state.prefs.lineHeight = parseFloat(v);
    persistAndApply();
  });
  bindSegControl(els.lineWidth, (v) => {
    state.prefs.lineWidth = parseInt(v, 10);
    persistAndApply();
  });
  bindSegControl(els.letterSpacing, (v) => {
    state.prefs.letterSpacing = parseFloat(v);
    persistAndApply();
  });
  bindSegControl(els.viewMode, (v) => {
    state.prefs.viewMode = v;
    savePrefs(state.prefs);
    state.reader?.setViewMode(v);
  });
}

function bindSegControl(root, onChange) {
  const buttons = root.querySelectorAll('button');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.value);
    });
  });
}

function syncControlsFromPrefs() {
  // Font family
  els.fontFamily.value = state.prefs.fontFamily;
  // Font size
  els.fontSize.value = state.prefs.fontSize;
  els.fontSizeVal.textContent = state.prefs.fontSize + 'px';
  // Segmented controls
  setSegActive(els.lineHeight, String(state.prefs.lineHeight));
  setSegActive(els.lineWidth, String(state.prefs.lineWidth));
  setSegActive(els.letterSpacing, String(state.prefs.letterSpacing));
  setSegActive(els.viewMode, state.prefs.viewMode);
  // Theme swatches
  els.themeGrid.querySelectorAll('.theme-swatch').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === state.prefs.theme);
  });
}

function setSegActive(root, value) {
  root.querySelectorAll('button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

function setTheme(theme) {
  state.prefs.theme = theme;
  persistAndApply();
  els.themeGrid.querySelectorAll('.theme-swatch').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function persistAndApply() {
  savePrefs(state.prefs);
  applyPrefs(state.prefs);
  state.reader?.applyTypography();
}

// ============================================================
// Panels
// ============================================================
function openPanel(panel) {
  closeAllPanels();
  panel.hidden = false;
  // Trigger CSS transform
  requestAnimationFrame(() => panel.classList.add('open'));
  els.panelScrim.hidden = false;
  requestAnimationFrame(() => els.panelScrim.classList.add('visible'));
}

function closeAllPanels() {
  [els.settingsPanel, els.tocPanel].forEach((p) => {
    p.classList.remove('open');
    setTimeout(() => { if (!p.classList.contains('open')) p.hidden = true; }, 280);
  });
  els.panelScrim.classList.remove('visible');
  setTimeout(() => {
    if (!els.panelScrim.classList.contains('visible')) els.panelScrim.hidden = true;
  }, 200);
}

// ============================================================
// Table of contents
// ============================================================
async function loadTOC() {
  if (!state.reader) return;
  els.tocList.innerHTML = '';
  els.tocEmpty.hidden = true;
  try {
    const items = await state.reader.getTOC();
    if (!items || items.length === 0) {
      els.tocEmpty.hidden = false;
      return;
    }
    for (const item of items) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = `toc-l${Math.min(item.depth + 1, 3)}`;
      btn.textContent = item.label;
      btn.addEventListener('click', async () => {
        closeAllPanels();
        if (typeof item.target === 'number') {
          await state.reader.goToPage(item.target);
        } else if (state.reader.goToTarget) {
          await state.reader.goToTarget(item.target);
        }
      });
      li.appendChild(btn);
      els.tocList.appendChild(li);
    }
  } catch (err) {
    console.error('TOC load failed', err);
    els.tocEmpty.hidden = false;
  }
}

// ============================================================
// Bookmarks
// ============================================================
function toggleBookmarkAtCurrent() {
  if (!state.reader || !state.bookId) return;
  const pos = state.reader.getPosition();
  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const page = state.reader.currentPage || 0;
  const total = state.reader.totalPages || 0;
  const percent = total > 0 ? page / total : 0;
  const label = page ? `Page ${page}` : 'Bookmark';
  state.bookmarks = addBookmark(state.bookId, {
    id, position: pos, page, percent, label, added: Date.now(),
  });
  renderBookmarks();
  renderBookmarkDots();
}

function renderBookmarks() {
  els.bookmarksList.innerHTML = '';
  for (const bm of state.bookmarks) {
    const li = document.createElement('li');

    const goBtn = document.createElement('button');
    goBtn.className = 'bookmark-go';
    goBtn.textContent = bm.label || 'Bookmark';
    goBtn.addEventListener('click', () => {
      state.reader?.setPosition(bm.position);
      closeAllPanels();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'bookmark-del';
    delBtn.setAttribute('aria-label', 'Remove bookmark');
    delBtn.textContent = '×';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.bookmarks = removeBookmark(state.bookId, bm.id);
      renderBookmarks();
      renderBookmarkDots();
    });

    li.appendChild(goBtn);
    li.appendChild(delBtn);
    els.bookmarksList.appendChild(li);
  }
}

function renderBookmarkDots() {
  els.bookmarkDots.innerHTML = '';
  if (!state.reader) return;
  for (const bm of state.bookmarks) {
    let pct = bm.percent;
    // Fallback for older bookmarks that only stored a page number
    if (pct == null && bm.page && state.reader.totalPages) {
      pct = bm.page / state.reader.totalPages;
    }
    if (pct > 0) {
      const dot = document.createElement('div');
      dot.className = 'bookmark-dot';
      dot.style.left = (pct * 100).toFixed(1) + '%';
      els.bookmarkDots.appendChild(dot);
    }
  }
}

// Cycle to previous/next bookmark
function cycleBookmark(direction) {
  if (!state.bookmarks.length || !state.reader) return;
  const currentPage = state.reader.currentPage || 0;
  const sorted = [...state.bookmarks].sort((a, b) => (a.page || 0) - (b.page || 0));
  let target;
  if (direction > 0) {
    target = sorted.find((b) => (b.page || 0) > currentPage) || sorted[0];
  } else {
    const before = sorted.filter((b) => (b.page || 0) < currentPage);
    target = before[before.length - 1] || sorted[sorted.length - 1];
  }
  if (target) state.reader.setPosition(target.position);
}

// ============================================================
// Go-to page modal
// ============================================================
function openGotoModal() {
  els.gotoInput.value = '';
  els.gotoInput.max = state.reader?.totalPages || '';
  els.gotoModal.hidden = false;
  setTimeout(() => els.gotoInput.focus(), 0);
}

function submitGoto() {
  const n = parseInt(els.gotoInput.value, 10);
  if (!isNaN(n) && state.reader) {
    state.reader.goToPage(n);
  }
  els.gotoModal.hidden = true;
}

// ============================================================
// Fullscreen & chrome auto-hide
// ============================================================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function resetChromeTimer() {
  els.reader.classList.remove('chrome-hidden');
  clearTimeout(state.chromeHideTimer);
  // Only auto-hide when actively reading
  if (els.body.dataset.view !== 'reader') return;
  state.chromeHideTimer = setTimeout(() => {
    // Don't hide if a panel or modal is open
    const panelOpen = els.settingsPanel.classList.contains('open')
      || els.tocPanel.classList.contains('open')
      || !els.gotoModal.hidden;
    if (!panelOpen) {
      els.reader.classList.add('chrome-hidden');
    }
  }, 3000);
}

// ============================================================
// Keyboard shortcuts
// ============================================================
function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Ignore when typing in an input
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      if (e.key === 'Escape') target.blur();
      return;
    }
    // Only react in reader view
    if (els.body.dataset.view !== 'reader') return;

    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && (e.key === 'g' || e.key === 'G')) {
      e.preventDefault();
      openGotoModal();
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
      case ' ':
      case 'l':
      case 'L':
        e.preventDefault();
        state.reader?.next();
        break;
      case 'ArrowLeft':
      case 'h':
      case 'H':
        e.preventDefault();
        state.reader?.prev();
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        toggleFullscreen();
        break;
      case '+':
      case '=':
        e.preventDefault();
        state.prefs.fontSize = Math.min(28, state.prefs.fontSize + 1);
        els.fontSize.value = state.prefs.fontSize;
        els.fontSizeVal.textContent = state.prefs.fontSize + 'px';
        persistAndApply();
        break;
      case '-':
        e.preventDefault();
        state.prefs.fontSize = Math.max(14, state.prefs.fontSize - 1);
        els.fontSize.value = state.prefs.fontSize;
        els.fontSizeVal.textContent = state.prefs.fontSize + 'px';
        persistAndApply();
        break;
      case 't':
      case 'T':
        e.preventDefault();
        setTheme(cycleTheme(state.prefs.theme));
        break;
      case 'b':
      case 'B':
        e.preventDefault();
        toggleBookmarkAtCurrent();
        break;
      case '[':
        e.preventDefault();
        cycleBookmark(-1);
        break;
      case ']':
        e.preventDefault();
        cycleBookmark(1);
        break;
      case 'Escape':
        if (document.fullscreenElement) {
          document.exitFullscreen?.();
        } else if (!els.gotoModal.hidden) {
          els.gotoModal.hidden = true;
        } else if (els.settingsPanel.classList.contains('open')
                 || els.tocPanel.classList.contains('open')) {
          closeAllPanels();
        } else {
          exitToHome();
        }
        break;
    }
  });
}

// ----- Kick off -----
init();
