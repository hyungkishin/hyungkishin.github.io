import { readFileSync } from "node:fs";

const cases = JSON.parse(readFileSync(new URL("../editorial/voice-cases.json", import.meta.url), "utf8"));
const args = process.argv.slice(2);
const help = "node scripts/voice-calibration.mjs            편집 사례와 보기 출력\nnode scripts/voice-calibration.mjs --check    표준입력에서 답안 JSON 읽기";

function exercise() {
  console.log('장면마다 지금 원고에 어울리는 편집을 고르세요. 답은 {"amp":"A", ...}처럼 사례 ID와 보기 글자로 적습니다.');
  for (const { id, source, context, choices } of cases) {
    console.log(`\n[${id}] ${source}\n${context}`);
    for (const [key, text] of Object.entries(choices)) console.log(`${key}. ${text}`);
  }
}

function check(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers) ||
      Object.keys(answers).length !== cases.length ||
      cases.some(({ id, choices }) => !Object.hasOwn(answers, id) || typeof answers[id] !== "string" || !Object.hasOwn(choices, answers[id]))) {
    throw new Error("각 사례에 있는 보기 글자 하나씩을 답안에 적으세요.");
  }
  const missed = cases.filter(item => answers[item.id] !== item.keep);
  for (const { id, keep, reason } of missed) console.log(`[${id}] 다시 읽을 보기 ${keep}. ${reason}`);
  console.log(`편집 사례 ${cases.length - missed.length}/${cases.length} 일치`);
  if (missed.length) process.exitCode = 1;
}

try {
  if (args.length === 0) exercise();
  else if (args.length === 1 && args[0] === "--help") console.log(help);
  else if (args.length === 1 && args[0] === "--check") check(JSON.parse(readFileSync(0, "utf8")));
  else throw new Error(help);
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
