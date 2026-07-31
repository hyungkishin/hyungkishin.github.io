#!/usr/bin/env node
// 발행 전 게이트. 구조 검사 후 tone-guard와 mermaid-guard를 체인한다.
// 사용: node scripts/post-check.mjs <contents/posts/.../index.md>
// 구조 검사: frontmatter 필수 필드, 날짜 형식, 로컬 자산 참조 실재, em dash, 코드 펜스 짝.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const target = process.argv[2];

if (!target) {
  console.error("Usage: node scripts/post-check.mjs <markdown-file>");
  process.exit(2);
}

const absolute = path.resolve(process.cwd(), target);
let text;

try {
  text = fs.readFileSync(absolute, "utf8");
} catch (error) {
  console.error(`error: cannot read ${target}: ${error.message}`);
  process.exit(2);
}

const postDir = path.dirname(absolute);
let errors = 0;
let warns = 0;

const report = (level, message) => {
  if (level === "error") errors++;
  else warns++;
  console.log(`${level}: ${message}`);
};

// 1. frontmatter
const fm = text.match(/^---\n([\s\S]*?)\n---/);
if (!fm) {
  report("error", "frontmatter가 없다 (--- 블록)");
} else {
  const head = fm[1];
  for (const field of ["title", "date", "tags"]) {
    if (!new RegExp(`^${field}\\s*:`, "m").test(head)) {
      report("error", `frontmatter에 ${field}가 없다`);
    }
  }
  const date = head.match(/^date:\s*"?(\d{4}-\d{2}-\d{2})"?/m);
  if (!date) report("error", "date가 YYYY-MM-DD 형식이 아니다");
  const update = head.match(/^update:\s*"?(\d{4}-\d{2}-\d{2})"?/m);
  if (date && update && update[1] < date[1]) {
    report("error", `update(${update[1]})가 date(${date[1]})보다 앞선다`);
  }
  // YAML 시퀀스는 키와 같은 열에서 시작해도 유효하다. `- x`와 `  - x` 둘 다 받는다.
  const tagBlock = head.match(/^tags:[ \t]*\n((?:[ \t]*-[ \t]*\S.*\n?)*)/m);
  const inlineTags = head.match(/^tags:[ \t]*\[(.*)\]/m);
  const hasTags = (tagBlock && tagBlock[1].trim()) || (inlineTags && inlineTags[1].trim());
  if (!hasTags) {
    report("error", "tags가 비어 있다");
  }
}

// 2. 본문 (frontmatter 제외)
const body = fm ? text.slice(fm[0].length) : text;

// 2-1. 로컬 자산 참조 실재
const refs = new Set();
for (const m of body.matchAll(/\]\((\.\/[^)\s]+)\)/g)) refs.add(m[1]);
for (const m of body.matchAll(/src="(\.\/[^"]+)"/g)) refs.add(m[1]);
for (const ref of refs) {
  const clean = ref.split("#")[0].split("?")[0];
  if (!fs.existsSync(path.resolve(postDir, clean))) {
    report("error", `참조 파일이 없다: ${ref}`);
  }
}

// 2-2. 같은 디렉토리의 자산 중 본문이 참조하지 않는 것
for (const file of fs.readdirSync(postDir)) {
  if (!/\.(svg|png|jpe?g|gif|webp)$/i.test(file)) continue;
  if (!body.includes(file)) report("warn", `본문이 참조하지 않는 자산: ${file}`);
}

// 2-3. em dash (본문과 같은 디렉토리 SVG 라벨 모두 금지)
const emDashLines = [];
body.split("\n").forEach((line, i) => {
  if (line.includes("—")) emDashLines.push(i + 1);
});
if (emDashLines.length) {
  report("error", `em dash 발견 (본문 ${emDashLines.length}곳: line ${emDashLines.join(", ")})`);
}
for (const file of fs.readdirSync(postDir)) {
  if (!/\.svg$/i.test(file)) continue;
  const svg = fs.readFileSync(path.join(postDir, file), "utf8");
  if (svg.includes("—")) report("error", `em dash 발견 (SVG): ${file}`);
}

// 2-4. 코드 펜스 짝
const fences = body.split("\n").filter((line) => /^[ \t]*```/.test(line)).length;
if (fences % 2 !== 0) report("error", `코드 펜스가 홀수 개다 (${fences}개). 닫히지 않은 블록이 있다`);

console.log(`post-check: error ${errors}, warn ${warns}`);

// 3. 기존 가드 체인
const run = (script, args) => {
  const result = spawnSync("node", [script, ...args], { stdio: "inherit" });
  return result.status ?? 1;
};

const toneStatus = run("scripts/tone-guard.mjs", [target]);
const mermaidStatus = run("scripts/mermaid-guard.mjs", []);

process.exit(errors > 0 || toneStatus !== 0 || mermaidStatus !== 0 ? 1 : 0);
