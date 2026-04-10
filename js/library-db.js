// IndexedDB library — stores full book files + metadata locally in the browser.
// No server, no backend. Data persists across sessions until the user clears it.

const DB_NAME = 'stillpage';
const DB_VERSION = 1;
const STORE = 'books';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('lastOpenedAt', 'lastOpenedAt', { unique: false });
        store.createIndex('addedAt', 'addedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode) {
  return openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---- Public API ----

export async function saveBook(entry) {
  // entry: { id, name, format, size, data: ArrayBuffer, cover: string|null,
  //          title, addedAt, lastOpenedAt, progress }
  const store = await tx('readwrite');
  return promisify(store.put(entry));
}

export async function getBook(id) {
  const store = await tx('readonly');
  return promisify(store.get(id));
}

export async function deleteBook(id) {
  const store = await tx('readwrite');
  return promisify(store.delete(id));
}

export async function getAllBooks() {
  const store = await tx('readonly');
  return promisify(store.getAll());
}

export async function updateBookMeta(id, updates) {
  const book = await getBook(id);
  if (!book) return;
  Object.assign(book, updates);
  return saveBook(book);
}

// Converts stored ArrayBuffer back into a File object so readers can consume it.
export function bookToFile(book) {
  const blob = new Blob([book.data], { type: mimeForFormat(book.format) });
  return new File([blob], book.name, { type: blob.type });
}

function mimeForFormat(format) {
  switch (format) {
    case 'pdf': return 'application/pdf';
    case 'epub': return 'application/epub+zip';
    case 'text': return 'text/plain';
    case 'markdown': return 'text/markdown';
    default: return 'application/octet-stream';
  }
}

// ---- Cover generation helpers ----

// Generate a PDF thumbnail by rendering page 1 to a small canvas.
export async function generatePdfCover(arrayBuffer) {
  try {
    const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const TARGET_W = 280;
    const scale = TARGET_W / vp.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const url = canvas.toDataURL('image/jpeg', 0.7);
    pdf.destroy();
    return url;
  } catch {
    return null;
  }
}

// Extract an EPUB cover image.
export async function generateEpubCover(arrayBuffer) {
  try {
    if (!window.ePub) return null;
    const book = window.ePub(arrayBuffer.slice(0));
    await book.ready;
    const coverUrl = await book.coverUrl();
    // coverUrl is a blob URL — convert to data URL so it persists.
    if (!coverUrl) { book.destroy(); return null; }
    const resp = await fetch(coverUrl);
    const blob = await resp.blob();
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    book.destroy();
    return dataUrl;
  } catch {
    return null;
  }
}

// Generate a colour card for text/markdown files.
export function generateTextCover(title, format) {
  const canvas = document.createElement('canvas');
  canvas.width = 280;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');

  // Pick a warm colour based on title hash
  const COLORS = [
    ['#E8D5B7', '#5C4033'], ['#D4C5A9', '#3E3429'], ['#C9D1D3', '#2C3E50'],
    ['#D5C6E0', '#4A3256'], ['#C7DAD4', '#2D4A3E'], ['#E0CFC0', '#4E3B2A'],
    ['#CBCFB8', '#3A3D2E'], ['#D6C8B4', '#3C322A'],
  ];
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0;
  const [bg, fg] = COLORS[Math.abs(hash) % COLORS.length];

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 280, 400);

  // Format badge
  ctx.fillStyle = fg;
  ctx.globalAlpha = 0.15;
  ctx.fillRect(20, 20, 56, 24);
  ctx.globalAlpha = 1;
  ctx.fillStyle = fg;
  ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(format.toUpperCase(), 30, 32);

  // Title text
  ctx.font = '500 20px Georgia, serif';
  ctx.fillStyle = fg;
  const words = title.split(/\s+/);
  let y = 80;
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > 240 && line) {
      ctx.fillText(line, 20, y);
      y += 28;
      line = word;
      if (y > 340) { ctx.fillText(line + '...', 20, y); line = ''; break; }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, 20, y);

  return canvas.toDataURL('image/jpeg', 0.8);
}

// Calculate approximate storage usage.
export async function getStorageEstimate() {
  const books = await getAllBooks();
  let totalBytes = 0;
  for (const b of books) {
    totalBytes += b.data?.byteLength || 0;
  }
  return { count: books.length, totalBytes };
}
