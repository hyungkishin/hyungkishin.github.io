const test = require("node:test")
const assert = require("node:assert/strict")
const { JSDOM } = require("jsdom")

test("그림 상단이 헤더 근처에 닿을 때 한 번 재생하고 화면 크기가 바뀌면 기준 높이를 갱신한다", async () => {
  const { playOnView } = await import("../../components/Article/Body/prepareDiagrams.mjs")
  const { window } = new JSDOM('<header class="journal-header"></header><main><p id="question">참조는 어디에 있을까?</p><figure data-play-on-view><img src="/static/heap.svg"></figure><img src="/static/other.svg"></main>', { pretendToBeVisual: true, url: "https://blog.test/" })
  const root = window.document.querySelector("main")
  const [diagram, other] = root.querySelectorAll("img")
  const header = window.document.querySelector("header")
  let headerHeight = 69
  header.getBoundingClientRect = () => ({ height: headerHeight })
  window.innerHeight = 900
  const observed = new Set()
  let notify, options
  window.IntersectionObserver = class {
    constructor(callback, config) { notify = entries => callback(entries, this); options = config }
    observe(image) { observed.add(image) }
    unobserve(image) { observed.delete(image) }
    disconnect() { observed.clear() }
  }
  const dispose = playOnView(root, window)
  assert.deepEqual([...observed], [diagram])
  assert.equal(options.rootMargin, "0px 0px -807px 0px")
  headerHeight = 57
  window.innerHeight = 844
  window.dispatchEvent(new window.Event("resize"))
  assert.equal(options.rootMargin, "0px 0px -763px 0px")
  notify([{ target: diagram, isIntersecting: false }])
  assert.equal(diagram.getAttribute("src"), "/static/heap.svg")
  notify([{ target: diagram, isIntersecting: true }])
  const started = new URL(diagram.src)
  assert.equal(started.pathname, "/static/heap.svg")
  assert.ok(started.searchParams.get("playback"))
  assert.equal(started.hash, "#play")
  window.dispatchEvent(new window.Event("resize"))
  assert.equal(observed.size, 0)
  assert.equal(diagram.src, started.href)
  assert.equal(other.getAttribute("src"), "/static/other.svg")
  dispose()
  window.close()
})

test("모션 줄이기가 켜져 있으면 화면에 들어온 도판은 정지 그림을 유지한다", async () => {
  const { playOnView } = await import("../../components/Article/Body/prepareDiagrams.mjs")
  const { window } = new JSDOM('<figure data-play-on-view><img src="/static/heap.svg"></figure>', { pretendToBeVisual: true })
  const diagram = window.document.querySelector("img")
  window.matchMedia = query => ({ matches: query === "(prefers-reduced-motion: reduce)" })
  let notify
  window.IntersectionObserver = class {
    constructor(callback) { notify = entries => callback(entries, this) }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const dispose = playOnView(window.document.body, window)
  notify?.([{ target: diagram, isIntersecting: true, intersectionRatio: 1 }])
  assert.equal(diagram.getAttribute("src"), "/static/heap.svg")
  dispose?.()
  window.close()
})
