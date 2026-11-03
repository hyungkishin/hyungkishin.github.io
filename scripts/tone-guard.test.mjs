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
