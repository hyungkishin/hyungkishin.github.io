export function createDiagramFigure(document, { id, url, title, label, width, height, animated }) {
  const figure = document.createElement('figure');
  figure.id = id;
  figure.className = 'diagram';
  figure.innerHTML = `<div class="diagram-frame" role="region"><object type="image/svg+xml" tabindex="-1"><img></object></div>
    <figcaption><p></p><div class="diagram-controls"><button type="button" class="diagram-toggle" hidden>애니메이션 멈추기</button><button type="button" class="diagram-zoom" hidden aria-expanded="false">그림 확대</button><a class="diagram-expand" target="_blank" rel="noopener noreferrer" aria-label="그림 원본을 새 탭에서 열기">원본 열기</a></div></figcaption>`;
  const frame = figure.querySelector('.diagram-frame');
  frame.id = id + '-frame';
  frame.setAttribute('aria-label', title || label);
  frame.style.setProperty('--detail-width', Math.max(800, width || 0) + 'px');
  const object = frame.querySelector('object');
  object.setAttribute('data', url);
  object.setAttribute('aria-label', label);
  if (animated) object.dataset.animated = String(animated);
  else figure.querySelector('.diagram-toggle').remove();
  const fallback = object.querySelector('img');
  fallback.setAttribute('src', url);
  fallback.alt = label;
  if (width && height) {
    object.style.aspectRatio = width + '/' + height;
    fallback.width = width;
    fallback.height = height;
  }
  figure.querySelector('figcaption p').textContent = label;
  figure.querySelector('.diagram-zoom').setAttribute('aria-controls', frame.id);
  figure.querySelector('.diagram-expand').setAttribute('href', url);
  return figure;
}

export function bindDiagram(figure, window) {
  const unbindPlayback = bindPlayback(figure, window);
  const unbindZoom = bindZoom(figure);
  return () => {
    unbindPlayback?.();
    unbindZoom?.();
  };
}

function bindPlayback(figure, window) {
  const object = figure.querySelector('object[data-animated]');
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
    if (object.dataset.animated === 'auto') {
      const animated = svgDocument.querySelector('animate, animateMotion, animateTransform, set') ||
        [...svgDocument.querySelectorAll('style')].some(style => /@keyframes\b/i.test(style.textContent));
      if (!animated) return;
    }
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

  function togglePlayback() {
    paused = !paused;
    if (!paused) explicitPlayback = true;
    applyPlayback();
  }
  function onPreferenceChange(event) {
    paused = event.matches;
    explicitPlayback = false;
    applyPlayback();
  }
  object.addEventListener('load', applyPlayback);
  button.addEventListener('click', togglePlayback);
  preference.addEventListener?.('change', onPreferenceChange);
  applyPlayback();
  return () => {
    object.removeEventListener('load', applyPlayback);
    button.removeEventListener('click', togglePlayback);
    preference.removeEventListener?.('change', onPreferenceChange);
  };
}

function bindZoom(figure) {
  const frame = figure.querySelector('.diagram-frame');
  const button = figure.querySelector('.diagram-zoom');
  if (!frame || !button) return;
  button.hidden = false;

  function setExpanded(expanded) {
    figure.classList.toggle('is-expanded', expanded);
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? '원래 크기로' : '그림 확대';
    if (expanded) {
      frame.tabIndex = 0;
      frame.focus({ preventScroll: true });
      frame.scrollIntoView?.({ block: 'nearest' });
    } else {
      frame.removeAttribute('tabindex');
      frame.scrollLeft = 0;
      frame.scrollTop = 0;
      button.focus({ preventScroll: true });
    }
  }

  const toggle = () => setExpanded(!figure.classList.contains('is-expanded'));
  const onKeyDown = event => { if (event.key === 'Escape') setExpanded(false); };
  button.addEventListener('click', toggle);
  frame.addEventListener('keydown', onKeyDown);
  return () => {
    button.removeEventListener('click', toggle);
    frame.removeEventListener('keydown', onKeyDown);
  };
}
