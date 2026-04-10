# PRD — Minimal Eye-Friendly eBook Reader
**Version:** 1.0  
**Status:** Draft  
**Date:** April 2026

---

## 1. Overview

A browser-based document reader that lets users open any PDF, EPUB, or text-based file and read it in a clean, distraction-free, eye-comfort-first interface — inspired by the Kindle reading experience but accessible directly in a browser with no installation or account required.

---

## 2. Problem Statement

Most PDF and ebook viewers are either cluttered with toolbars and panels, or they render text in harsh, high-contrast black-on-white that causes eye strain during long reading sessions. There is no lightweight, browser-native reader that prioritises eye comfort, typography, and distraction-free reading the way Kindle does on dedicated hardware.

---

## 3. Goals

- Let users read any uploaded document in a calm, minimal, eye-friendly interface
- Zero friction — no sign-up, no install, drag-and-drop and read
- Works entirely in the browser (client-side only for v1)
- Optimised for long reading sessions, not quick scanning

---

## 4. Non-Goals (v1)

- Cloud sync or account system
- Social/sharing features
- AI-powered summarisation or chat with book
- Mobile app (browser on mobile is acceptable for v1)
- DRM-protected files (Kindle .azw with DRM)

---

## 5. Target Users

**Primary:** Students, researchers, and avid readers who read long documents regularly and experience eye strain from standard viewers.

**Secondary:** Professionals who read reports, whitepapers, and manuals on screen for extended periods.

---

## 6. Supported File Formats

| Format | Priority | Library |
|--------|----------|---------|
| PDF | P0 — must have | PDF.js (Mozilla) |
| EPUB | P0 — must have | epub.js |
| TXT / Markdown | P1 — should have | Native JS |
| DOCX | P2 — nice to have | mammoth.js |
| MOBI / AZW (no DRM) | P3 — future | Kindleunpack |

---

## 7. Core Features

### 7.1 File Upload
- Full-page drag-and-drop zone on the home screen
- Click-to-browse file picker as fallback
- Show file name and format badge on successful load
- Graceful error message for unsupported formats

### 7.2 Reading Engine
- Paginated view (like a book) for EPUB and long PDFs
- Scroll view option for continuous reading
- Smooth, instant page transitions (no flicker)
- Preserve original images, tables, and formatting

### 7.3 Eye Comfort — Core Priority

This is the defining feature of the product. Every visual decision must serve eye comfort.

**Themes (switchable):**

| Theme | Background | Text Colour | Use Case |
|-------|-----------|-------------|----------|
| Sepia (default) | #FAF6EF | #3B2F1E | Daytime reading, warm light |
| Soft White | #F5F5F0 | #2C2C2C | Neutral, general purpose |
| Dark (Night) | #1A1A1A | #D4C9B8 | Low light, night reading |
| Paper Grey | #ECEAE4 | #2A2A2A | Overcast / cloudy days |

**Typography controls:**
- Font family: Serif (default, Georgia-style), Sans-serif, Monospace
- Font size: Range slider, 14px – 28px, default 18px
- Line height: Comfortable (1.8 default), Compact (1.5), Spacious (2.1)
- Line width: Narrow (540px), Medium (640px, default), Wide (780px) — never full width
- Letter spacing: Normal / Wide (+0.03em)

