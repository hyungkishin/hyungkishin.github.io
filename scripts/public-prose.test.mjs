import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "public-prose-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  function write(name, text) {
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  function run(cmd, ...args) {
    const environment = { ...process.env };
    for (const name of ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_PREFIX"]) delete environment[name];
    return spawnSync(cmd, args, { cwd: dir, env: environment, encoding: "utf8" });
  }
  const git = (...args) => run("git", ...args);
  assert.equal(git("init", "-q").status, 0);
  for (const [key, value] of [["user.name", "Test"], ["user.email", "example@localhost"], ["commit.gpgsign", "false"]]) git("config", key, value);
  fs.cpSync(path.join(root, "scripts"), path.join(dir, "scripts"), { recursive: true });
  if (fs.existsSync(path.join(root, ".githooks"))) fs.cpSync(path.join(root, ".githooks"), path.join(dir, ".githooks"), { recursive: true });
  fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"), "dir");
  fs.copyFileSync(path.join(root, "package.json"), path.join(dir, "package.json"));
  write(".gitignore", "node_modules/\n");
  const install = run("npm", "run", "--if-present", "prepare");
  assert.equal(install.status, 0, install.stderr);
  git("add", ".");
  assert.equal(git("commit", "-qm", "initial").status, 0);
  return { dir, write, git, run, commit: () => git("commit", "-qm", "article") };
}

test("git commit inspects the index even when the working copy is clean", t => {
  const f = fixture(t);
  const name = "contents/posts/한 글/index.md";
  f.write(name, "---\ntitle: '메모리 · GC'\n---\n[§1](https://example.org/§1)\n");
  f.git("add", name);
  f.write(name, "# JVM 메모리\n");
  const bad = f.commit();
  assert.notEqual(bad.status, 0, "staged Korean middle dot and section sign passed the hook");
  assert.match(bad.stderr + bad.stdout, /index\.md:2:/);
  f.git("add", name);
  f.write(name, "# 메모리 · GC\n");
  const good = f.commit();
  assert.equal(good.status, 0, good.stderr);
  assert.equal(f.git("show", "HEAD:" + name).stdout, "# JVM 메모리\n");
});

test("HTML and SVG captions, renamed files, JSX and site metadata block a commit", t => {
  const f = fixture(t);
  const names = {
    "static/diagram.html": '<figure><figcaption>클래스 &sect;</figcaption></figure>',
    "contents/posts/gc/plot.svg": '<svg><title>힙&#xB7;스택</title><text>CPU &amp; GC</text></svg>',
    "src/pages/guide.jsx": 'export default () => <p title="표시&#183;제목">읽기</p>;',
    "src/utils/categoryRules.js": 'export default [{label:"인프라·DB"}];',
    "static/llms.txt": '[목록·태그](/tags/)'
  };
  f.write("initial.txt", "이를 통해");
  f.git("add", "initial.txt");
  assert.equal(f.commit().status, 0);
  f.write("contents/posts/renamed/.keep", "");
  f.git("mv", "initial.txt", "contents/posts/renamed/index.md");
  for (const [name, text] of Object.entries(names)) f.write(name, text);
  f.git("add", ".");
  const bad = f.commit();
  assert.notEqual(bad.status, 0);
  for (const name of [...Object.keys(names), "contents/posts/renamed/index.md"]) assert.ok((bad.stdout + bad.stderr).includes(name), name);
});

test("code, URLs, raw logs and graphic instructions do not count as authored prose", t => {
  const f = fixture(t);
  const md = ["# 자료", "``§ · 중요한 것은``", "~~~~text", "§—·", "~~~~", "    —§·", "", "[원문](https://example.org/§·)", "[도판][id]", "", "[id]: ./§·.svg", "", '<span data-log="§·">힙</span>'].join("\n");
  f.write("contents/posts/a/index.md", md);
  f.write("contents/posts/a/evidence/entries.txt", "§·—");
  f.write("static/plot.svg", '<svg><path d="M0 0" data-id="§·"/><style>/* §· */</style><text>그림</text></svg>');
  f.write("static/chart.html", '<script>const sample="§·"</script><pre>§·</pre><a href="/§·">링크</a>');
  f.write("src/pages/guide.jsx", 'export default () => <a href="/§·"><code>§·</code></a>;');
  f.git("add", ".");
  const good = f.commit();
  assert.equal(good.status, 0, good.stderr);
  f.write("contents/posts/a/index.md", "새로 쓴 요약하자면");
  const all = f.run(process.execPath, "scripts/check-public-prose.mjs", "--all");
  assert.equal(all.status, 1);
  assert.match(all.stderr + all.stdout, /요약하자면/);
});

