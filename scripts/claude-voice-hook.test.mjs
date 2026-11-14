import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const guide = readFileSync(path.join(root, "editorial/voice-review.md"), "utf8");
const settingsFile = path.join(root, ".claude/settings.json");
const posts = path.join(root, "contents/posts");

// Drive the registered command with Claude Code's stdin shape, including matcher filtering.
function runHook(event) {
  const { hooks } = JSON.parse(readFileSync(settingsFile, "utf8"));
  const value = event.tool_name || event.source || event.agent_type;
  const rule = hooks[event.hook_event_name].find(
    rule => !rule.matcher || new RegExp(rule.matcher).test(value),
  );
  if (!rule) return null;
  const [handler] = rule.hooks;
  const args = handler.args.map(arg => arg.replace("${CLAUDE_PROJECT_DIR}", root));
  const result = spawnSync(handler.command, args, {
    cwd: event.cwd,
    encoding: "utf8",
    input: JSON.stringify(event),
  });
  assert.equal(result.status, 0, result.stderr);
  if (!result.stdout.trim()) return null;
  const output = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(output), ["hookSpecificOutput"]);
  assert.deepEqual(Object.keys(output.hookSpecificOutput).sort(), ["additionalContext", "hookEventName"]);
  assert.equal(output.hookSpecificOutput.hookEventName, event.hook_event_name);
  return output.hookSpecificOutput.additionalContext;
}

test("세션을 시작하거나 재개하고 압축한 뒤에도 현재 편집 기준 전문을 받는다", () => {
  for (const source of ["startup", "resume", "compact", "clear", "fork"]) {
    assert.equal(runHook({ hook_event_name: "SessionStart", cwd: posts, source }), guide);
  }
});

test("기본 서브에이전트와 프로젝트 편집 에이전트에도 같은 기준 전문을 보낸다", () => {
  for (const agent_type of ["Explore", "blog-editor"]) {
    assert.equal(runHook({ hook_event_name: "SubagentStart", cwd: posts, agent_type }), guide);
  }
});

test("원고마다 전문을 반복하지 않고 해당 체크아웃의 기준 경로와 앞뒤 문단 점검을 보낸다", () => {
  const examples = [
    ["Edit", { file_path: "books/optimizing-java/chapter-03-jvm/index.md" }],
    ["MultiEdit", { file_path: "backend/spring/spring-ai/rag/rag.md", edits: [] }],
    ["Write", { file_path: path.join(posts, "new post/index.md"), content: "본문" }],
    ["NotebookEdit", { notebook_path: "books/reading/notes.ipynb", cell_type: "markdown" }],
  ];
  for (const [tool_name, tool_input] of examples) {
    const context = runHook({ hook_event_name: "PreToolUse", cwd: posts, tool_name, tool_input });
    assert.ok(context.includes(path.join(root, "editorial/voice-review.md")));
    assert.ok(!context.includes(guide));
    assert.ok(context.length < 500);
    assert.match(context, /앞뒤 문단/);
  }
});

test("블로그 원고 밖의 편집과 읽기에는 문맥을 덧붙이지 않는다", () => {
  for (const [tool_name, tool_input] of [
    ["Edit", { file_path: "../../editorial/voice-review.md" }],
    ["Write", { file_path: "../posts-backup/old.md" }],
    ["Write", { file_path: "backend/example/evidence/Probe.java" }],
    ["NotebookEdit", { notebook_path: "../../notebooks/lab.ipynb", cell_type: "markdown" }],
    ["NotebookEdit", { notebook_path: "books/reading/notes.ipynb", cell_type: "code" }],
    ["Read", { file_path: "books/optimizing-java/chapter-03-jvm/index.md" }],
  ]) {
    assert.equal(runHook({ hook_event_name: "PreToolUse", cwd: posts, tool_name, tool_input }), null);
  }
});