**What is never shown:**
- Harsh white (#FFFFFF) backgrounds — always off-white or tinted
- Pure black (#000000) text — always a warm dark tone
- Blinking elements or animations during reading
- High-contrast UI chrome near the text area

### 7.4 Minimal UI / Distraction-Free Mode

- Top bar fades out after 3 seconds of no mouse movement
- Bottom bar (progress + page number) stays always visible but stays thin (32px)
- No side panels open by default
- Table of contents accessible via a subtle icon, slides in as overlay, not a permanent panel
- Keyboard shortcuts for everything (next page, prev page, font up/down, theme cycle)

### 7.5 Navigation

- Arrow keys / swipe (mobile) to turn pages
- Click left/right edge of reading area to turn page
- Progress bar at bottom showing % complete
- Page number display (e.g. "Page 42 of 310")
- Jump to chapter via table of contents overlay
- Go-to-page input field

### 7.6 Reading Progress & Bookmarks

- Auto-saves last read position in `localStorage` per file (by file name + size)
- On re-upload of same file, offers to resume from last position
- Up to 20 manual bookmarks per book
- Bookmarks shown as small dots on the progress bar

### 7.7 Fullscreen Mode

- Single keystroke (F or F11) enters immersive fullscreen
- Only the text and a faint progress bar are visible
- Escape or move mouse to top edge reveals the top bar

---

## 8. User Interface Screens

### Screen 1 — Home / Upload
- Clean centred upload zone
- Supported format pills shown below the drop zone
- Recently opened files listed (from localStorage) with resume option
- No navigation, no header, nothing else

### Screen 2 — Reader
- **Top bar:** Book title (truncated), theme switcher, font controls, TOC icon
- **Reading area:** Centred text column, generous padding, chosen theme background fills full window
- **Bottom bar:** Progress bar, page X of Y, previous/next buttons
- **TOC panel:** Slide-in overlay from left, closes on outside click or Escape

---

## 9. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `→` / `Space` / `L` | Next page |
| `←` / `H` | Previous page |
| `F` | Toggle fullscreen |
| `+` / `=` | Increase font size |
| `-` | Decrease font size |
| `T` | Cycle themes |
| `B` | Add bookmark |
| `[` / `]` | Previous / next bookmark |
| `Ctrl + G` | Go to page |
| `Escape` | Close overlay / exit fullscreen |

---

## 10. Technical Architecture

### Stack (v1 — client-side only)

| Layer | Technology |
|-------|-----------|
| Rendering | Vanilla JS or React (TBD) |
| PDF engine | PDF.js by Mozilla (CDN) |
| EPUB engine | epub.js (CDN or bundled) |
| DOCX conversion | mammoth.js |
| Storage | localStorage (no backend) |
| Hosting | Static site — Netlify / Vercel / GitHub Pages |
| Build tool | Vite |

### Key constraints
- No file is ever uploaded to a server — all processing happens in the browser
- Total JS bundle should remain under 500KB gzipped (excluding PDF.js which is lazy-loaded)
- Must work offline after first load (Service Worker for PWA in v2)

---

## 11. Accessibility

- WCAG AA contrast ratio on all themes verified
- Full keyboard navigation — no mouse required
- Font size goes up to 28px minimum for low-vision users
- Screen reader support for navigation controls
- `prefers-reduced-motion` media query respected — no animations

---

## 12. Performance Targets

| Metric | Target |
|--------|--------|
| Time to first page render (PDF, 5MB) | < 2 seconds |
| Page turn response | < 100ms |
| Memory usage (200-page PDF) | < 150MB |
| Initial page load (empty state) | < 1 second |

---

## 13. Success Metrics

- Average reading session length > 15 minutes (indicates comfort)
- Return rate — users re-uploading same or new books
- Theme usage breakdown (validates which themes are preferred)
- Bookmark and progress-resume usage rate

---

## 14. Phased Roadmap

### Phase 1 — MVP (4–6 weeks)
- PDF and EPUB rendering
- Sepia + Dark + Soft White themes
- Font size and line height controls
- Progress bar and page navigation
- localStorage for last position

### Phase 2 — Polish (2–3 weeks)
- Table of contents overlay
- Bookmarks with dot markers on progress bar
- Fullscreen mode
- Keyboard shortcuts
- TXT and Markdown support
- PWA / offline support

### Phase 3 — Power Features (future)
- Text highlighting and annotations saved locally
- In-book search (Ctrl+F)
- DOCX support via mammoth.js
- Export highlights as Markdown notes
- Optional: cloud sync with user account

---

## 15. Open Questions

1. Should the reader support two-page spread layout for wide screens (like a physical book)?
2. Should font choices include a dyslexia-friendly font like OpenDyslexic?
3. For EPUB files with custom CSS, how much of the author's styling should be preserved vs overridden by the reader's theme?
4. Should bookmarks and progress survive a browser cache clear (i.e., do we need optional account/sync in v2)?

---

*End of PRD v1.0*