test("both project worktrees and standalone Pages commits can use the shared hooks directory", t => {
  const f = fixture(t);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "pages-worktree-"));
  t.after(() => fs.rmSync(other, { force: true, recursive: true }));
  assert.equal(f.git("worktree", "add", "--detach", other, "HEAD").status, 0);
  const result = f.git("-C", other, "rm", "-qr", "--", ".githooks", "scripts", "package.json");
  assert.equal(result.status, 0, result.stderr);
  fs.writeFileSync(path.join(other, "index.html"), "<h1>generated page</h1>");
  f.git("-C", other, "add", "index.html");
  const commit = f.git("-C", other, "commit", "-qm", "pages");
  assert.equal(commit.status, 0, commit.stderr);
});

test("hook setup keeps a user hook and custom hooks path intact", t => {
  const f = fixture(t);
  const script = "scripts/install-prose-hook.mjs";
  const old = "#!/bin/sh\necho existing-hook\n";
  f.write(".git/hooks/pre-commit", old);
  assert.equal(f.run(process.execPath, script).status, 0);
  assert.equal(fs.readFileSync(path.join(f.dir, ".git/hooks/pre-commit"), "utf8"), old);
  f.git("config", "core.hooksPath", "local-hooks");
  assert.equal(f.run(process.execPath, script).status, 0);
  assert.equal(f.git("config", "--get", "core.hooksPath").stdout.trim(), "local-hooks");
  assert.equal(fs.existsSync(path.join(f.dir, "local-hooks/pre-commit")), false);
});

test("rendered Mermaid labels and attributes are checked while their commands stay protected", t => {
  const f = fixture(t);
  f.write("contents/posts/a/index.md", [
    "```mermaid", "flowchart LR", "  A[\"힙 · 스택\"] --> B[\"메모리\"]", "```"
  ].join("\n"));
  f.git("add", ".");
  const bad = f.commit();
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr + bad.stdout, /index\.md:3: prose-punctuation/);
  f.write("contents/posts/a/index.md", [
    "```mermaid", "flowchart LR", "  A[\"힙\"] --> B[\"메모리\"]", '  click A "https://example.org/§·"', "  %% §·", "```"
  ].join("\n"));
  f.git("add", ".");
  const good = f.commit();
  assert.equal(good.status, 0, good.stderr);
});

test("context distinguishes stock personification and sentence connectives from normal verbs", t => {
  const f = fixture(t);
  const name = "contents/posts/a/index.md";
  for (const phrase of ["로그가 말해 준다.", "로그가 말해준다.", "메모리가 값을 기억한다.", "따라서 힙이 줄었다."]) {
    f.write(name, phrase);
    f.git("add", name);
    const result = f.run(process.execPath, "scripts/check-public-prose.mjs", "--staged");
    assert.equal(result.status, 1, phrase);
    assert.match(result.stderr, /로그|메모리|따라서/);
  }
  f.write(name, "GC 로그가 남는다. 메모리에 저장한다. 대기열에 쌓인 일감에 따라서도 시점이 달라진다.");
  f.git("add", name);
  const good = f.commit();
  assert.equal(good.status, 0, good.stderr);
});

