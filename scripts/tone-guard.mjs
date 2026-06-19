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
  ["독자분들", "week6는 친근한 호명을 쓰지 않는다."],

  // AI작성텍스트.xlsx 등급 A (최상위 적발, AI 흔적 1순위)
  ["따라서", "그래서, 그 결과, 그 때문에."],
  ["이를 바탕으로", "그 경험을 기반으로, 실제로 적용하여."],
  ["이러한 경험은", "그 경험 덕분에 ~를 시도할 수 있었다."],
  ["이를 계기로", "그때부터, 그 경험을 살려."],
  ["종합해보면", "정리하자면, 결국."],

  // AI작성텍스트.xlsx 등급 B
  ["이와 같이", "이렇게 보면, 이처럼."],
  ["다시 말해", "정리하자면, 쉽게 말하면."],
  ["또한", "그리고, 아울러, 덧붙여."],
  ["그러므로", "결국, 이로 인해, 자연스럽게."],
  ["이로써", "그렇게 해서, 그때부터."],
  ["이러한 과정을 통해", "그 과정을 거치며, 직접 겪으면서."],
  ["그러한 점에서", "실제로 보면, 그 맥락에서."],
  ["결국 말하자면", "요약하면, 핵심은."],
  ["요컨대", "정리하자면, 결국."],
  ["덧붙여 말하면", "추가로, 이어서."],
  ["앞서 언급한 것처럼", "이미 설명한 바와 같이."],
  ["그러다 보니", "그렇게 되면서, 자연스럽게."],
  ["이 점에서", "이 과정에서, 여기서 보면."],
  ["다시 강조하면", "특히, 무엇보다."],
  ["이 같은 과정을 통해", "그 경험을 거치며."],
  ["요약하면", "정리하면, 핵심은."],
  ["이로 인해", "그래서, 그 결과로."],
  ["그 결과", "결국, 이어서."],
  ["한마디로", "요약하면, 정리하면, 간단히 말해."],
  ["이와 같은 이유로", "이런 배경 때문에, 그래서."],
  ["사실상", "실제로, 현실적으로."],
  ["왜냐하면", "그 이유는, ~하기 때문이다."],
  ["이러한 점에서", "그래서, 그 자리에서."],
  ["이와 더불어", "동시에, 같이."],

  // 등급 C
  ["다시금", "반복해서, 이어서."],

  // AI-티 나는 외래어/추상어 (시트 2)
  ["가치 창출", "만든 변화/성과 서술."],
  ["시너지", "합쳐서 얻은 결과 제시."],
  ["데이터 기반", "데이터를 다룬 행동 서술."],
  ["스스로 동기부여", "구체적 계기/행동."],
  ["핵심 역량", "역량 대신 기술/행동."],
  ["변화 대응", "상황 변화 + 행동."],
  ["기회로 삼", "기회 내용 명시."],
  ["통찰", "깨달음/배운점 기술."],
  ["로드맵", "단계/일정 구체화."],
  ["담론", "논의/대화/논쟁."],
  ["프로액티브", "먼저 한 행동."],
  ["Best Practice", "실제 사례."],
  ["Onboarding", "적응/초기 학습."],
  ["Stakeholder", "이해관계자/관련 부서."],
  ["Agile하게", "빠르게/짧은 주기."],
  ["임팩트", "숫자/변화 제시."],
  ["퍼포먼스", "성과/수치."],
  ["레거시", "기존 방식/구버전."],
  ["엔드투엔드", "처음부터 끝까지."],
  ["스케일업", "규모 확장."],
  ["원팀", "같은 팀/한 목소리."],
  ["가시화", "보여 주다/드러내다."],
  ["거버넌스", "의사결정 구조."],
  ["가속화", "빨리 하다/속도를 올리다."],
  ["검증된", "근거/증거 제시."],
  ["윈윈", "서로 얻은 득."],
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

// ─────────────────────────────────────────────────────────────
// 한국어 AI 티 (번역투·관용구·리듬) — .claude/rules/ai-tell-taxonomy.md
// im-not-ai(Humanize KR, MIT) 분류 체계 기반. prose(코드 마스킹)에서 검사.
// ─────────────────────────────────────────────────────────────

// (1) 하드 금지: 한국어 필자가 거의 안 쓰는 결정적 AI 티(S1). 라인별 error.
const aiTellHard = [
  [/되어지|되어졌|지게\s*됩?니다|지게\s*된다/g, "A-8 이중피동", "능동 또는 단일 피동으로 ('판단되어진다' → '판단된다')."],
  [/가지고\s*있/g, "A-7 가지고있다", "형용사·동사로 환원 ('경쟁력을 가지고 있다' → '경쟁력이 강하다')."],
  [/혁신적|획기적|압도적|막강한|폭발적|파격적|대대적|전례\s*없는/g, "D-4 hype어휘", "구체 수치·사실로. 마케팅 톤."],
  [/시사하는\s*바가\s*크|주목할\s*만하/g, "D-2 과장관용구", "구체 결론으로 바꾸거나 삭제."]
];
for (const [regex, id, guidance] of aiTellHard) {
  for (const match of prose.matchAll(regex)) {
    errors.push({ type: `ai-tell:${id}`, line: lineNumber(prose, match.index), phrase: match[0].trim(), guidance });
  }
}

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

// 절충형 신규: 사람 목소리(경험·반문·구어) 측정. 빼는 규칙만으론 기계적 AI 톤을 못 거른다.
const voiceSignals = [
  /거든요|인데요|더라고요|니까요|잖아요|네요|군요/g, // 구어 종결
  /까요\?|나요\?|을까\?|ㄹ까\?/g, // 반문
  /제가|저는|내가|나는|직접\s/g // 1인칭 경험
];
let voiceHits = 0;
for (const re of voiceSignals) voiceHits += (prose.match(re) || []).length;
if (sections.length >= 3 && voiceHits < 3) {
  warnings.push({
    type: "voice-missing",
    line: null,
    phrase: `목소리 ${voiceHits}건`,
    guidance: "경험·반문·구어가 거의 없다. '제가 겪은~', '~거든요', '~할까요?' 같은 사람 목소리를 넣어라."
  });
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
