import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("./voice-calibration.mjs", import.meta.url));
const examples = () => JSON.parse(readFileSync(new URL("../editorial/voice-cases.json", import.meta.url), "utf8"));
const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", input });

test("편집 판단을 받기 전에는 보기와 원문 상황만 출력한다", () => {
  const result = run([]);
  assert.equal(result.status, 0, result.stderr);
  for (const item of examples()) {
    assert.ok(result.stdout.includes(item.context));
    for (const choice of Object.values(item.choices)) assert.ok(result.stdout.includes(choice));
    assert.ok(!result.stdout.includes(item.reason));
  }
});

test("같은 원문 판단을 재검토하고 틀린 한 곳의 근거를 돌려준다", () => {
  const cases = examples();
  const answers = Object.fromEntries(cases.map(item => [item.id, item.keep]));
  assert.equal(run(["--check"], JSON.stringify(answers)).status, 0);
  const first = cases[0];
  answers[first.id] = Object.keys(first.choices).find(key => key !== first.keep);
  const wrong = run(["--check"], JSON.stringify(answers));
  assert.equal(wrong.status, 1);
  assert.ok(wrong.stdout.includes(first.reason));
  assert.ok(!wrong.stdout.includes(cases[1].reason));
});

test("누락, 없는 보기, 모르는 항목과 잘못된 JSON은 채점하지 않는다", () => {
  const all = Object.fromEntries(examples().map(item => [item.id, item.keep]));
  const first = Object.keys(all)[0];
  for (const input of ["{", "null", "[]", "{}", JSON.stringify({...all, [first]:"X"}), JSON.stringify({...all, extra:"A"})]) {
    assert.equal(run(["--check"], input).status, 2, input);
  }
});
