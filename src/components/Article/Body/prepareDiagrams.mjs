import { bindDiagram, createDiagramFigure } from "../../../series-reader/diagram.mjs"

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
