import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const cli = fileURLToPath(new URL("./voice-gate.mjs", import.meta.url))
const post = "contents/posts/시험 글/part.md"
const review = "editorial/reviews/시험 글/part.json"
const before = "기사 본문을 고쳐도 스크립트 오류가 남았다."
const after = "Next.js가 어느 디렉터리에서 이 페이지를 만드는지 봤다."
const source = [
  "---",
  "title: 제목만으로는 부족하다",
  "---",
  "",
  before,
  "",
  "## 라우터",
  "",
  "```js",
  "const file = 'app';",
  "```",
  "",
  after,
  "",
  "보고서의 두 항목을 따로 집계했다.",
  "",
  "## 참고 자료",
  "",
  "링크 제목만 읽었다.",
  "",
].join("\n")
const receipt = (text = source) => ({
  sha256: createHash("sha256").update(text).digest("hex"),
  before,
  after,
  reason: "기사 본문을 고친 뒤에도 남은 스크립트가 어디서 붙는지 알려면 다음 문단의 라우터를 봐야 한다.",
})

function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), "voice-review-"))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const env = { ...process.env }
  for (const key of ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_PREFIX"])
    delete env[key]
  function run(cmd, ...args) {
    return spawnSync(cmd, args, { cwd: dir, encoding: "utf8", env })
  }
  function git(...args) {
    const r = run("git", ...args)
    assert.equal(r.status, 0, r.stderr)
    return r.stdout.trim()
  }
  function write(path, content) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  git("init", "-q")
  git("config", "user.name", "Voice Test")
  git("config", "user.email", "test@localhost")
  git("config", "core.hooksPath", "/dev/null")
  git("config", "commit.gpgSign", "false")
  write("contents/posts/existing/index.md", source)
  git("add", ".")
  git("commit", "-qm", "base")
  return {
    git,
    write,
    dir,
    command: run,
    run: (...args) => run(process.execPath, cli, ...args),
    stageReview: record => {
      write(review, JSON.stringify(record))
      git("add", review)
    },
  }
}

test("a review in the working copy is insufficient; the staged bytes determine the accepted version", t => {
  const f = repo(t)
  f.write(post, source)
  f.git("add", post)
  f.write(review, JSON.stringify(receipt()))
  const missing = f.run("--staged")
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /editorial\/reviews\/시험 글\/part.json/)
  f.stageReview(receipt())
  f.write(post, source + "아직 편집 중")
  f.write(review, "{}")
  const good = f.run("--staged")
  assert.equal(good.status, 0, good.stderr)
  assert.match(good.stdout, /1/)
  f.git("add", post)
  const outdated = f.run("--staged")
  assert.notEqual(outdated.status, 0)
  assert.match(outdated.stderr, /sha256/i)
})

test("excerpts must come from successive body paragraphs and have an editorial rationale", t => {
  const f = repo(t)
  f.write(post, source)
  f.git("add", post)
  for (const change of [
    { before: after, after: before },
    { before: "없는 발췌" },
    { after: before },
    { after: "보고서의 두 항목" },
    { before: "제목만으로는 부족하다" },
    { before: "const file" },
    { after: "링크 제목만 읽었다." },
    { reason: "" },
    { reason: "검토 완료" },
    { reason: "두 문단의 흐름이 자연스럽게 이어진다." },
    { reason: before },
    { before: ".", after: "." },
    { before: "을", after: "가" },
  ]) {
    f.stageReview({ ...receipt(), ...change })
    const r = f.run("--staged")
    assert.notEqual(r.status, 0, JSON.stringify(change))
    assert.match(r.stderr, /발췌|이유/)
  }
})

test("commit range uses committed blobs, including renamed posts, and skips untouched posts, the résumé and deletions", t => {
  const f = repo(t)
  const base = f.git("rev-parse", "HEAD")
  f.write("contents/posts/resume/index.md", "새 이력서")
  f.write("contents/posts/existing/diagram.svg", "<svg/>")
  f.git("add", ".")
  f.git("commit", "-qm", "asset and resume")
  assert.equal(f.run("--range", base, "HEAD").status, 0)
  mkdirSync(dirname(join(f.dir, post)), { recursive: true })
  f.git("mv", "contents/posts/existing/index.md", post)
  f.git("commit", "-qm", "move")
  const bad = f.git("rev-parse", "HEAD")
  f.stageReview(receipt())
  assert.notEqual(f.run("--range", base, bad).status, 0)
  f.git("commit", "-qm", "review")
  f.write(post, "unfinished")
  const good = f.run("--range", base, "HEAD")
  assert.equal(good.status, 0, good.stderr)
  f.git("rm", "-f", post)
  assert.equal(f.run("--staged").status, 0)
})

test("malformed review JSON, invalid range and CLI usage fail visibly", t => {
  const f = repo(t)
  f.write(post, source)
  f.write(review, "{")
  f.git("add", ".")
  assert.match(f.run("--staged").stderr, /JSON/)
  assert.notEqual(f.run("--range", "invalid", "HEAD").status, 0)
  assert.notEqual(f.run().status, 0)
  assert.notEqual(f.run("--staged", "ignored").status, 0)
  const help = f.run("--help")
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /sha256/)
})

test("removing an existing receipt alone cannot leave a reviewed public post unguarded", t => {
  const f = repo(t)
  f.write(post, source)
  f.git("add", post)
  f.stageReview(receipt())
  f.git("commit", "-qm", "reviewed")
  f.git("rm", review)
  const missing = f.run("--staged")
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /part.json/)
  f.git("rm", post)
  assert.equal(f.run("--staged").status, 0)
})

test("the installed pre-commit hook blocks either missing context or forbidden public prose", t => {
  const f = repo(t)
  const root = fileURLToPath(new URL("../", import.meta.url))
  cpSync(join(root, ".githooks"), join(f.dir, ".githooks"), { recursive: true })
  cpSync(join(root, "scripts"), join(f.dir, "scripts"), { recursive: true })
  symlinkSync(join(root, "node_modules"), join(f.dir, "node_modules"), "dir")
  f.git("config", "core.hooksPath", ".githooks")
  f.write(post, source)
  f.git("add", post)
  const absent = f.command("git", "commit", "-qm", "missing")
  assert.notEqual(absent.status, 0)
  assert.match(absent.stderr, /part.json/)
  const banned = source + "\n이를 통해 지연을 확인했다.\n"
  f.write(post, banned)
  f.git("add", post)
  f.stageReview(receipt(banned))
  const style = f.command("git", "commit", "-qm", "bad style")
  assert.notEqual(style.status, 0)
  assert.match(style.stderr, /이를 통해/)
  f.write(post, source)
  f.git("add", post)
  f.stageReview(receipt())
  f.git("commit", "-qm", "both checked")
})
