import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(projectRoot, 'scripts/build-transfer-series.mjs');
const slugs = [
  '/backend/transfer-performance/01-measurement/',
  '/backend/transfer-performance/02-jvm-execution/',
  '/backend/transfer-performance/03-transfer-contract/',
  '/backend/transfer-performance/04-kafka-redis/',
  '/backend/transfer-performance/05-jpa-access/',
];

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'transfer-reader-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, 'public');
  const outputDir = path.join(root, 'output');
  for (let index = 0; index < slugs.length; index += 1) {
    const dataDir = path.join(publicDir, 'page-data', slugs[index]);
    await mkdir(dataDir, { recursive: true });
    const title = index === 1 ? 'JVM "<script>unsafe()</script>" & 실행' : `백엔드 ${index + 1}편`;
    const html = '<h2 id="original-heading">측정 조건</h2><p>실행으로 확인한 범위만 주장한다.</p>'
      + '<p><a href="#original-heading">같은 절로 돌아가기</a></p>'
      + '<h2>해석의 한계</h2><p>운영 결과로 확대하지 않는다.</p>'
      + (index === 1 ? '<p><img src="/static/01-stack-machine-f403285c3ec9eb52068d1448cba586f5.svg" alt="JVM 값의 이동"></p>'
        + '<p><a href="./evidence/HelloLoop.java">재현 소스</a></p>' : '');
    await writeFile(path.join(dataDir, 'page-data.json'), JSON.stringify({
      path: slugs[index], result: { data: { markdownRemark: {
        html, excerpt: '실행 범위와 한계를 확인하는 글.',
        fields: { slug: slugs[index] },
        frontmatter: { title, isoDate: '2026-11-04', isoUpdate: '2026-11-04', tags: ['Java', 'JVM'] },
      } } },
    }));
  }
  return { root, publicDir, outputDir };
}

function runBuild(paths) {
  return spawnSync(process.execPath, [cli, '--public-dir', paths.publicDir, '--output-dir', paths.outputDir], {
    cwd: projectRoot, encoding: 'utf8', timeout: 30_000,
  });
}

async function page(paths, slug) {
  return new JSDOM(await readFile(path.join(paths.outputDir, slug, 'index.html'), 'utf8')).window.document;
}

test('빌더가 시리즈 여섯 경로를 만들고 기존 출력 경로를 보존한다', async t => {
  const paths = await fixture(t);
  await mkdir(path.join(paths.outputDir, 'existing'), { recursive: true });
  await writeFile(path.join(paths.outputDir, 'existing/keep.txt'), '기존 배포 파일');

  const result = runBuild(paths);
  assert.equal(result.status, 0, result.stderr);

  const hub = await page(paths, '/backend/transfer-performance/');
  assert.deepEqual([...hub.querySelectorAll('.chapter-list a')].map(a => a.getAttribute('href')), slugs);
  for (const slug of slugs) assert.equal((await page(paths, slug)).querySelectorAll('h1').length, 1);
  assert.equal(await readFile(path.join(paths.outputDir, 'existing/keep.txt'), 'utf8'), '기존 배포 파일');
  assert.deepEqual((await readdir(path.join(paths.outputDir, 'backend/transfer-performance'))).sort(), [
    '01-measurement', '02-jvm-execution', '03-transfer-contract', '04-kafka-redis', '05-jpa-access', 'assets', 'index.html',
  ]);
});

test('제목을 HTML로 실행하지 않고 원문과 절 링크를 보존한다', async t => {
  const paths = await fixture(t);
  const result = runBuild(paths);
  assert.equal(result.status, 0, result.stderr);
  const document = await page(paths, slugs[1]);

  assert.equal(document.querySelector('h1').textContent, 'JVM "<script>unsafe()</script>" & 실행');
  assert.equal(document.title, 'JVM "<script>unsafe()</script>" & 실행 | hyungkishin.blog');
  assert.equal(document.querySelector('h1 script'), null);
  assert.equal(document.querySelector('link[rel="canonical"]').href, 'https://hyungkishin.github.io/backend/transfer-performance/02-jvm-execution/');
  assert.equal(document.querySelector('meta[property="og:title"]').content, 'JVM "<script>unsafe()</script>" & 실행');
  assert.equal(document.querySelector('.article-body p').textContent, '실행으로 확인한 범위만 주장한다.');
  assert.deepEqual([...document.querySelectorAll('.article-body h2')].map(h => h.id), ['section-1', 'section-2']);
  assert.deepEqual([...document.querySelectorAll('.article-toc a')].map(a => a.hash), ['#section-1', '#section-2']);
  assert.equal(document.querySelector('.article-body a').hash, '#section-1');
  assert.equal(document.querySelector('[rel="prev"]').getAttribute('href'), slugs[0]);
  assert.equal(document.querySelector('[rel="next"]').getAttribute('href'), slugs[2]);
  assert.equal((await page(paths, slugs[0])).querySelector('[rel="prev"]'), null);
  assert.equal((await page(paths, slugs[4])).querySelector('[rel="next"]'), null);
  const jsonLd = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
  assert.equal(jsonLd.headline, 'JVM "<script>unsafe()</script>" & 실행');
});

