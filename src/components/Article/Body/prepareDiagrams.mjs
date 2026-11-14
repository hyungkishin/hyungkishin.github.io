import { bindDiagram, createDiagramFigure } from "../../../series-reader/diagram.mjs"

export function playOnView(root, window) {
  const document = root.ownerDocument
  const pending = new Set(root.querySelectorAll("figure[data-play-on-view] img:not([src$='#play'])"))
  if (!pending.size || !window.IntersectionObserver) return

  const header = document.querySelector(".journal-header")
  const gapBelowHeader = 24
  let observer

  function startDiagrams(entries, source) {
    if (source !== observer || document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    for (const { target: image, isIntersecting } of entries) {
      if (!isIntersecting || !pending.delete(image)) continue
      observer.unobserve(image)
      // A fragment alone can reuse the clock of the already loaded still image.
      const url = new URL(image.src)
      url.searchParams.set("playback", String(Date.now()))
      url.hash = "play"
      image.src = url.href
    }
  }

  function observeNearHeader() {
    observer?.disconnect()
    observer = undefined
    if (document.hidden || !pending.size) return
    const headerHeight = header?.getBoundingClientRect().height ?? 0
    const bottomInset = Math.max(0, window.innerHeight - headerHeight - gapBelowHeader)
    observer = new window.IntersectionObserver(startDiagrams, { rootMargin: `0px 0px -${bottomInset}px 0px` })
    for (const image of pending) observer.observe(image)
  }

  observeNearHeader()
  window.addEventListener("resize", observeNearHeader)
  document.addEventListener("visibilitychange", observeNearHeader)
  return () => {
    window.removeEventListener("resize", observeNearHeader)
    document.removeEventListener("visibilitychange", observeNearHeader)
    observer?.disconnect()
    observer = undefined
  }
}

export default function prepareDiagrams(root, window) {
  const document = root.ownerDocument
  for (const paragraph of root.querySelectorAll("p")) {
    const image = paragraph.firstElementChild
    if (image?.tagName !== "IMG" || paragraph.childElementCount !== 1 || paragraph.textContent.trim()) continue
    const url = image.getAttribute("src") || ""
    const file = /^\/static\/([^/]+)-[a-f0-9]{32}\.svg$/i.exec(url)
    if (!file || !image.alt) continue
    const stem = "diagram-" + file[1]
    const owner = document.getElementById(stem)
    const id = image.id || (owner && owner !== paragraph ? stem + "-" + (root.querySelectorAll("figure.diagram").length + 1) : stem)
    const figure = createDiagramFigure(document, {
      id, url, title: image.title, label: image.alt,
      width: image.naturalWidth, height: image.naturalHeight, animated: "auto",
    })
    for (const originalId of new Set([paragraph.id, image.id])) {
      if (!originalId || originalId === id) continue
      const anchor = document.createElement("span")
      anchor.id = originalId
      paragraph.before(anchor)
    }
    paragraph.replaceWith(figure)
  }
  const cleanups = [...root.querySelectorAll("figure.diagram")].map(figure => bindDiagram(figure, window))
  return () => cleanups.forEach(cleanup => cleanup())
}
