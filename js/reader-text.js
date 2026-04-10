// Plain text & Markdown reader.
// For paginated mode we split on page-height boundaries at runtime.
// For Markdown we do a small, safe subset of formatting (headings, bold/italic,
// code, links, lists, blockquotes) — no third-party library required.

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Minimal Markdown → HTML. Good enough for reading; not a full commonmark parser.
function renderMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inCode = false;
  let listType = null; // 'ul' | 'ol' | null
  let paragraph = [];

  function flushParagraph() {
    if (paragraph.length) {
      out.push('<p>' + inlineFormat(paragraph.join(' ')) + '</p>');
      paragraph = [];
    }
  }
  function closeList() {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  }

  function inlineFormat(s) {
    s = escapeHtml(s);
    // Code spans
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // Italic
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  for (let raw of lines) {
    // Fenced code block toggle
    if (/^```/.test(raw)) {
      flushParagraph();
      closeList();
      if (!inCode) {
        out.push('<pre><code>');
        inCode = true;
      } else {
        out.push('</code></pre>');
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(raw));
      continue;
    }

    // Blank line -> paragraph break
    if (/^\s*$/.test(raw)) {
      flushParagraph();
      closeList();
      continue;
    }

    // Headings
    const h = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (h) {
      flushParagraph();
      closeList();
      const level = h[1].length;
      out.push(`<h${level}>${inlineFormat(h[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(raw)) {
      flushParagraph();
      closeList();
      out.push('<blockquote>' + inlineFormat(raw.replace(/^>\s?/, '')) + '</blockquote>');
      continue;
    }

    // Unordered list item
    if (/^\s*[-*+]\s+/.test(raw)) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push('<li>' + inlineFormat(raw.replace(/^\s*[-*+]\s+/, '')) + '</li>');
      continue;
    }

    // Ordered list item
    if (/^\s*\d+\.\s+/.test(raw)) {
      flushParagraph();
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push('<li>' + inlineFormat(raw.replace(/^\s*\d+\.\s+/, '')) + '</li>');
      continue;
    }

    // Accumulate paragraph line
    closeList();
    paragraph.push(raw.trim());
  }

  flushParagraph();
  closeList();
  if (inCode) out.push('</code></pre>');

  return out.join('\n');
}

export async function createTextReader({ file, container, viewMode }) {
  const text = await file.text();
  const isMarkdown = /\.(md|markdown)$/i.test(file.name);
  const html = isMarkdown
    ? renderMarkdown(text)
    : '<p>' + escapeHtml(text).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br/>') + '</p>';

  container.innerHTML = '';
  const column = document.createElement('div');
  column.className = 'reader-column text-column';
  column.innerHTML = html;
  container.appendChild(column);

  let mode = viewMode || 'paginated';
  let progressCb = null;
  let currentPage = 1;
  let totalPages = 1;

  function measurePages() {
    if (mode !== 'paginated') {
      // In scroll mode, "pages" are viewport-sized scroll offsets
      const h = container.clientHeight || 1;
      totalPages = Math.max(1, Math.ceil(column.scrollHeight / h));
      const top = container.scrollTop;
      currentPage = Math.min(totalPages, Math.max(1, Math.floor(top / h) + 1));
      return;
    }
    // In paginated mode we scroll the column in full-viewport-height chunks.
    const h = container.clientHeight || 1;
    totalPages = Math.max(1, Math.ceil(column.scrollHeight / h));
    currentPage = Math.min(totalPages, Math.max(1, Math.floor(container.scrollTop / h) + 1));
  }

  function goToPagePos(n) {
    const h = container.clientHeight || 1;
    n = Math.max(1, Math.min(totalPages, n));
    container.scrollTo({ top: (n - 1) * h, behavior: 'smooth' });
    currentPage = n;
    emitProgress();
  }

  function emitProgress() {
    measurePages();
    if (progressCb) {
      progressCb({
        currentPage,
        totalPages,
        percent: currentPage / totalPages,
      });
    }
  }

  // Recalculate on resize and scroll
  const onScroll = () => {
    measurePages();
    if (progressCb) emitProgress();
  };
  container.addEventListener('scroll', onScroll);
  const ro = new ResizeObserver(() => {
    measurePages();
    if (progressCb) emitProgress();
  });
  ro.observe(container);
  ro.observe(column);

  // Initial measure after fonts/layout settle
  requestAnimationFrame(() => {
    measurePages();
    emitProgress();
  });

  return {
    type: 'text',
    get totalPages() { return totalPages; },
    get currentPage() { return currentPage; },

    async next() {
      measurePages();
      goToPagePos(currentPage + 1);
    },
    async prev() {
      measurePages();
      goToPagePos(currentPage - 1);
    },
    async goToPage(n) {
      measurePages();
      goToPagePos(n);
    },
    async setViewMode(newMode) {
      mode = newMode;
      measurePages();
      emitProgress();
    },
    applyTypography() {
      // Layout will reflow automatically; just re-measure.
      requestAnimationFrame(() => {
        measurePages();
        emitProgress();
      });
    },
    async getTOC() {
      // Build a TOC from headings in the document.
      const headings = column.querySelectorAll('h1, h2, h3');
      return Array.from(headings).map((h, i) => {
        h.id = h.id || `heading-${i}`;
        return {
          label: h.textContent,
          depth: parseInt(h.tagName.substring(1), 10) - 1,
          target: '#' + h.id,
        };
      });
    },
    async goToTarget(target) {
      if (typeof target === 'string' && target.startsWith('#')) {
        const el = column.querySelector(target);
        if (el) {
          const top = el.offsetTop;
          container.scrollTo({ top, behavior: 'smooth' });
        }
      }
    },
    onProgress(cb) { progressCb = cb; emitProgress(); },
    getPosition() { return { page: currentPage, scrollTop: container.scrollTop }; },
    async setPosition(pos) {
      if (!pos) return;
      if (typeof pos.scrollTop === 'number') {
        container.scrollTo({ top: pos.scrollTop });
      } else if (pos.page) {
        goToPagePos(pos.page);
      }
    },
    destroy() {
      container.removeEventListener('scroll', onScroll);
      ro.disconnect();
      container.innerHTML = '';
    },
  };
}
