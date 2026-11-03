import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const { findSeriesById } = require('../utils/seriesRules.js');
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const readerDirectory = fileURLToPath(new URL('./', import.meta.url));
const origin = 'https://hyungkishin.github.io';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

async function readSourceAssets(directory) {
  const assets = new Map();
  async function visit(relativeDirectory) {
    const entries = await readdir(path.join(directory, relativeDirectory), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory() && (relativePath === 'evidence' || relativePath.startsWith('evidence/'))) {
        await visit(relativePath);
      } else if (entry.isFile() && (relativePath.startsWith('evidence/') || entry.name.endsWith('.svg'))) {
        assets.set(relativePath, await readFile(path.join(directory, relativePath)));
      }
    }
  }
  await visit('');
  return assets;
}

function svgInformation(content, fileName) {
  const document = new JSDOM(content.toString(), { contentType: 'image/svg+xml' }).window.document;
  const svg = document.documentElement;
  const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) {
    throw new Error(`유효한 SVG viewBox가 필요합니다: ${fileName}`);
  }
  return {
    width: viewBox[2], height: viewBox[3],
    title: document.querySelector('title')?.textContent || fileName,
    animated: /@keyframes\b|<animate(?:Motion|Transform)?\b|<set\b/i.test(content.toString()),
  };
}

function createDiagram(document, image, post) {
  const source = image.getAttribute('src') || '';
  const fileName = path.posix.basename(new URL(source, origin + post.slug).pathname).replace(/-[a-f0-9]{32}(?=\.svg$)/i, '');
  if (!fileName.endsWith('.svg') || !post.assets.has(fileName)) return null;
  const information = svgInformation(post.assets.get(fileName), fileName);
  const label = image.getAttribute('alt') || information.title;
  const url = post.slug + fileName;
  const figure = document.createElement('figure');
  figure.className = 'diagram';
  figure.innerHTML = `<div class="diagram-frame"><object type="image/svg+xml" data="${escapeHtml(url)}" aria-label="${escapeHtml(label)}" style="aspect-ratio:${information.width}/${information.height}"${information.animated ? ' data-animated="true"' : ''}><img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" width="${information.width}" height="${information.height}"></object></div>
    <figcaption>${escapeHtml(label)}</figcaption><div class="diagram-controls">${information.animated ? '<button type="button" class="diagram-toggle" hidden>애니메이션 멈추기</button>' : ''}<a class="diagram-expand" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">그림 확대<span class="visually-hidden">: 새 탭에서 열기</span></a></div>`;
  return figure;
}

function prepareArticle(post) {
  const document = new JSDOM('<!doctype html><html><body><div id="article"></div></body></html>').window.document;
  const article = document.querySelector('#article');
  article.innerHTML = post.html;
  article.querySelectorAll('h1').forEach(heading => {
    const replacement = document.createElement('h2');
    replacement.innerHTML = heading.innerHTML;
    replacement.id = heading.id;
    heading.replaceWith(replacement);
  });
  const oldAnchors = new Map();
  const headings = [...article.querySelectorAll('h2')].map((heading, index) => {
    const id = `section-${index + 1}`;
    if (heading.id) oldAnchors.set(heading.id, id);
    heading.id = id;
    return { id, title: heading.textContent.trim() };
  });
  article.querySelectorAll('a[href]').forEach(anchor => {
    const href = anchor.getAttribute('href');
    if (href.startsWith('#') && oldAnchors.has(href.slice(1))) {
      anchor.setAttribute('href', '#' + oldAnchors.get(href.slice(1)));
      return;
    }
    const target = new URL(href, origin + post.slug);
    if (target.origin !== origin) return;
    const relativePath = target.pathname.startsWith(post.slug) ? target.pathname.slice(post.slug.length) : '';
    if (post.assets.has(relativePath)) anchor.setAttribute('href', post.slug + relativePath + target.hash);
  });
  article.querySelectorAll('img').forEach(image => {
    const figure = createDiagram(document, image, post);
    if (!figure) return;
    let target = image.closest('a') || image;
    const paragraph = target.closest('p');
    if (paragraph && paragraph.textContent.trim() === '' && paragraph.querySelectorAll('img').length === 1) target = paragraph;
    target.replaceWith(figure);
  });
  article.querySelectorAll('table').forEach(table => {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', '표: 가로로 스크롤할 수 있습니다');
    table.replaceWith(wrapper);
    wrapper.append(table);
  });
  return { html: article.innerHTML, headings };
}

function pageShell({ title, description, slug, content, rule, jsonLd }) {
  const canonical = origin + slug;
  const assetPath = rule.indexSlug + 'assets/';
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} | hyungkishin.blog</title>
<meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:type" content="${jsonLd ? 'article' : 'website'}"><meta property="og:site_name" content="hyungkishin.blog">
<meta name="theme-color" content="#ffffff"><link rel="stylesheet" href="${assetPath}reader.css"><script type="module" src="${assetPath}reader.mjs"></script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head><body><a class="skip-link" href="#main">본문으로 건너뛰기</a><progress class="reading-progress" max="100" value="0" aria-label="읽은 위치"></progress>
<header class="site-header"><a class="brand" href="/">hyungkishin.blog</a><a class="series-home" href="${rule.indexSlug}">${escapeHtml(rule.name)}</a></header>
${content}
<footer class="site-footer"><a href="/">hyungkishin.blog</a><span>측정한 범위와 설명할 수 있는 범위를 구분합니다.</span></footer></body></html>`;
}

function renderPost(post, index, posts, rule) {
  const article = prepareArticle(post);
  const previous = posts[index - 1];
  const next = posts[index + 1];
  const date = post.frontmatter.isoDate || post.frontmatter.date || '';
  const update = post.frontmatter.isoUpdate || date;
  const content = `<main id="main" class="reader"><article>
