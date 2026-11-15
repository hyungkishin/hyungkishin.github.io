#!/usr/bin/env node
import fs from "node:fs";
import toHast from "mdast-util-to-hast";
import raw from "hast-util-raw";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import unified from "unified";
import vfile from "vfile";

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
    if (depth && /^(?:참고\s*(?:자료|문헌|링크)|레퍼런스|references|sources)$/i.test(title)) referenceDepth = depth;
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

function worksheet(source) {
  const blocks = readingBlocks(source);
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
    "다음 코드나 그림을 보기 직전, 앞 문장에서 무엇이 궁금해졌는가?",
    "예상과 다른 값이 처음 보인 줄을 찾는다. 어느 출력이나 코드에서 그 짐작을 확인할 수 있는가?",
    "앞뒤를 소리 내어 읽는다. 빈 줄 하나를 둔다면, 어느 말을 독자가 잠깐 더 생각할 수 있는가?",
    "", ...rows, "", "편집 기준과 검토 기록 양식은 editorial/voice-review.md에서 확인한다.",
  ].join("\n");
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !/\.md$/i.test(args[0])) throw new Error("사용법: node scripts/review-voice.mjs <원고.md>");
  console.log(worksheet(fs.readFileSync(args[0], "utf8")));
} catch (error) {
  console.error(`원고 검토 오류: ${error.message}`);
  process.exitCode = 1;
}
