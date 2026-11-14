import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("review-voice.mjs", import.meta.url));

function review(source) {
  const dir = mkdtempSync(path.join(tmpdir(), "review-voice-"));
  try {
    const file = path.join(dir, "post.md");
    writeFileSync(file, source);
    return spawnSync(process.execPath, [cli, file], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("SQL 글에서 원문 줄과 표·코드 앞뒤를 읽고 참고자료와 코드 속 제목을 건너뛴다", () => {
  const result = review([
    "---", "title: 비공개메타", "---", "", "어제까지 잘 읽히던 조회가 느려졌다.",
    "", "## 조회 조건", "", "어느 조건이 빠졌을까?", "", "|조건|비용|", "|---|---|", "|지역|10|",
    "", "같은 조건으로 조회했다.", "", "```sql", "SELECT id FROM shop;", "## 가짜 제목", "```",
    "", "실행 계획을 비교했다.", "", "## 참고 자료", "", "### 숨은 제목", "", "참고 문헌 내용",
    "", "## 다음 실험", "", "매장 수를 늘렸다.",
  ].join("\n"));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /L7[^\n]*조회 조건/);
  assert.match(result.stdout, /L11 \[표\] 조건 \| 비용/);
  assert.match(result.stdout, /L17[^\n]*코드/);
  assert.match(result.stdout, /L22[^\n]*실행 계획을 비교했다/);
  assert.match(result.stdout, /다음 실험/);
  assert.doesNotMatch(result.stdout, /비공개메타|숨은 제목|가짜 제목|참고 문헌 내용/);
  assert.match(result.stdout, /editorial\/voice-review\.md/);
});

test("HTML 표와 figure, 마크다운 이미지를 원고의 읽기 순서대로 찾는다", () => {
  const result = review('앞 문장.\n\n<table><tr><td>내용</td></tr></table>\n\n표 해석.\n\n<figure>\n\n![그림 설명](a.svg)\n\n</figure>\n\n그림 해석.\n\n![비교 화면](b.png)\n\n결론.');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /L3[^\n]*표/);
  assert.match(result.stdout, /L7[^\n]*그림/);
  assert.match(result.stdout, /L15[^\n]*그림/);
  assert.match(result.stdout, /L17[^\n]*결론/);
});

test("빈 원고나 경로 누락은 실패로 보고한다", () => {
  for (const result of [review(""), spawnSync(process.execPath, [cli], { encoding: "utf8" })]) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /원고|사용법/);
  }
});
