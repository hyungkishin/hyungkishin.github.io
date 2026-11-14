import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("./check-rendered-prose.mjs", import.meta.url));

function run(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), "rendered-prose-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  return spawnSync(process.execPath, [checker, root], { encoding: "utf8" });
}

test("reports rendered text, metadata, accessible labels and closed answers", t => {
  const result = run(t, {
    "posts/index.html": `<title>제목 &sect;2</title>
<meta property="og:description" content="요약&middot;소개">
<details><summary>질문</summary><p>답에 있는 &#183; 기호</p></details>
<img alt="힙·스택"><button aria-label="다음 §2">다음</button>
<p>JVMS <code>§2.5</code> <code>·</code> <code>§</code></p>
<pre><code class="language-mermaid">flowchart LR
A["그림·문구"]</code></pre>`,
    "media/chart.svg": `<svg xmlns="http://www.w3.org/2000/svg"><title>그림 §1</title>
<desc>그림·설명</desc><text>그림·제목</text></svg>`,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /posts[/\\]index\.html:3/);
  assert.match(result.stderr, /:5: ·$/m);
  assert.match(result.stderr, /:5: §$/m);
  for (const excerpt of ["제목 §2", "요약·소개", "답에 있는 · 기호", "힙·스택", "다음 §2",
                         "§2.5", "그림·문구", "그림 §1", "그림·설명", "그림·제목"]) {
    assert.ok(result.stderr.includes(excerpt), excerpt);
  }
});

test("preserves code, commands, raw output and URLs", t => {
  const result = run(t, {
    "index.html": `<title>힙과 스택</title><p>JVM 명세 2.5절</p>
<pre><code><span class="token string">"§·"</span></code></pre>
<samp>§ ·</samp><kbd>§</kbd><code>text.replace("§·", "")</code>
<a href="https://example.org/§">https://example.org/§</a>
<script>const text = "§·"</script><style>p::before { color: red } /* § */</style>
<pre><code class="language-mermaid">%% 메모·예시
flowchart LR
A["할당"] --> B["회수"]</code></pre>`,
    "raw/output.txt": "표시 기호 §·",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("fails if the build produced no HTML", t => {
  const result = run(t, { "public.json": "{}" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /HTML/);
});
