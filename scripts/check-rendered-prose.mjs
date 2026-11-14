#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import parse5 from "parse5";

const root = path.resolve(process.argv[2] || "public");
const excluded = new Set(["script", "style", "template", "samp", "kbd", "annotation"]);
const labels = new Set(["alt", "title", "aria-label", "aria-description", "placeholder", "label"]);
const counts = { html: 0, svg: 0, errors: 0 };

function textContent(node) {
  return node.value ?? (node.childNodes || []).map(textContent).join("");
}

function checkFile(file) {
  const tree = parse5.parse(readFileSync(file, "utf8"), {
    sourceCodeLocationInfo: true,
    scriptingEnabled: false,
  });
  function inspect(value, startLine) {
    for (const [index, line] of value.split("\n").entries()) {
      const prose = line.replace(/(?:https?:\/\/|mailto:)[^\s<>"')]+/gi, "");
      const at = prose.search(/[§·]/u);
      if (at < 0) continue;
      const excerpt = prose.slice(Math.max(0, at - 35), at + 36).trim();
      console.error(`${path.relative(root, file)}:${startLine + index}: ${excerpt}`);
      counts.errors++;
    }
  }
  function visit(node) {
    const line = node.sourceCodeLocation?.startLine || 1;
    if (node.nodeName === "#text") {
      inspect(node.value, line);
      return;
    }
    const attrs = Object.fromEntries((node.attrs || []).map(a => [a.name, a.value]));
    const tag = node.tagName;
    for (const [name, value] of Object.entries(attrs)) {
      const meta = tag === "meta" && name === "content" && /(?:^|:)(?:title|description)$/.test(attrs.name || attrs.property || "");
      const button = tag === "input" && name === "value" && ["button", "submit", "reset"].includes(attrs.type);
      if (labels.has(name) || meta || button) inspect(value, node.sourceCodeLocation.attrs[name].startLine);
    }
    if (tag === "pre" || tag === "code") {
      // Mermaid is emitted as code in Gatsby's HTML and rendered as a figure in the browser.
      const code = tag === "pre" ? node.childNodes.find(child => child.tagName === "code") : node;
      const classes = [attrs.class, code?.attrs?.find(a => a.name === "class")?.value].join(" ");
      if (/(?:^|\s)(?:(?:lang|language)-)?mermaid(?:\s|$)/.test(classes)) {
        const source = textContent(code || node);
        for (const [i, row] of source.split("\n").entries()) {
          if (!/^\s*(?:%%|classDef\s|style\s|linkStyle\s|click\s)/.test(row)) inspect(row, (code?.sourceCodeLocation?.startLine || line) + i);
        }
      } else if (tag === "code" && /^(?:·|§(?:\s*\d+(?:\.\d+)*)?)$/.test(textContent(node).trim())) {
        inspect(textContent(node), line);
      }
      return;
    }
    if (!excluded.has(tag)) for (const child of node.childNodes || []) visit(child);
  }
  visit(tree);
}

function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (entry.isFile() && /\.(?:html?|svg)$/i.test(file)) {
      counts[/\.svg$/i.test(file) ? "svg" : "html"]++;
      checkFile(file);
    }
  }
}

try {
  scan(root);
  if (!counts.html) throw new Error(`${root}에 검사할 HTML 파일이 없습니다.`);
  console.log(`빌드 결과 HTML ${counts.html}개, SVG ${counts.svg}개 검사, 오류 ${counts.errors}개`);
  if (counts.errors) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
