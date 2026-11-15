import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

test("표나 소제목이 없어도 독자의 예상이 어긋나는 일반 문단과 바로 다음 문단을 보여준다", () => {
  const paragraphs = Array.from({ length: 36 }, (_, index) => `${index}번 주문을 처리했다.`);
  paragraphs[8] = "참조를 생성자에 넘겼는데 무슨 값을 반환하지?";
  paragraphs[9] = "생성자를 부르기 직전의 스택을 다시 그렸다.";
  const result = review(paragraphs.join("\n\n"));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /L17 \[본문\] 참조를[^\n]*\nL19 \[본문\] 생성자를/);
  assert.ok(result.stdout.split("\n").filter(line => /^L\d+ /.test(line)).length <= 6);
  assert.match(result.stdout, /\n\s*…\n/);
});

test("질문이나 전환어가 없어도 원고 중간의 실제 이웃한 문단을 읽을 수 있다", () => {
  const source = Array.from({ length: 40 }, (_, index) => `캐시에 남은 항목은 ${index}개였다.`).join("\n\n");
  const result = review(source);
  assert.equal(result.status, 0, result.stderr);
  const entries = [...result.stdout.matchAll(/^L(\d+) \[본문\]/gm)].map(match => Number(match[1]));
  assert.ok(entries.some((line, index) => line > 3 && line < 77 && entries[index + 1] === line + 2));
  assert.ok(entries.length <= 6);
});

test("빈 원고나 경로 누락은 실패로 보고한다", () => {
  for (const result of [review(""), spawnSync(process.execPath, [cli], { encoding: "utf8" })]) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /원고|사용법/);
  }
});

test("도움말로 단일 원고의 검토 명령을 확인한다", () => {
  const result = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /원고\.md/);
});

test("같은 연재에서 이웃 글의 첫 문단과 마지막 문단을 줄 번호와 함께 읽는다", () => {
  const root = path.resolve(path.dirname(cli), "..");
  const file = "contents/posts/frontend/performance/phase2/index.md";
  const result = spawnSync(process.execPath, [cli, file], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /같은 연재.*프론트엔드 성능 최적화/);
  for (const slug of ["phase1", "phase3"]) {
    assert.match(result.stdout, new RegExp(slug + "/index\\.md\\n  도입 L\\d+ .+\\n  맺음 L\\d+ .+"));
  }
  assert.doesNotMatch(result.stdout, /맺음 L\d+ 참고|comparison-not-value\/index\.md/);
});

test("다른 편 두 곳에서도 겹친 구절을 원문과 함께 보여 주고 코드와 참고 항목은 빼 준다", t => {
  const fixture = mkdtempSync(path.join(tmpdir(), "voice-series-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const root = path.resolve(path.dirname(cli), "..");
  for (const entry of ["scripts", "src/utils"]) mkdirSync(path.join(fixture, entry), { recursive: true });
  copyFileSync(cli, path.join(fixture, "scripts/review-voice.mjs"));
  copyFileSync(path.join(root, "src/utils/seriesRules.js"), path.join(fixture, "src/utils/seriesRules.js"));
  symlinkSync(path.join(root, "node_modules"), path.join(fixture, "node_modules"), "dir");
  for (const [slug, subject] of [["phase1", "속도"], ["phase2", "사진"], ["phase3", "캐시"], ["phase8", "화면"], ["unlisted", "미분류"]]) {
    const dir = path.join(fixture, "contents/posts/frontend/performance", slug);
    mkdirSync(dir, { recursive: true });
    const intro = slug === "phase3" ? "배포 날에는 비가 왔다." : `결과를 놓고 한참을 다시 보니 ${subject}부터 걸렸다.`;
    writeFileSync(path.join(dir, "index.md"), [
      "---", "title: 가짜 메타데이터", "date: 2026-10-10", "---",
      "![표지](cover.svg)", "", intro, "", "```sh", "공통 코드만 매번 반복해서 출력한다.", "```",
      "", `${subject} 기록은 여기서 끝난다.`, "", "## 참고 자료", "", "반복할 참고 자료 문장을 적었다.",
    ].join("\n"));
  }
  const run = slug => spawnSync(process.execPath, ["scripts/review-voice.mjs", `contents/posts/frontend/performance/${slug}/index.md`], { cwd: fixture, encoding: "utf8" });
  const repeated = run("phase2");
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.match(repeated.stdout, /phase1\/index\.md\n  도입 L7 결과를 놓고 한참을 다시 보니 속도부터 걸렸다\.\n  맺음 L13 속도 기록은 여기서 끝난다\./);
  const findings = repeated.stdout.split("겹친 표현")[1];
  assert.ok(findings, "여러 편에 겹친 구절이 출력돼야 한다");
  assert.match(findings, /결과를 놓고 한참을 다시/);
  for (const source of ["phase1", "phase2", "phase8"]) assert.match(findings, new RegExp(source + "/index\\.md.*L7"));
  assert.doesNotMatch(findings, /공통 코드|참고 자료 문장|unlisted|phase3/);
  assert.doesNotMatch(run("phase3").stdout, /겹친 표현/);
  assert.doesNotMatch(run("unlisted").stdout, /같은 연재|겹친 표현/);
});

test("본문 중간의 '참고' 메모 뒤에서 이어지는 단락은 생략하지 않는다", () => {
  const result = review("서비스를 시작했다.\n\n참고\n\n- 작업 전에는 포트를 확인한다.\n\n이번 실행에서는 8080을 썼다.");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /L7 \[본문\] 이번 실행에서는 8080을 썼다/);
});
