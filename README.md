# Stillpage

A minimal, eye-friendly eBook reader that runs entirely in your browser. No sign-up, no install — drag and drop a file and start reading.

Inspired by the calm reading experience of Kindle, built for anyone who spends long hours reading PDFs, EPUBs, or text files on screen.

![Stillpage home screen](https://img.shields.io/badge/status-v1.0-green) ![No backend](https://img.shields.io/badge/backend-none-blue) ![License](https://img.shields.io/badge/license-MIT-yellow)

## Features

- **Eye-comfort themes** — Sepia, Soft White, Dark (night mode), Paper Grey. No harsh whites or pure blacks.
- **Typography controls** — Font family (serif / sans / mono), size (14–28px), line height, line width, letter spacing.
- **PDF, EPUB, TXT, Markdown** support via PDF.js and epub.js.
- **Paginated & scroll view** — switch between book-style pages and continuous scrolling.
- **Distraction-free** — top bar auto-hides after 3 seconds; bottom bar stays minimal.
- **Keyboard-first** — full shortcut set for navigation, themes, font size, bookmarks, fullscreen.
- **Bookmarks** — up to 20 per book, shown as dots on the progress bar.
- **Reading progress** — auto-saves your position per file in localStorage. Resume where you left off.
- **Table of contents** — slide-in overlay for EPUBs and PDFs with outlines.
- **Fullscreen mode** — immersive reading with a single keystroke.
- **100% client-side** — your files never leave your browser. Zero server, zero tracking.

## Getting Started

No build step required. Serve the files with any static server:

```bash
# Using Python
python3 -m http.server 5173

# Using Node
npx serve .

# Using PHP
php -S localhost:5173
```

Open `http://localhost:5173` in your browser and drop a file.

## Keyboard Shortcuts

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
| `Ctrl+G` | Go to page |
| `Esc` | Close overlay / exit fullscreen / back to home |

## Supported Formats

| Format | Status | Engine |
|--------|--------|--------|
| PDF | Supported | [PDF.js](https://mozilla.github.io/pdf.js/) (lazy-loaded from CDN) |
| EPUB | Supported | [epub.js](https://github.com/futurepress/epub.js) |
| TXT | Supported | Native |
| Markdown | Supported | Built-in renderer |
| DOCX | Planned | mammoth.js |

## Project Structure

```
├── index.html            # Single-page shell (home + reader + panels)
├── css/
│   └── styles.css        # Themes, typography, layout
└── js/
    ├── main.js           # App orchestration, UI, shortcuts
    ├── storage.js        # localStorage helpers (prefs, recents, bookmarks)
    ├── theme.js          # Theme + typography application
    ├── reader-pdf.js     # PDF.js integration
    ├── reader-epub.js    # epub.js integration
    └── reader-text.js    # TXT & Markdown renderer
```

## Tech Stack

- Vanilla JavaScript (ES modules, no framework)
- CSS custom properties for theming
- [PDF.js](https://mozilla.github.io/pdf.js/) — Mozilla's PDF renderer (CDN, lazy-loaded)
- [epub.js](https://github.com/futurepress/epub.js) — EPUB rendering (CDN)
- localStorage for persistence
- Zero build tools, zero dependencies to install

## Roadmap

- [ ] PWA / offline support (Service Worker)
- [ ] DOCX support via mammoth.js
- [ ] Text highlighting and annotations
- [ ] In-book search
- [ ] Export highlights as Markdown
- [ ] Dyslexia-friendly font option (OpenDyslexic)
- [ ] Two-page spread for wide screens

## License

MIT
