#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import unified from "unified"

const usage = `node scripts/voice-gate.mjs --staged | --range <base> <head>
변경한 contents/posts/<경로>.md의 검토 기록은 editorial/reviews/<경로>.json에 둡니다.
{"sha256":"원고 전체 바이트의 SHA-256","before":"앞 문단 원문 발췌","after":"바로 다음 본문 문단 원문 발췌","reason":"앞 문단을 읽은 독자에게 다음 설명이 필요한 구체적인 이유"}
제목, 코드, 그림, 표, 참고자료를 건너뛰고 이어지는 본문 두 문단에서 발췌합니다.
스테이징 후 해시 확인 예: git show ':contents/posts/분류/글/index.md' | shasum -a 256
수정 절차는 editorial/voice-review.md에서 확인합니다.`

function git(...args) {
  return execFileSync("git", args, { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })
}
const nulPaths = buffer => buffer.toString("utf8").split("\0").filter(Boolean)
const isPost = path =>
  path.startsWith("contents/posts/") && !path.startsWith("contents/posts/resume/") && /\.md$/i.test(path)
const reviewFor = post => post.replace(/^contents\/posts\//, "editorial/reviews/").replace(/\.md$/i, ".json")
const normalize = text => text.replace(/\s+/g, " ").trim()

function paragraphs(source) {
  const body = source.replace(/^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body)
  let referencesDepth = 0
  const result = []
  for (const node of tree.children) {
    if (node.type === "heading") {
      if (node.depth <= referencesDepth) referencesDepth = 0
      const title = node.children
        .map(child => child.value || "")
        .join("")
        .trim()
      if (/^(참고\s*(자료|문헌|링크)|레퍼런스|references|sources)$/i.test(title)) referencesDepth = node.depth
    }
    if (referencesDepth || node.type !== "paragraph") continue
    if (!node.children.some(child => child.type !== "image" && child.type !== "imageReference")) continue
    result.push(normalize(body.slice(node.position.start.offset, node.position.end.offset)))
  }
  return result
}

function validate(postBytes, recordBytes) {
  let record
  try {
    record = JSON.parse(recordBytes.toString("utf8"))
  } catch {
    throw new Error("검토 기록의 JSON을 읽을 수 없습니다.")
  }
  const hash = createHash("sha256").update(postBytes).digest("hex")
  if (record?.sha256 !== hash) throw new Error(`원고 버전이 다릅니다. sha256 = ${hash}`)
  const field = key => (typeof record[key] === "string" ? normalize(record[key]) : "")
  const before = field("before")
  const after = field("after")
  const reason = field("reason")
  const body = paragraphs(postBytes.toString("utf8"))
  const identifiable = excerpt => (excerpt.match(/[\p{L}\p{N}]/gu) || []).length >= 2
  if (
    before === after ||
    !identifiable(before) ||
    !identifiable(after) ||
    !body.some((paragraph, i) => paragraph.includes(before) && body[i + 1]?.includes(after))
  ) {
    throw new Error("이어지는 서로 다른 본문 문단에서 앞·뒤 원문 발췌를 확인하세요.")
  }
  if (
    reason.length < 10 ||
    [before, after].includes(reason) ||
    /^(?:(?:두 문단의 )?(?:흐름이 )?자연스럽게 이어진다|검토\s*완료|확인\s*완료|수정\s*완료|pass|todo|tbd)[\s.!]*$/i.test(
      reason
    )
  ) {
    throw new Error("두 발췌 사이에서 독자가 다음 설명으로 넘어가는 이유를 적으세요.")
  }
}

function run(args) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(usage)
    return
  }
  const staged = args.length === 1 && args[0] === "--staged"
  if (!staged && !(args.length === 3 && args[0] === "--range")) throw new Error(usage)
  process.chdir(git("rev-parse", "--show-toplevel").toString().trimEnd())
  const revisions = staged
    ? []
    : args
        .slice(1)
        .map(ref => git("rev-parse", "--verify", "--end-of-options", `${ref}^{tree}`).toString().trim())
  const snapshot = staged ? "" : revisions[1]
  const changed = nulPaths(
    git(
      "diff",
      ...(staged ? ["--cached"] : revisions),
      "--name-only",
      "--no-renames",
      "-z",
      "--",
      "contents/posts",
      "editorial/reviews"
    )
  )
  const paths = staged
    ? nulPaths(git("ls-files", "-z", "--", "contents/posts"))
    : nulPaths(git("ls-tree", "-r", "--name-only", "-z", snapshot, "--", "contents/posts"))
  const changes = new Set(changed)
  const candidates = paths.filter(path => isPost(path) && (changes.has(path) || changes.has(reviewFor(path))))
  let failures = 0
  for (const post of candidates) {
    const review = reviewFor(post)
    try {
      const bytes = git("show", snapshot + ":" + post)
      let record
      try {
        record = git("show", snapshot + ":" + review)
      } catch {
        throw new Error("원고와 함께 검토 기록을 추가하세요.")
      }
      validate(bytes, record)
    } catch (err) {
      failures++
      console.error(`${post} → ${review}: ${err.message}`)
    }
  }
  console.log(`원고 버전과 문맥 검토 기록 ${candidates.length}개 검사, 오류 ${failures}개`)
  if (failures) process.exitCode = 1
}

try {
  run(process.argv.slice(2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
