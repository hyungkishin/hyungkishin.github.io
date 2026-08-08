// 모든 글의 ```mermaid 블록을 실제 mermaid 파서로 검증한다.
// 파싱에 실패하는 블록은 배포된 페이지에서 에러 폭탄 SVG로 나타난다.
// 사용: npm run lint:mermaid  (특정 파일만: node scripts/mermaid-guard.mjs <md파일...>)
import fs from "node:fs"
import path from "node:path"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!DOCTYPE html><body></body>", { url: "https://localhost/" })
globalThis.window = dom.window
globalThis.document = dom.window.document
// Node 22부터 globalThis.navigator가 getter 전용 접근자라 대입이 TypeError를 낸다.
// 값을 갈아끼우려면 재정의해야 한다.
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
})
globalThis.DOMPurify = undefined

const { default: mermaid } = await import("mermaid")
mermaid.initialize({ startOnLoad: false })

const args = process.argv.slice(2)
const targets = []
if (args.length > 0) {
  targets.push(...args)
} else {
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name === "index.md") targets.push(p)
    }
  }
  walk("contents/posts")
}

const blockRegex = /```mermaid\n([\s\S]*?)```/g
let checked = 0
let failed = 0

for (const file of targets) {
  const text = fs.readFileSync(file, "utf8")
  let match
  let index = 0
  while ((match = blockRegex.exec(text)) !== null) {
    index += 1
    checked += 1
    const definition = match[1]
    const line = text.slice(0, match.index).split("\n").length
    try {
      await mermaid.parse(definition)
    } catch (error) {
      failed += 1
      console.log(`FAIL ${file}:${line} (block ${index})`)
      console.log(`  ${String(error.message || error).split("\n")[0]}`)
    }
  }
}

console.log(`\nmermaid guard: ${checked} block(s) checked, ${failed} failed.`)
process.exit(failed ? 1 : 0)
