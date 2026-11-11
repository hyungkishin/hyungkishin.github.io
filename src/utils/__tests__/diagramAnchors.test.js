const test = require("node:test")
const assert = require("node:assert/strict")
const diagramAnchors = require("../../../plugins/gatsby-remark-diagram-anchors")

test("로컬 SVG에는 파일명이 같은 경우에도 각각 링크할 수 있는 앵커가 생긴다", () => {
  const images = ["./stack.svg", "../other/stack.svg?size=large", "./plot.svg"].map(url => ({ type: "image", url }))
  images[2].data = { hProperties: { id: "plot", className: ["existing"] } }
  diagramAnchors({ markdownAST: { children: [{ children: images }] } })
  assert.deepEqual(images.map(image => image.data.hProperties.id), ["diagram-stack", "diagram-stack-2", "plot"])
  assert.deepEqual(images[2].data.hProperties.className, ["existing"])
})

test("사진과 외부 SVG의 기존 마크업은 유지된다", () => {
  const images = ["image.png", "https://example.org/drawing.svg", "//example.org/x.svg"].map(url => ({ type: "image", url }))
  diagramAnchors({ markdownAST: { children: images } })
  assert.ok(images.every(image => !image.data))
})
