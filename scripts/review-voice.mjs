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
    blocks.push({ line: node.position.start.line, kind, excerpt });
  }
  return blocks;
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
  const rows = [];
  for (const [index, block] of blocks.entries()) {
    if (!selected.has(index)) continue;
    const sample = block.excerpt.length > 110 ? block.excerpt.slice(0, 109) + "…" : block.excerpt;
    rows.push(`L${block.line} [${block.kind || "본문"}] ${sample}`.trimEnd());
  }
  return [
    "원고 읽기 메모",
    "다음 코드나 그림을 보기 직전, 앞 문장에서 무엇이 궁금해졌는가?",
    "읽다가 막힌 줄에 독자의 질문을 적고, 이어지는 설명에서 그 답을 찾아본다.",
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
