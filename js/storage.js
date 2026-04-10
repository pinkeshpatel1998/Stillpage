// Storage helpers — localStorage wrappers for preferences, recent files, and bookmarks.

const KEYS = {
  prefs: 'stillpage:prefs',
  recent: 'stillpage:recent',
  bookPrefix: 'stillpage:book:', // stillpage:book:<id>
};

export const defaultPrefs = {
  theme: 'sepia',
  fontFamily: 'serif',
  fontSize: 18,
  lineHeight: 1.8,
  lineWidth: 640,
  letterSpacing: 0,
  viewMode: 'paginated',
  zoom: 1,
};

function safeParse(str, fallback) {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch {
    return fallback;
  }
}

export function loadPrefs() {
  return { ...defaultPrefs, ...safeParse(localStorage.getItem(KEYS.prefs), {}) };
}

export function savePrefs(prefs) {
  localStorage.setItem(KEYS.prefs, JSON.stringify(prefs));
}

// ---- Book identity ----
// We key books by a string derived from name + size so we can recognise re-uploads.
export function bookIdFor(file) {
  return `${file.name}::${file.size}`;
}

// ---- Per-book state: last position + bookmarks ----
export function loadBookState(bookId) {
  return safeParse(localStorage.getItem(KEYS.bookPrefix + bookId), {
    position: null,
    bookmarks: [],
  });
}

export function saveBookState(bookId, state) {
  localStorage.setItem(KEYS.bookPrefix + bookId, JSON.stringify(state));
}

export function updateBookPosition(bookId, position) {
  const state = loadBookState(bookId);
  state.position = position;
  saveBookState(bookId, state);
}

export function addBookmark(bookId, bookmark) {
  const state = loadBookState(bookId);
  // Prevent duplicate at same position
  const dupe = state.bookmarks.some(
    (b) => JSON.stringify(b.position) === JSON.stringify(bookmark.position),
  );
  if (dupe) return state.bookmarks;
  state.bookmarks.push(bookmark);
  // Cap at 20 per PRD 7.6
  if (state.bookmarks.length > 20) state.bookmarks.shift();
  saveBookState(bookId, state);
  return state.bookmarks;
}

export function removeBookmark(bookId, bookmarkId) {
  const state = loadBookState(bookId);
  state.bookmarks = state.bookmarks.filter((b) => b.id !== bookmarkId);
  saveBookState(bookId, state);
  return state.bookmarks;
}

// ---- Recent files ----
// Recent list just stores metadata (name, size, format, lastOpened) —
// the actual file bytes can't be stored persistently without special APIs.
export function loadRecent() {
  return safeParse(localStorage.getItem(KEYS.recent), []);
}

export function addRecent(entry) {
  let list = loadRecent();
  list = list.filter((e) => e.id !== entry.id);
  list.unshift(entry);
  list = list.slice(0, 10); // Keep last 10
  localStorage.setItem(KEYS.recent, JSON.stringify(list));
  return list;
}

export function removeRecent(id) {
  const list = loadRecent().filter((e) => e.id !== id);
  localStorage.setItem(KEYS.recent, JSON.stringify(list));
  return list;
}