<header class="article-header"><a class="series-position" href="${rule.indexSlug}">${escapeHtml(rule.name)} / ${index + 1}편</a><h1>${escapeHtml(post.title)}</h1><div class="article-meta"><time datetime="${escapeHtml(date)}">${escapeHtml(date.slice(0, 10))}</time><ul class="tags" aria-label="주제">${(post.frontmatter.tags || []).map(tag => `<li>${escapeHtml(tag)}</li>`).join('')}</ul></div></header>
${article.headings.length ? `<nav class="article-toc" aria-label="글의 목차"><details><summary>이 글의 순서<span>${article.headings.length}개 절</span></summary><ol>${article.headings.map(heading => `<li><a href="#${heading.id}">${escapeHtml(heading.title)}</a></li>`).join('')}</ol></details></nav>` : ''}
<div class="article-body">${article.html}</div>
<nav class="chapter-navigation" aria-label="시리즈 이전 편과 다음 편">${previous ? `<a rel="prev" href="${previous.slug}"><span>이전 편</span><strong>${escapeHtml(previous.title)}</strong></a>` : '<span></span>'}${next ? `<a rel="next" href="${next.slug}"><span>다음 편</span><strong>${escapeHtml(next.title)}</strong></a>` : `<a href="${rule.indexSlug}"><span>시리즈 목차</span><strong>${escapeHtml(rule.name)}</strong></a>`}</nav>
</article></main>`;
  return pageShell({
    title: post.title, description: post.excerpt, slug: post.slug, content, rule,
    jsonLd: { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title,
      description: post.excerpt, url: origin + post.slug, datePublished: date, dateModified: update,
      inLanguage: 'ko-KR', author: { '@type': 'Person', name: 'hyungkishin', url: origin },
      isPartOf: { '@type': 'CreativeWorkSeries', name: rule.name, url: origin + rule.indexSlug } },
  });
}

function renderHub(posts, rule) {
  const readingLinks = indices => indices.map(index => `<a href="${posts[index].slug}">${index + 1}편 ${escapeHtml(posts[index].title)}</a>`).join('');
  const content = `<main id="main" class="reader series-index"><header class="article-header"><p class="series-position">백엔드 / ${posts.length}편의 글</p><h1>${escapeHtml(rule.name)}</h1><p class="series-introduction">${escapeHtml(rule.tagline)}. 한 건의 요청이 걸린 시간과 업무가 끝났다는 판단을 함께 따라갑니다.</p></header>
<section class="reader-paths" aria-labelledby="choose-path"><h2 id="choose-path">필요한 지점부터 읽기</h2><dl><div><dt>시간을 재고 실행을 해석할 때</dt><dd>${readingLinks([0, 1])}</dd></div><div><dt>송금 결과와 메시지 처리를 설계할 때</dt><dd>${readingLinks([2, 3])}</dd></div><div><dt>DB 접근 비용을 확인할 때</dt><dd>${readingLinks([4])}</dd></div></dl></section>
<section aria-labelledby="series-contents"><h2 id="series-contents">시리즈 목차</h2><ol class="chapter-list">${posts.map((post, index) => `<li><span class="chapter-number">${String(index + 1).padStart(2, '0')}</span><div><h3><a href="${post.slug}">${escapeHtml(post.title)}</a></h3><p>${escapeHtml(post.excerpt)}</p></div></li>`).join('')}</ol></section></main>`;
  return pageShell({ title: rule.name, description: rule.tagline, slug: rule.indexSlug, content, rule });
}

export async function buildTransferSeries({ publicDir, outputDir, sourceRoot = path.join(projectRoot, 'contents/posts') }) {
  const rule = findSeriesById('transfer-performance');
  if (!rule?.slugs || rule.slugs.length !== 5) throw new Error('transfer-performance 시리즈에 다섯 편의 경로가 필요합니다.');
  const posts = [];
  for (const slug of rule.slugs) {
    const dataPath = path.join(publicDir, 'page-data', slug, 'page-data.json');
    let data;
    try { data = JSON.parse(await readFile(dataPath, 'utf8')); }
    catch (error) { throw new Error(`페이지 데이터를 읽을 수 없습니다: ${slug} (${error.message})`, { cause: error }); }
    const post = data.result?.data?.markdownRemark;
    if (!post || typeof post.html !== 'string' || !post.frontmatter?.title || post.fields?.slug !== slug) {
      throw new Error(`글의 본문, 제목, 경로가 올바르지 않습니다: ${slug}`);
    }
    const assets = await readSourceAssets(path.join(sourceRoot, slug));
    posts.push({ ...post, slug, title: post.frontmatter.title, excerpt: post.excerpt || '', assets });
  }
  // 모든 입력을 읽고 렌더한 뒤 쓰기 시작해, 누락된 편이 있는 시리즈를 남기지 않는다.
  const pages = posts.map((post, index) => ({ slug: post.slug, html: renderPost(post, index, posts, rule) }));
  pages.unshift({ slug: rule.indexSlug, html: renderHub(posts, rule) });
  const readerAssets = await Promise.all(['reader.css', 'reader.mjs'].map(async name => [name, await readFile(path.join(readerDirectory, name))]));
  for (const page of pages) {
    const directory = path.join(outputDir, page.slug);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.html'), page.html);
  }
  for (const post of posts) {
    for (const [relativePath, content] of post.assets) {
      const destination = path.join(outputDir, post.slug, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }
  }
  const assetsDirectory = path.join(outputDir, rule.indexSlug, 'assets');
  await mkdir(assetsDirectory, { recursive: true });
  for (const [name, content] of readerAssets) await writeFile(path.join(assetsDirectory, name), content);
  return { outputDir, routes: pages.map(page => page.slug) };
}