test('SVG를 별도 문서로 연결하고 재현 파일과 자체 자산만 복사한다', async t => {
  const paths = await fixture(t);
  const result = runBuild(paths);
  assert.equal(result.status, 0, result.stderr);
  const document = await page(paths, slugs[1]);
  const object = document.querySelector('figure object[type="image/svg+xml"]');

  assert.ok(object);
  assert.equal(object.getAttribute('data'), `${slugs[1]}01-stack-machine.svg`);
  assert.equal(object.getAttribute('aria-label'), 'JVM 값의 이동');
  assert.ok(object.querySelector('img[alt="JVM 값의 이동"]'));
  assert.equal(document.querySelector('.diagram-toggle').textContent, '애니메이션 멈추기');
  assert.equal(document.querySelector('.diagram-expand').getAttribute('target'), '_blank');
  assert.equal(document.querySelector('a[href$="HelloLoop.java"]').getAttribute('href'), `${slugs[1]}evidence/HelloLoop.java`);
  assert.match(await readFile(path.join(paths.outputDir, slugs[1], 'evidence/HelloLoop.java'), 'utf8'), /class HelloLoop/);
  assert.match(await readFile(path.join(paths.outputDir, slugs[1], '01-stack-machine.svg'), 'utf8'), /viewBox="0 0 960 620"/);
  for (const element of document.querySelectorAll('script[src], link[rel="stylesheet"]')) {
    const url = element.getAttribute('src') || element.getAttribute('href');
    assert.ok(url.startsWith('/backend/transfer-performance/assets/'), url);
    await readFile(path.join(paths.outputDir, url));
  }
  assert.equal(document.querySelector('[src*="gatsby"], [href*="app-data"]'), null);
});

test('누락한 편이 있으면 일부 시리즈를 발행하지 않고 실패한다', async t => {
  const paths = await fixture(t);
  await rm(path.join(paths.publicDir, 'page-data', slugs[3], 'page-data.json'));
  const result = runBuild(paths);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /04-kafka-redis/);
  const entries = await readdir(paths.outputDir).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
  assert.deepEqual(entries, []);
});

function readerFixture(reducedMotion = false) {
  const dom = new JSDOM('<!doctype html><progress class="reading-progress" max="100"></progress><figure class="diagram"><object data-animated="true"></object><button class="diagram-toggle" hidden>애니메이션 멈추기</button></figure>', { pretendToBeVisual: true });
  const svgDocument = new JSDOM('<svg xmlns="http://www.w3.org/2000/svg"><style>@media (prefers-reduced-motion: no-preference) {.moving {animation: move 2s infinite}} @media (prefers-reduced-motion: reduce) {.moving {animation: none}}</style><rect class="moving"/></svg>', { contentType: 'image/svg+xml' }).window.document;
  // JSDOM에는 Web Animations와 SMIL 실행기가 없으므로 해당 브라우저 경계만 대체한다.
  const animation = { playState: 'running', pause() { this.playState = 'paused'; }, play() { this.playState = 'running'; } };
  svgDocument.getAnimations = () => [animation];
  svgDocument.documentElement.pauseAnimations = function () { this.motionPaused = true; };
  svgDocument.documentElement.unpauseAnimations = function () { this.motionPaused = false; };
  const object = dom.window.document.querySelector('object');
  Object.defineProperty(object, 'contentDocument', { get: () => svgDocument });
  dom.window.matchMedia = () => ({ matches: reducedMotion, addEventListener() {} });
  return { dom, svgDocument, animation, object, button: dom.window.document.querySelector('button') };
}

test('그림 버튼이 SVG 애니메이션을 멈추고 다시 재생한다', async () => {
  const reader = await import('../src/series-reader/reader.mjs');
  assert.equal(typeof reader.initReader, 'function');
  const { dom, object, button, animation, svgDocument } = readerFixture();
  reader.initReader(dom.window.document, dom.window);
  object.dispatchEvent(new dom.window.Event('load'));
  assert.equal(button.hidden, false);

  button.click();
  assert.equal(animation.playState, 'paused');
  assert.equal(svgDocument.documentElement.motionPaused, true);
  assert.equal(button.textContent, '애니메이션 재생하기');
  assert.equal(button.getAttribute('aria-pressed'), 'true');

  button.click();
  assert.equal(animation.playState, 'running');
  assert.equal(svgDocument.documentElement.motionPaused, false);
  assert.equal(button.textContent, '애니메이션 멈추기');
});

test('모션 감소 설정에서는 정지로 시작하고 명시적 재생만 허용한다', async () => {
  const reader = await import('../src/series-reader/reader.mjs');
  assert.equal(typeof reader.initReader, 'function');
  const { dom, object, button, animation, svgDocument } = readerFixture(true);
  reader.initReader(dom.window.document, dom.window);
  object.dispatchEvent(new dom.window.Event('load'));
  assert.equal(animation.playState, 'paused');
  assert.equal(button.textContent, '애니메이션 재생하기');
  assert.match(svgDocument.querySelector('style').textContent, /prefers-reduced-motion: reduce/);

  button.click();
  assert.equal(animation.playState, 'running');
  assert.match(svgDocument.querySelector('style').textContent, /@media all/);
  assert.match(svgDocument.querySelector('style').textContent, /@media not all/);
});

test('읽기 진행률은 문서의 실제 스크롤 범위로 계산하고 백분율 범위를 넘지 않는다', async () => {
  const reader = await import('../src/series-reader/reader.mjs');
  assert.equal(typeof reader.initReader, 'function');
  const { dom } = readerFixture();
  Object.defineProperty(dom.window.document.documentElement, 'scrollHeight', { value: 1800 });
  Object.defineProperty(dom.window, 'innerHeight', { value: 600 });
  Object.defineProperty(dom.window, 'scrollY', { value: 600, writable: true });
  reader.initReader(dom.window.document, dom.window);
  assert.equal(dom.window.document.querySelector('progress').value, 50);
  dom.window.scrollY = 5000;
  dom.window.dispatchEvent(new dom.window.Event('scroll'));
  assert.equal(dom.window.document.querySelector('progress').value, 100);
});
