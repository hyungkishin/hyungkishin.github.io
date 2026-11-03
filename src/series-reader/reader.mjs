function bindDiagram(figure, window) {
  const object = figure.querySelector('object[data-animated="true"]');
  const button = figure.querySelector('.diagram-toggle');
  if (!object || !button) return;
  const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };
  const originalStyles = new WeakMap();
  let paused = preference.matches;
  let explicitPlayback = false;

  function applyPlayback() {
    let svgDocument;
    try { svgDocument = object.contentDocument; }
    catch (error) {
      button.hidden = true;
      button.setAttribute('aria-label', '이 그림의 애니메이션 제어를 사용할 수 없습니다');
      return;
    }
    if (!svgDocument?.documentElement || svgDocument.documentElement.localName !== 'svg') return;
    svgDocument.querySelectorAll('style:not(#reader-motion-state)').forEach(style => {
      if (!originalStyles.has(style)) originalStyles.set(style, style.textContent);
      const original = originalStyles.get(style);
      const content = explicitPlayback && preference.matches
        ? original.replace(/@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/gi, '@media all')
          .replace(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/gi, '@media not all')
        : original;
      if (style.textContent !== content) style.textContent = content;
    });
    let playbackStyle = svgDocument.querySelector('#reader-motion-state');
    if (!playbackStyle) {
      playbackStyle = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
      playbackStyle.id = 'reader-motion-state';
      svgDocument.documentElement.append(playbackStyle);
    }
    playbackStyle.textContent = paused ? '* { animation-play-state: paused !important; }' : '';
    for (const animation of svgDocument.getAnimations?.() || []) {
      if (paused) animation.pause();
      else animation.play();
    }
    if (paused) svgDocument.documentElement.pauseAnimations?.();
    else svgDocument.documentElement.unpauseAnimations?.();
    svgDocument.documentElement.setAttribute('data-reader-motion', paused ? 'paused' : 'running');
    button.hidden = false;
    button.textContent = paused ? '애니메이션 재생하기' : '애니메이션 멈추기';
    button.setAttribute('aria-pressed', String(paused));
  }

  object.addEventListener('load', applyPlayback);
  button.addEventListener('click', () => {
    paused = !paused;
    if (!paused) explicitPlayback = true;
    applyPlayback();
  });
  preference.addEventListener?.('change', event => {
    paused = event.matches;
    explicitPlayback = false;
    applyPlayback();
  });
  applyPlayback();
}

export function initReader(document, window) {
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
