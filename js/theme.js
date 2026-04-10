// Theme + typography application. Writes to <body> class/dataset + CSS custom props.

const THEMES = ['sepia', 'soft', 'dark', 'grey'];

export function applyPrefs(prefs) {
  const body = document.body;

  // Theme class
  THEMES.forEach((t) => body.classList.remove(`theme-${t}`));
  body.classList.add(`theme-${prefs.theme}`);

  // Font family via data attribute (CSS picks the family)
  body.dataset.font = prefs.fontFamily;

  // Typography via CSS variables
  const root = document.documentElement;
  root.style.setProperty('--reader-size', `${prefs.fontSize}px`);
  root.style.setProperty('--reader-line-height', String(prefs.lineHeight));
  root.style.setProperty('--reader-line-width', `${prefs.lineWidth}px`);
  root.style.setProperty('--reader-letter-spacing', `${prefs.letterSpacing}em`);
  root.style.setProperty('--reader-zoom', String(prefs.zoom || 1));
}

export function cycleTheme(current) {
  const idx = THEMES.indexOf(current);
  return THEMES[(idx + 1) % THEMES.length];
}
