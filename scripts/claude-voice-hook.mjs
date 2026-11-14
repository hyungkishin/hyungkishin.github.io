import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const event = JSON.parse(readFileSync(0, "utf8"));
const cwd = event.cwd || project;

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

// CLAUDE_PROJECT_DIR stays at the launch checkout when Claude enters a worktree.
function checkoutFor(file) {
  const worktrees = spawnSync("git", ["-C", project, "worktree", "list", "--porcelain", "-z"], { encoding: "utf8" });
  const roots = (worktrees.stdout || "").split("\0")
    .filter(line => line.startsWith("worktree ")).map(line => line.slice("worktree ".length));
  roots.push(project);
  return roots.filter(root => inside(root, file)).sort((a, b) => b.length - a.length)[0];
}

function guideFor(root) {
  const file = path.join(root, "editorial/voice-review.md");
  if (existsSync(file)) return file;
  // Older linked checkouts may predate the editorial guide.
  return path.join(project, "editorial/voice-review.md");
}

function context() {
  if (event.hook_event_name === "SessionStart" || event.hook_event_name === "SubagentStart") {
    const root = checkoutFor(cwd) || project;
    return readFileSync(guideFor(root), "utf8");
  }
  if (event.hook_event_name !== "PreToolUse") return;
  const { tool_name: tool, tool_input: input } = event;
  if (!["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) return;
  const notebook = tool === "NotebookEdit";
  if (notebook && input?.cell_type === "code") return;
  const target = notebook ? input?.notebook_path : input?.file_path;
  if (typeof target !== "string") return;
  const file = path.resolve(cwd, target);
  const root = checkoutFor(file);
  if (!root || !inside(path.join(root, "contents/posts"), file)) return;
  if (!(notebook ? /\.ipynb$/i : /\.(md|mdx|markdown)$/i).test(file)) return;
  const guide = guideFor(root);
  return `이 원고의 편집 기준은 ${guide}에 있다. 체크아웃이 바뀌었으면 이 파일을 다시 읽는다. 고칠 문장과 앞뒤 문단을 이어 읽고, 새 용어나 예제를 이해하는 데 필요한 근거가 앞에 있는지 확인한다.`;
}

const additionalContext = context();
if (additionalContext) {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: event.hook_event_name, additionalContext },
  }));
}