test("emphasis, DOM assignments and aria labels are checked as rendered Korean", t => {
  const f = fixture(t);
  const name = "contents/posts/test/index.md";
  f.write(name, "# 제목\n\n이를 **통해** 측정했다.\n\n이를 <em>\n통해</em> 읽었다.\n");
  const html = 'static/copy.html';
  f.write(html, `<script>
    el.textContent = '메모리 · GC';
    el.innerText = '로그가 말해 준다.';
    el.innerHTML = '<b>값</b> &sect;5';
  </script>
  <script type="application/json">{"caption":"표 §5"}</script>`);
  const page = 'src/pages/index.jsx';
  f.write(page, 'export default () => <input aria-label="표 &#183; 캡션" />');
  f.git("add", ".");
  const bad = f.commit();
  const issues = bad.stderr + bad.stdout;
  assert.equal(bad.status, 1);
  for (const line of [3, 5]) assert.ok(issues.includes(name + ':' + line + ':'), issues);
  for (const line of [2, 3, 4, 6]) assert.ok(issues.includes(html + ':' + line + ':'), issues);
  assert.ok(issues.includes(page + ':1:'), issues);
});

test("an install inside an unrelated repository leaves its hooks directory alone", t => {
  const f = fixture(t);
  const hook = path.join(f.dir, '.git/hooks/pre-commit');
  fs.unlinkSync(hook);
  fs.mkdirSync(path.join(f.dir, 'vendor/blog/scripts'), {recursive:true});
  fs.copyFileSync(path.join(f.dir, 'scripts/install-prose-hook.mjs'), path.join(f.dir, 'vendor/blog/scripts/install-prose-hook.mjs'));
  const run = f.run(process.execPath, 'vendor/blog/scripts/install-prose-hook.mjs');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.existsSync(hook), false);
});

test("rendered join separators, standalone site scripts and public résumé strings block a commit", t => {
  const f = fixture(t);
  const files = {
    "src/pages/tags.jsx": 'export default ({tags}) => <p>{tags.join(" · ")}</p>;',
    "static/ui.js": 'el["textContent"] = "§5";',
    "contents/resume/data.json": '{\n  "intro": ["경험 · 기술"]\n}'
  };
  for (const [name, source] of Object.entries(files)) f.write(name, source);
  f.git("add", ".");
  const bad = f.commit();
  assert.equal(bad.status, 1);
  for (const name of Object.keys(files)) assert.ok(bad.stderr.includes(name), bad.stderr);
  f.write("src/pages/tags.jsx", 'export default ({tags}) => <p>{tags.join(", ")}</p>;');
  f.write("static/ui.js", 'el.textContent = "그림 5";');
  f.write("contents/resume/data.json", '{"intro":["개발자 경험"],"blog":"https://example.org/§·"}');
  f.git("add", ".");
  const good = f.commit();
  assert.equal(good.status, 0, good.stderr);
});

test("standalone tone guard also checks the labels in linked SVG files", t => {
  const f = fixture(t);
  const name = "contents/posts/a/index.md";
  f.write(name, "![기록](./diagrams/chart.svg)");
  f.write("contents/posts/a/diagrams/chart.svg", '<svg><text>대기—실행</text></svg>');
  const result = f.run(process.execPath, "scripts/tone-guard.mjs", name);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /chart.svg/);
});

test("standalone punctuation in inline code is still displayed prose", t => {
  const f = fixture(t);
  const name = "contents/posts/guard/index.md";
  f.write("src/pages/code.jsx", 'export default () => <code>&sect; 2.5</code>;');
  f.write(name, ["힙 `·` 스택", "명세 `§2.5`", "<code>&sect;</code>"].join("\n"));
  f.git("add", ".");
  const bad = f.commit();
  assert.equal(bad.status, 1, bad.stderr);
  for (const line of [1, 2, 3]) assert.ok(bad.stderr.includes(name + ":" + line + ":"), bad.stderr);
  assert.ok(bad.stderr.includes("src/pages/code.jsx:1:"), bad.stderr);
  f.write("src/pages/code.jsx", 'export default () => <pre><code>&sect; 2.5</code></pre>;');
  f.write(name, ['`const separator = "·"`', "`parse(§2.5)`", "```text", "§2.5", "```"].join("\n"));
  f.git("add", ".");
  const good = f.commit();
  assert.equal(good.status, 0, good.stderr);
});
