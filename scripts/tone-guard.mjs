#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { publicProseErrors } from "./public-prose.mjs";

const target = process.argv[2];

if (!target) {
  console.error("Usage: node scripts/tone-guard.mjs <markdown-file>");
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

// 코드 블록(```...```)과 인라인 코드(`...`)는 공백으로 마스킹.
// banned phrase 검사가 코드 식별자/변수명을 false positive로 잡지 않도록.
// 라인 번호 보존을 위해 줄바꿈은 유지한다.
// 외부 문서의 URL은 저자가 바꿀 수 없는 식별자다. 링크 라벨은 계속 검사한다.
const prose = maskCode(text).replace(/https?:\/\/[^\s<>"')]+/g, url => " ".repeat(url.length));

const errors = publicProseErrors(absolute, text);
const linkedSvg = /!\[[^\]]*\]\(([^)]+\.svg)\)|src=["']([^"']+\.svg)["']/g;
for (const ref of new Set([...text.matchAll(linkedSvg)].map(match => match[1] || match[2]))) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(ref)) continue;
  const asset = path.resolve(path.dirname(absolute), ref);
  if (!fs.existsSync(asset)) continue;
  for (const issue of publicProseErrors(asset, fs.readFileSync(asset, "utf8"))) {
    errors.push({ ...issue, guidance: ref + " " + issue.guidance });
  }
}
const warnings = [];

const absoluteWords = [
  ["반드시", "이 조건에서 항상 성립하는지 앞뒤의 예제나 명세를 확인한다."],
  ["절대", "이 조건에서 항상 성립하는지 앞뒤의 예제나 명세를 확인한다."],
  ["무조건", "이 조건에서 항상 성립하는지 앞뒤의 예제나 명세를 확인한다."]
];
for (const [phrase, guidance] of absoluteWords) {
  const regex = new RegExp(escapeRegex(phrase), "g");
  for (const match of prose.matchAll(regex)) {
    warnings.push({
      type: "absolute-word",
      line: lineNumber(prose, match.index),
      phrase,
      guidance
    });
  }
}

// 반복된 표현의 위치를 보여 주고 실제 문맥은 편집자가 읽는다.
const aiTellDensity = [
  [/(를|을)\s*통(해|하여|한)/g, "A-2 ~를통해", 3, "'~로 / ~해서 / ~함으로써'로 분산."],
  [/에\s*대[해한](?:서)?/g, "A-1 ~에대해", 3, "목적격 조사로 직결 ('X에 대해 논의' → 'X를 논의')."],
  [/에\s*의[해한]/g, "A-9 ~에의해", 2, "행위자를 주어로 ('AI에 의해 생성' → 'AI가 만든')."],
  [/[가-힣]적\s+[가-힣]/g, "F-5 ~적N체인", 5, "구체 명사·동사로 풀기 ('구조적 변화' → '구조가 바뀐다')."],
  [/것이다\.|것입니다\.|것이었다\.|것이죠\./g, "I-1 것이다종결", 3, "확정 서술로 ('크다는 것이다' → '크다')."],
  [/^(또한|즉|게다가|나아가|아울러|더욱이)\b/gm, "H-1 문두접속사", 3, "문장 내용으로 흐름을 잡아라. 대부분 삭제."]
];
for (const [regex, id, threshold, guidance] of aiTellDensity) {
  const matches = [...prose.matchAll(regex)];
  if (matches.length > threshold) {
    const linesHit = matches.slice(0, 8).map((m) => lineNumber(prose, m.index)).join(",");
    warnings.push({
      type: `ai-tell:${id}`,
      line: lineNumber(prose, matches[0].index),
      phrase: `${matches.length}회 (임계 ${threshold})`,
      guidance: `${guidance} (L${linesHit}${matches.length > 8 ? "..." : ""})`
    });
  }
}

for (const item of errors) {
  console.log(`error:${item.line}: ${item.type}: "${item.phrase}" - ${item.guidance}`);
}
for (const item of warnings) {
  console.log(`warn:${item.line ?? "?"}: ${item.type}: "${item.phrase}" - ${item.guidance}`);
}

if (errors.length || warnings.length) {
  console.log(`\nTone guard: ${errors.length} error(s), ${warnings.length} warning(s).`);
} else {
  console.log("Tone guard passed.");
}

process.exit(errors.length ? 1 : 0);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineNumber(value, index) {
  return value.slice(0, index).split(/\r?\n/).length;
}

// fenced code (```...```)와 인라인 코드(`...`)를 공백으로 치환.
// 줄바꿈은 유지해서 라인 번호가 어긋나지 않게 한다.
function maskCode(input) {
  let out = input.replace(/```[\s\S]*?```/g, (block) => {
    return block.replace(/[^\n]/g, " ");
  });
  out = out.replace(/`[^`\n]*`/g, (block) => " ".repeat(block.length));
  return out;
}
