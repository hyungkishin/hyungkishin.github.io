import { bindDiagram } from './diagram.mjs';

function bindTheme(document, window) {
  const button = document.querySelector('.theme-toggle');
  if (!button) return;
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  function update() {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : system.matches;
    button.dataset.dark = String(dark);
    button.title = dark ? '밝은 화면으로 전환' : '어두운 화면으로 전환';
    button.setAttribute('aria-label', button.title);
    document.querySelector('meta[name="theme-color"]').content = dark ? '#101929' : '#ffffff';
  }
  button.hidden = false;
  button.addEventListener('click', () => {
    const next = button.dataset.dark === 'true' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { window.localStorage.setItem('theme', next); } catch { /* 저장이 제한된 환경에서도 현재 화면에는 적용한다. */ }
    update();
  });
  system.addEventListener('change', update);
  update();
}

export function initReader(document, window) {
  bindTheme(document, window);
  const toc = document.querySelector('.article-toc details');
  if (toc) {
    const desktop = window.matchMedia('(min-width: 1200px)');
    const showToc = () => { toc.open = desktop.matches; };
    showToc();
    desktop.addEventListener('change', showToc);
  }
  const progress = document.querySelector('.reading-progress');
  function updateProgress() {
    if (!progress) return;
    const scrollRange = document.documentElement.scrollHeight - window.innerHeight;
    progress.value = scrollRange > 0 ? Math.max(0, Math.min(100, window.scrollY / scrollRange * 100)) : 100;
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  window.addEventListener('load', updateProgress, { once: true });
  updateProgress();
  document.querySelectorAll('.diagram').forEach(figure => bindDiagram(figure, window));
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initReader(document, window), { once: true });
  else initReader(document, window);
}
