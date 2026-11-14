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

const sectionRegex = /^##\s+(.+)$/gm;
const sections = [...text.matchAll(sectionRegex)].map((match) => match[1].trim());

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
  ["반드시", "트레이드오프 글에 절대 단어는 자기모순."],
  ["절대", "트레이드오프 글에 절대 단어는 자기모순."],
  ["무조건", "트레이드오프 글에 절대 단어는 자기모순."]
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

const lines = text.split(/\r?\n/);
let streak = 0;
let streakStart = 0;
const streakReports = [];
for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  if (trimmed.endsWith("습니다.") || trimmed.endsWith("합니다.") || trimmed.endsWith("입니다.")) {
    if (streak === 0) streakStart = i + 1;
    streak++;
    if (streak >= 4) {
      streakReports.push({ start: streakStart, end: i + 1 });
      streak = 0;
    }
  } else if (trimmed.length > 0) {
    streak = 0;
  }
}
for (const { start, end } of streakReports) {
  warnings.push({
    type: "ending-monotony",
    line: start,
    phrase: `${start}~${end}`,
    guidance: "동일 종결 4연속 이상. 종결 다양성(~했어요/~인 거죠/명사 종결 등)을 섞어라."
  });
}

const softSignals = [
  // 절충형: TL;DR·"포기한 것" 강제 제거(토스·velog 둘 다 안 씀). 코드 evidence만 유지.
  ["```", "기술 글이라면 코드/설정/다이어그램 evidence 블록이 필요하다."]
];
for (const [needle, guidance] of softSignals) {
  if (!text.includes(needle)) {
    warnings.push({ type: "missing-signal", phrase: needle, guidance });
  }
}

if (sections.length < 3) {
  warnings.push({
    type: "section-depth",
    phrase: "##",
    guidance: "week6 톤은 보통 3개 이상의 결정 섹션이 필요하다."
  });
}

const weakSections = sections.filter((title) => /^(개요|배경|구현 방법|최적화|결론|마무리)\s*$/i.test(title));
for (const title of weakSections) {
  warnings.push({
    type: "weak-section-title",
    phrase: title,
    guidance: "일반 섹션 제목을 operational decision question으로 다시 써라."
  });
}

// 절충형: 질문형 섹션 강제 제거. 토스는 질문형 제목을 안 쓰고 velog는 쓴다 — 스타일 선택이지 규칙이 아니다.

// ─────────────────────────────────────────────────────────────
// 한국어 AI 티 (번역투·관용구·리듬) — .claude/rules/ai-tell-taxonomy.md
// im-not-ai(Humanize KR, MIT) 분류 체계 기반. prose(코드 마스킹)에서 검사.
// ─────────────────────────────────────────────────────────────

// (2) 밀도 경고: 한 번은 자연스럽지만 문서당 임계 초과면 AI 티. warn.
const sentenceCount = (prose.match(/[.!?]/g) || []).length || 1;
const aiTellDensity = [
  [/(를|을)\s*통(해|하여|한)/g, "A-2 ~를통해", 3, "'~로 / ~해서 / ~함으로써'로 분산."],
  [/에\s*대[해한](?:서)?/g, "A-1 ~에대해", 3, "목적격 조사로 직결 ('X에 대해 논의' → 'X를 논의')."],
  [/에\s*의[해한]/g, "A-9 ~에의해", 2, "행위자를 주어로 ('AI에 의해 생성' → 'AI가 만든')."],
  [/수\s*있(다|습니다|는|을|었)/g, "G-1 ~수있다", 10, "단언 가능한 곳은 단언으로 ('높일 수 있다' → '높인다')."],
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

// (3) C-11 연결어미 뒤 쉼표 — KatFish 단일 최강 분리도(인간 4% vs AI 20%, 4.84배).
// 앞 글자를 포함해 활용 어미를 잡되, 명사 나열 쉼표("텍스트, 광고, 캐시")는 오탐이라 제외.
const endingCommaAll = [...prose.matchAll(/[가-힣](고|며|지만|면서|는데|아서|어서|거나|든지|도록)\s*,/g)];
const endingComma = endingCommaAll.filter((m) => {
  const tail = prose.slice(m.index + m[0].length, m.index + m[0].length + 12);
  const head = prose.slice(Math.max(0, m.index - 12), m.index);
  const listAfter = /^\s*[가-힣]{1,6}\s*,/.test(tail); // 뒤에 "또항목," → 나열
  const listBefore = /,\s*[가-힣]{0,8}$/.test(head); // 앞에 "항목," → 나열 중간
  return !(listAfter || listBefore);
});
// 절충형: 6회 미만 만연체는 정상(velog 좋은 글도 씀). 6회 이상 "강한 신호"만 잡는다.
if (endingComma.length >= 6) {
  const rate = ((endingComma.length / sentenceCount) * 100).toFixed(1);
  const linesHit = endingComma.slice(0, 12).map((m) => lineNumber(prose, m.index)).join(",");
  const sev = "강한 신호";
  warnings.push({
    type: "ai-tell:C-11 연결어미뒤쉼표",
    line: lineNumber(prose, endingComma[0].index),
    phrase: `${endingComma.length}회 / ${rate}% (${sev})`,
    guidance: `연결어미 뒤 쉼표 제거 또는 마침표로 끊기. AI 티 최강 신호. (L${linesHit}${endingComma.length > 12 ? "..." : ""})`
  });
}

// voice-missing 규칙은 제거됐다 (tone-harness.md 11절).
// 구어 종결을 억지로 섞어 사람 냄새를 내지 않는다. 서술의 주체는 개발자가 아니라 구조다.

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
