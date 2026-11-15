#!/usr/bin/env node
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import toHast from "mdast-util-to-hast";
import raw from "hast-util-raw";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import unified from "unified";
import vfile from "vfile";

const require = createRequire(import.meta.url);
const project = fileURLToPath(new URL("../", import.meta.url));
const help = "사용법: node scripts/review-voice.mjs <원고.md>";
const referenceLabel = /^(?:참고(?:\s*(?:자료|문헌|링크))?|레퍼런스|references|sources)$/i;

function plain(node) {
  if (node.type === "text") return node.value;
  if (node.tagName === "img") return node.properties.alt || "";
  const parts = (node.children || []).map(plain);
  if (node.tagName === "tr") return parts.map(text => text.trim()).filter(Boolean).join(" | ");
  return parts.join("");
}

function imageParagraph(node) {
  if (node.tagName !== "p") return false;
  const children = node.children.filter(child => child.type !== "text" || child.value.trim());
  return children.length === 1 && (children[0].tagName === "img"
    || (children[0].tagName === "a" && children[0].children[0]?.tagName === "img"));
}

function readingBlocks(source) {
  // 줄 번호는 프런트매터까지 포함한 편집기 기준이다.
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/, match => match.replace(/[^\n]/g, " "));
  const ast = unified().use(remarkParse).use(remarkGfm).parse(body);
  const tree = raw(toHast(ast, { allowDangerousHtml: true }), vfile(body));
  const blocks = [];
  let referenceDepth = 0;
  for (const node of tree.children) {
    if (node.type !== "element" || !node.position || ["script", "style"].includes(node.tagName)) continue;
    const depth = /^h[1-6]$/.test(node.tagName) ? Number(node.tagName[1]) : 0;
    const title = plain(node).trim();
    if (referenceDepth && depth && depth <= referenceDepth) referenceDepth = 0;
    if (depth && referenceLabel.test(title)) referenceDepth = depth;
    if (referenceDepth) continue;

    const kinds = { h2: "절", h3: "소절", table: "표", pre: "코드", figure: "그림", img: "그림" };
    const kind = imageParagraph(node) ? "그림" : kinds[node.tagName];
    const sample = ["pre", "table"].includes(node.tagName) ? title.split("\n")[0] : title;
    const excerpt = sample.replace(/\s+/g, " ").trim();
    if (!kind && !excerpt) continue;
    blocks.push({ line: node.position.start.line, kind, excerpt, paragraph: node.tagName === "p" && !kind });
  }
  return blocks;
}

function sampleParagraphPairs(blocks, selected) {
  const pairs = [];
  for (let i = 0; i < blocks.length - 1; i++) {
    if (blocks[i].paragraph && blocks[i + 1].paragraph && !(selected.has(i) && selected.has(i + 1))) {
      pairs.push(i);
    }
  }
  // 앞부분의 질문만 계속 뽑지 않도록 원고 전반과 후반에서 한 쌍씩 읽는다.
  const middle = Math.ceil(pairs.length / 2);
  for (const section of [pairs.slice(0, middle), pairs.slice(middle)]) {
    if (!section.length) continue;
    const index = section.find(i => /[?？]/.test(blocks[i].excerpt))
      ?? section[Math.floor(section.length / 2)];
    selected.add(index);
    selected.add(index + 1);
  }
}

function worksheet(blocks) {
  if (!blocks.length) throw new Error("검토할 원고 본문이 없습니다.");
  const selected = new Set([0, blocks.length - 1]);
  blocks.forEach((block, index) => {
    if (block.kind) {
      for (const i of [index - 1, index, index + 1]) selected.add(i);
    }
  });
  sampleParagraphPairs(blocks, selected);
  const rows = [];
  let previousIndex = -1;
  for (const [index, block] of blocks.entries()) {
    if (!selected.has(index)) continue;
    if (index > previousIndex + 1) rows.push("  …");
    previousIndex = index;
    const sample = block.excerpt.length > 110 ? block.excerpt.slice(0, 109) + "…" : block.excerpt;
    rows.push(`L${block.line} [${block.kind || "본문"}] ${sample}`.trimEnd());
  }
  return [
    "원고 읽기 메모",
    "앞뒤 문단을 이어 읽는다. 코드나 그림을 만나면 바로 앞의 설명과 맞춰 본다.",
    "", ...rows, "", "편집 기준과 검토 기록 양식은 editorial/voice-review.md에서 확인한다.",
  ].join("\n");
}

function postSlug(entry) {
  const { dir, name } = path.parse(entry);
  const segments = dir ? dir.split(path.sep) : [];
  if (name !== "index") segments.push(name);
  return segments.length ? "/" + segments.join("/") + "/" : "/";
}

