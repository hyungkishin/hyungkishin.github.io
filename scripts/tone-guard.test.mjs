import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./tone-guard.mjs", import.meta.url));
function check(content) {
  const dir = mkdtempSync(path.join(tmpdir(), "tone-link-"));
  try {
    const file = path.join(dir, "index.md");
    writeFileSync(file, content);
    return spawnSync(process.execPath, [guard, file], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("출처 URL의 enhancements는 본문의 금지 표현으로 검사하지 않는다", () => {
  const result = check("[HotSpot 공식 문서](https://docs.oracle.com/en/java/javase/25/vm/java-hotspot-virtual-machine-performance-enhancements.html)");
  assert.equal(result.status, 0, result.stdout);
});

test("URL을 제외해도 링크 라벨과 이후 본문의 금지 표현은 남는다", () => {
  const result = check("[강력한 설명](https://example.org/enhancements)\n\n혁신적인 도구");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /error:1: banned-phrase: "강력한"/);
  assert.match(result.stdout, /error:3: banned-phrase: "혁신적인"/);
  assert.doesNotMatch(result.stdout, /banned-phrase: "enhance"/);
});

test("짧은 독서 메모의 소제목, 코드 블록 수, 존댓말을 양식에 맞추라고 하지 않는다", () => {
  const result = check([
    "## 마무리",
    "같은 수의 부품을 만들고도 두 사람이 받은 돈은 달랐습니다.",
    "다음 장에서 그 이유를 찾았습니다.",
    "테일러는 노동자에게 일을 더 시키기 전에 경영자가 무엇을 했는지 물었습니다.",
    "다시 첫 장의 임금 표를 봤습니다."
  ].join("\n\n"));
  assert.equal(result.status, 0, result.stdout);
  assert.doesNotMatch(result.stdout, /section-depth|weak-section-title|missing-signal|ending-monotony/);
});

test("앞 사건을 받는 한국어와 구어로 쓴 해설은 원문 그대로 발행할 수 있다", () => {
  const result = check("왜냐하면 검증에 걸린 건 기사에 넣은 적도 없는 파일이었거든요. 그러다 보니 라우터까지 왔다.\n\n여러분이라면 이 0을 보고 알림을 끌 수 있을까요?");
  assert.equal(result.status, 0, result.stdout);
});

test("쉼표나 가능성 표현의 횟수로 작성 주체를 추정하거나 가설을 단정하라고 하지 않는다", () => {
  const observation = "응답이 늦으면 요청이 끊길 수 있다. 서버는 응답을 보냈는데, 클라이언트는 타임아웃을 기록했다.";
  const result = check(Array(12).fill(observation).join("\n\n"));
  assert.equal(result.status, 0, result.stdout);
  assert.doesNotMatch(result.stdout, /단언|AI 티 최강|연결어미뒤쉼표/);
});

test("측정 결과가 기록에 없다는 저자의 문장을 통과시킨다", () => {
  const result = check("같은 Pod에서 OCR을 다시 불렀을 때도 130ms에 끊겼을까? 그 결과는 당시 기록에 남아 있지 않다.");
  assert.equal(result.status, 0, result.stdout);
});
