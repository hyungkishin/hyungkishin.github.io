const test = require("node:test")
const assert = require("node:assert/strict")
const { matchSeries, buildPostNavigation } = require("../seriesRules")

test("성능과 송금 시리즈는 측정부터 데이터 접근까지 순서대로 이어진다", () => {
  const slugs = [
    "/backend/transfer-performance/01-measurement/",
    "/backend/transfer-performance/02-jvm-execution/",
    "/backend/transfer-performance/jit-aot-linux/",
    "/backend/transfer-performance/jvm-memory/",
    "/backend/transfer-performance/gc-timeline/",
    "/backend/transfer-performance/tcp-linux/",
    "/backend/transfer-performance/03-transfer-contract/",
    "/backend/transfer-performance/04-kafka-redis/",
    "/backend/transfer-performance/05-jpa-access/",
  ]
  const posts = [...slugs].reverse().map(slug => ({
    id: slug,
    fields: { slug },
    frontmatter: { date: "2026-11-04" },
  }))
  const navigation = buildPostNavigation(posts)
  slugs.forEach((slug, index) => {
    assert.equal(matchSeries(slug)?.id, "transfer-performance")
    assert.equal(navigation.get(slug).previous?.fields.slug || null, slugs[index - 1] || null)
    assert.equal(navigation.get(slug).next?.fields.slug || null, slugs[index + 1] || null)
  })
  assert.equal(matchSeries("/backend/transfer-performance/"), undefined)
  assert.equal(matchSeries("/backend/transfer-performance/unrelated/"), undefined)
})

test("브라우저가 송금 시리즈의 HTML과 그림 제어를 직접 연다", () => {
  const config = require("../../../gatsby-config")
  const catchLinks = require("gatsby-plugin-catch-links/gatsby-node")
  const plugin = config.plugins.find(entry => entry.resolve === "gatsby-plugin-catch-links")
  const options = { ...plugin.options }
  catchLinks.onPreInit({}, options)
  const excluded = new RegExp(options.excludePattern)

  assert.equal(excluded.test("/backend/transfer-performance/"), true)
  assert.equal(excluded.test("/backend/transfer-performance/02-jvm-execution/"), true)
  assert.equal(excluded.test("/backend/kotlin/basic/"), false)
})
