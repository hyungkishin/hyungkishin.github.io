#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

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

const banned = [
  ["중요한 것은", "실제 결정 또는 제약을 직접 써라."],
  ["핵심은", "구체적인 실패 모드 또는 invariant 이름을 써라."],
  ["단순히", "대비를 직접 말해라. filler."],
  ["효율적으로", "어떤 리소스/지연이 줄었는지 써라."],
  ["효과적으로", "관측된 결과가 무엇인지 써라."],
  ["강력한", "어떤 능력인지 이름을 써라."],
  ["견고한", "어떤 실패를 견디는지 써라."],
  ["유연한", "확장 지점 또는 트레이드오프를 써라."],
  ["원활한", "막혔던 경로 또는 지연을 써라."],
  ["매끄러운", "관측 가능한 행동을 써라."],
  ["다양한", "케이스를 나열하거나 지워라."],
  ["복잡한", "구체적 결합점/분기를 써라."],
  ["혁신적인", "마케팅 톤."],
  ["최적의", "선택한 제약과 이유를 써라."],
  ["최적화된", "전/후 측정 증거를 써라."],
  ["활용", "쓰다/호출하다/분리하다/저장하다 같은 구체 동사로."],
  ["개선", "전/후 행동을 써라."],
  ["향상", "측정 가능한 델타를 써라."],
  ["사용자 경험", "사용자가 본 정확한 실패를 써라."],
  ["개발자 경험", "정확히 어떤 워크플로 마찰인지 써라."],
  ["무엇보다", "filler."],
  ["뿐만 아니라", "인과 문장 두 개로 쪼개라."],
  ["이를 통해", "직접 인과를 써라."],
  ["살펴보겠습니다", "글의 직접 화법을 써라."],
  ["알아보겠습니다", "글의 직접 화법을 써라."],
  ["다뤄보겠습니다", "글의 직접 화법을 써라."],
  ["이번 글에서는", "사고/결정에서 시작해라."],
  ["결론적으로", "얻은 원칙을 직접 써라."],
  ["요약하자면", "TL;DR을 쓰거나 구체 문장으로 끝내라."],
  ["시사점", "엔지니어링 레슨을 써라."],
  ["인사이트", "결정 또는 레슨을 써라."],
  ["니즈", "요구사항을 직접 써라."],
  ["여정", "journey framing 금지."],
  ["생태계", "실제 시스템 이름을 써라."],
  ["패러다임", "기술적으로 정확할 때만 허용."],
  ["seamless", "마케팅/AI filler."],
  ["robust", "견디는 실패를 써라."],
  ["scalable", "확장 차원을 써라."],
  ["efficient", "절약된 리소스를 써라."],
  ["effective", "관측 결과를 써라."],
  ["leverage", "구체 동사로 바꿔라."],
  ["optimize", "전/후 측정 증거를 써라."],
  ["enhance", "전/후 행동을 써라."],
  ["streamline", "어떤 단계를 제거했는지 써라."],
  ["delve", "AI-writing tell."],
  ["landscape", "vague survey framing 금지."],
  ["여러분", "week6는 친근한 호명을 쓰지 않는다."],
  ["독자분들", "week6는 친근한 호명을 쓰지 않는다."]
];

const sectionRegex = /^##\s+(.+)$/gm;
const sections = [...text.matchAll(sectionRegex)].map((match) => match[1].trim());

// 코드 블록(```...```)과 인라인 코드(`...`)는 공백으로 마스킹.
// banned phrase 검사가 코드 식별자/변수명을 false positive로 잡지 않도록.
// 라인 번호 보존을 위해 줄바꿈은 유지한다.
const prose = maskCode(text);

const errors = [];
const warnings = [];

for (const [phrase, guidance] of banned) {
  const regex = new RegExp(escapeRegex(phrase), "gi");
  const matches = [...prose.matchAll(regex)];
  for (const match of matches) {
    const line = lineNumber(prose, match.index);
    errors.push({
      type: "banned-phrase",
      line,
      phrase,
      guidance
    });
  }
}

const emDashMatches = [...text.matchAll(/[—–]/g)];
for (const match of emDashMatches) {
  errors.push({
    type: "em-dash",
    line: lineNumber(text, match.index),
    phrase: match[0],
    guidance: "em/en dash 0개. 콜론(:), 마침표, 괄호, 줄바꿈으로 대체."
  });
}

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
  ["TL;DR", "글 상단에 TL;DR 블록이 보이지 않는다."],
  ["포기한 것", "트레이드오프 인용구가 한 번도 없다."],
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

const hasQuestionSection = sections.some((title) => /[?？]|까$|까요$|왜|어떻게|얼마나/.test(title));
if (sections.length > 0 && !hasQuestionSection) {
  warnings.push({
    type: "missing-question-section",
    phrase: "decision question",
    guidance: "섹션 제목 중 절반 이상은 의문형이어야 한다."
  });
}

const svgPathRegex = /!\[[^\]]*\]\(([^)]+\.svg)\)|src=["']([^"']+\.svg)["']/g;
const referencedSvgs = new Set();
for (const match of text.matchAll(svgPathRegex)) {
  const rel = match[1] || match[2];
  if (rel && !/^https?:\/\//.test(rel)) referencedSvgs.add(rel);
}
const baseDir = path.dirname(absolute);
for (const rel of referencedSvgs) {
  const svgPath = path.resolve(baseDir, rel);
  if (!fs.existsSync(svgPath)) continue;
  let svg;
  try {
    svg = fs.readFileSync(svgPath, "utf8");
  } catch {
    continue;
  }
  // 명시적으로 흰색 배경을 가진 SVG는 라이트 테마로 인정.
  // 진한 텍스트 색은 라이트 배경에서 정상 가독성을 위한 것이라 다크 카운트에서 제외.
  const hasWhiteBackground =
    /class=["']bg["'][^>]*fill=["']#ffffff["']/i.test(svg) ||
    /fill=["']#ffffff["'][^>]*class=["']bg["']/i.test(svg) ||
    /\.bg\s*\{[^}]*fill:\s*#ffffff/i.test(svg) ||
    /<rect[^>]*\bfill=["']#ffffff["'][^>]*\bwidth=["']\d+["'][^>]*\bheight=["']\d+["']/i.test(svg);

  if (!hasWhiteBackground) {
    const darkHits = svg.match(/#0[0-9a-f]{5}|#1[0-9a-f]{5}|#2[0-9a-f]{5}/gi);
    if (darkHits && darkHits.length >= 3) {
      warnings.push({
        type: "svg-dark-theme",
        phrase: rel,
        guidance: `SVG에 다크 hex(${darkHits.slice(0, 3).join(", ")}...) 다수. 라이트 테마(#ffffff 배경) 권장.`
      });
    }
  }
  if (/—|–/.test(svg)) {
    errors.push({
      type: "svg-em-dash",
      line: 0,
      phrase: rel,
      guidance: "SVG 라벨 안에 em/en dash. 콜론 또는 줄바꿈으로 대체."
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