function readEpisode(entry, source, blocks = readingBlocks(source)) {
  const paragraphs = blocks.filter(block => block.paragraph && !referenceLabel.test(block.excerpt));
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] || "";
  const date = /^date:\s*(.+)$/m.exec(frontmatter)?.[1].trim().replace(/^["']|["']$/g, "") || "";
  return { entry, fields: { slug: postSlug(entry) }, frontmatter: { date }, 도입: paragraphs[0], 맺음: paragraphs.at(-1) };
}

function sentenceStarts(excerpt) {
  const phrases = new Set();
  for (const sentence of excerpt.split(/(?<=[.!?。！？])\s+/u)) {
    const words = sentence.split(/\s+/u);
    // 짧은 접속사나 기술 명칭 하나만으로 말투가 반복됐다고 볼 수 없다.
    for (let size = 4; size <= Math.min(8, words.length); size++) {
      const phrase = words.slice(0, size).join(" ");
      if (phrase.length >= 12 && /[가-힣]/u.test(phrase)) phrases.add(phrase);
    }
  }
  return phrases;
}

function repeatedPhrasing(episodes, current) {
  const rows = [];
  for (const edge of ["도입", "맺음"]) {
    const occurrences = new Map();
    for (const episode of episodes) {
      for (const phrase of sentenceStarts(episode[edge]?.excerpt || "")) {
        if (!occurrences.has(phrase)) occurrences.set(phrase, []);
        occurrences.get(phrase).push(episode);
      }
    }
    const match = [...occurrences]
      .filter(([, posts]) => posts.includes(current) && posts.length >= 3)
      .sort(([a], [b]) => b.length - a.length)[0];
    if (!match) continue;
    const [phrase, posts] = match;
    rows.push(`${edge} “${phrase}”`, ...posts.map(post => `  ${post.entry} L${post[edge].line}`));
  }
  return rows.length ? ["겹친 표현", ...rows] : [];
}

function edgeExcerpt(block, edge) {
  const { excerpt } = block;
  if (excerpt.length <= 110) return excerpt;
  if (edge === "맺음") return "…" + excerpt.slice(-109).replace(/^\S*\s+/, "");
  return excerpt.slice(0, 109).replace(/\s+\S*$/, "") + "…";
}

export function seriesContext(root, file, currentSource, currentBlocks) {
  const postsDir = path.join(root, "contents/posts");
  const currentEntry = path.relative(postsDir, file);
  if (currentEntry.startsWith(".." + path.sep) || path.isAbsolute(currentEntry)) return "";
  const rulesFile = path.join(root, "src/utils/seriesRules.js");
  if (!fs.existsSync(rulesFile)) return "";
  const { matchSeries, sortSeriesPosts } = require(rulesFile);
  const rule = matchSeries(postSlug(currentEntry));
  if (!rule) return "";

  const entries = new Set(fs.readdirSync(postsDir, { recursive: true }).filter(entry => /\.md$/i.test(entry)));
  entries.add(currentEntry); // Claude의 Write 훅은 새 파일이 생기기 전에 실행된다.
  const episodes = [];
  for (const entry of entries) {
    if (matchSeries(postSlug(entry))?.id !== rule.id) continue;
    episodes.push(entry === currentEntry
      ? readEpisode(entry, currentSource || "", currentBlocks)
      : readEpisode(entry, fs.readFileSync(path.join(postsDir, entry), "utf8")));
  }
  if (episodes.length < 2) return "";
  const ordered = sortSeriesPosts(rule, episodes);
  const index = ordered.findIndex(post => post.entry === currentEntry);
  const rows = [`같은 연재 「${rule.name}」`];
  for (const post of ordered.slice(Math.max(0, index - 1), index + 2)) {
    rows.push(`${post.entry}${post === ordered[index] ? " (현재 원고)" : ""}`);
    if (post.도입 && post.도입 === post.맺음) {
      rows.push(`  본문 L${post.도입.line} ${edgeExcerpt(post.도입, "도입")}`);
      continue;
    }
    for (const edge of ["도입", "맺음"]) {
      if (post[edge]) rows.push(`  ${edge} L${post[edge].line} ${edgeExcerpt(post[edge], edge)}`);
    }
  }
  rows.push(...repeatedPhrasing(ordered, ordered[index]));
  return rows.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === "--help") {
      console.log(help);
    } else {
      if (args.length !== 1 || !/\.md$/i.test(args[0])) throw new Error(help);
      const file = path.resolve(args[0]);
      const source = fs.readFileSync(file, "utf8");
      const blocks = readingBlocks(source);
      console.log([worksheet(blocks), seriesContext(project, file, source, blocks)].filter(Boolean).join("\n\n"));
    }
  } catch (error) {
    console.error(`원고 검토 오류: ${error.message}`);
    process.exitCode = 1;
  }
}
